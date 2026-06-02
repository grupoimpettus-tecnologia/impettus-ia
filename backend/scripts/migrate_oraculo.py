"""
migrate_oraculo.py
──────────────────
Migra os documentos do Oráculo SQLite (V2) para o Supabase (Impettus IA).

O que faz:
  1. Lê oraculo_espetto_textos.sqlite (2.703 docs, 81 lojas)
  2. Cria as 81 lojas no Supabase (idempotente — não duplica)
  3. Para cada documento:
     - cria registro em documents
     - faz chunking (1500 chars / 220 overlap)
     - gera embeddings em batch via OpenAI
     - insere chunks na tabela chunks
  4. Resumível: documentos já importados são pulados pelo hash

Uso (a partir da pasta backend/):
  python scripts/migrate_oraculo.py
  python scripts/migrate_oraculo.py --dry-run        # só lê, não grava
  python scripts/migrate_oraculo.py --limit 50       # testa com 50 docs
  python scripts/migrate_oraculo.py --no-embed       # importa sem embeddings
  python scripts/migrate_oraculo.py --batch-size 30  # tamanho do lote de embed
"""

import sys
import os
import uuid
import argparse
import sqlite3
import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# ── Path setup ────────────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from app.core.config import settings
from app.db.supabase_client import get_client, reset_client
from app.services.chunker import chunk_text
from app.services.embedder import embed_batch

# ── Constantes ────────────────────────────────────────────────────────────────
SQLITE_PATH = (
    BACKEND_DIR.parent
    / "oraculo_espetto_v2_extrator"
    / "oraculo_espetto_v2_extrator"
    / "base_extraida"
    / "oraculo_espetto_textos.sqlite"
)

BRAND_ID   = "fd9f9c28-597f-4ad4-ac4f-d300842f523c"
BRAND_NAME = "Espetto Carioca"

CHUNK_SIZE    = 1500
CHUNK_OVERLAP = 220
EMBED_BATCH   = 50    # chunks por chamada à API OpenAI (evita exceder limite do request)
MAX_CHUNKS    = 800   # teto de segurança por documento


# ── Mapeamento tipo → categoria ───────────────────────────────────────────────
def map_category(tipo: str) -> str:
    if not tipo:
        return "Outros"
    t = tipo.strip()
    if "Contrato" in t:
        return "Contratos"
    if any(k in t for k in ("Distrato", "Aditivo", "Procura", "Notifica")):
        return "Jurídico"
    if "Laudo" in t:
        return "Operacional"
    if "Fiscal" in t:
        return "Financeiro"
    if any(k in t for k in ("Manual", "Processo", "Procedimento")):
        return "Operacional"
    return "Outros"


# ── Helpers Supabase ──────────────────────────────────────────────────────────
def load_existing_stores() -> Dict[str, str]:
    """Retorna dict {NOME_UPPER: store_id} das lojas já cadastradas."""
    sb = get_client()
    rows = (sb.table("stores")
              .select("id,name")
              .eq("brand_id", BRAND_ID)
              .execute()).data or []
    return {r["name"].upper(): r["id"] for r in rows}


def ensure_store(name: str, store_cache: Dict[str, str], dry_run: bool) -> Optional[str]:
    key = name.strip().upper()
    if key in store_cache:
        return store_cache[key]

    import re
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    store_id = str(uuid.uuid4())

    if not dry_run:
        sb = get_client()
        try:
            res = (sb.table("stores").insert({
                "id":         store_id,
                "name":       name.strip(),
                "slug":       slug,
                "brand_id":   BRAND_ID,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute())
            if res.data:
                store_cache[key] = res.data[0]["id"]
                return res.data[0]["id"]
        except Exception:
            # Pode ter sido criada por outro shard em paralelo — recarrega pelo nome
            existing = (sb.table("stores").select("id,name")
                          .eq("brand_id", BRAND_ID).eq("name", name.strip())
                          .execute()).data or []
            if existing:
                store_cache[key] = existing[0]["id"]
                return existing[0]["id"]

    store_cache[key] = store_id
    return store_id


def _doc_key(store_id: Optional[str], file_hash: str) -> str:
    """Chave de identidade por CONTEÚDO: loja + hash do arquivo.
    Arquivos byte-idênticos na mesma loja não duplicam; arquivos diferentes
    com o mesmo nome NÃO são fundidos (preserva documentos distintos)."""
    return f"{store_id or ''}||{(file_hash or '').strip()}"


def _shard_of(key: str, shards: int) -> int:
    """Hash ESTÁVEL (md5) da chave -> shard. Chaves iguais caem sempre no mesmo
    shard, garantindo que a deduplicação por (nome, loja) continue funcionando
    mesmo com vários processos em paralelo (zero duplicatas por construção)."""
    return int(hashlib.md5(key.encode("utf-8")).hexdigest(), 16) % shards


def load_existing_docs() -> set:
    """Conjunto de chaves de conteúdo (store_id||hash) já importadas (resumibilidade)."""
    sb = get_client()
    keys = set()
    offset, page = 0, 1000
    while True:
        rows = (sb.table("documents")
                  .select("store_id,source_hash")
                  .eq("brand_id", BRAND_ID)
                  .not_.is_("source_hash", "null")
                  .range(offset, offset + page - 1)
                  .execute()).data or []
        for r in rows:
            keys.add(_doc_key(r.get("store_id"), r.get("source_hash", "")))
        if len(rows) < page:
            break
        offset += page
    return keys


def insert_document(doc: dict, dry_run: bool) -> bool:
    if dry_run:
        return True
    sb = get_client()
    try:
        sb.table("documents").insert(doc).execute()
        return True
    except Exception as e:
        print(f"    insert doc falhou: {str(e)[:200]}")
        return False


def insert_chunks(chunks: list, dry_run: bool):
    if dry_run or not chunks:
        return
    # Insere em lotes de 100; reconecta e tenta de novo em caso de blip de rede
    for i in range(0, len(chunks), 100):
        batch = chunks[i:i+100]
        for attempt in (1, 2, 3):
            try:
                get_client().table("chunks").insert(batch).execute()
                break
            except Exception:
                if attempt == 3:
                    raise
                reset_client()
                time.sleep(2)


# ── Loop principal ────────────────────────────────────────────────────────────
def migrate(args):
    dry_run   = args.dry_run
    limit     = args.limit
    no_embed  = args.no_embed
    batch_sz  = args.batch_size
    shards    = max(1, args.shards)
    shard_id  = args.shard_id

    print("=" * 70)
    print("MIGRACAO ORACULO -> IMPETTUS IA")
    print(f"Marca:    {BRAND_NAME} ({BRAND_ID})")
    print(f"SQLite:   {SQLITE_PATH}")
    print(f"Dry-run:  {dry_run}")
    print(f"Limite:   {limit or 'todos'}")
    print(f"Embeds:   {'NÃO' if no_embed else 'SIM'}")
    print(f"Shard:    {shard_id} de {shards}")
    print("=" * 70)

    if not SQLITE_PATH.exists():
        print(f"\nERRO: SQLite não encontrado em:\n  {SQLITE_PATH}")
        sys.exit(1)

    # ── 1. Conecta SQLite ─────────────────────────────────────────────────────
    con = sqlite3.connect(str(SQLITE_PATH))
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    sql = """
        SELECT id, marca, loja, tipo_documento, nome_arquivo, extensao,
               caminho_completo, tamanho_bytes, modificado_em, hash_arquivo,
               qtd_paginas, qtd_caracteres, texto_extraido, extraido_em
        FROM documentos
        WHERE status = 'OK'
          AND qtd_caracteres > 0
          AND texto_extraido IS NOT NULL
        ORDER BY id
    """
    if limit:
        sql += f" LIMIT {limit}"

    rows = cur.execute(sql).fetchall()
    total_docs = len(rows)
    print(f"\nDocumentos no SQLite (OK): {total_docs}")

    # ── 2. Cria/carrega lojas ─────────────────────────────────────────────────
    print("\nCarregando lojas existentes no Supabase...")
    store_cache = load_existing_stores()
    print(f"  Lojas já cadastradas: {len(store_cache)}")

    lojas_unicas = sorted({str(r["loja"] or "").strip() for r in rows if r["loja"]})
    novas_lojas = [l for l in lojas_unicas if l.upper() not in store_cache]
    print(f"  Lojas únicas no SQLite: {len(lojas_unicas)}")
    print(f"  Lojas a criar: {len(novas_lojas)}")

    for nome in novas_lojas:
        if nome and nome.upper() not in ("PPP_REDE", "RAIZ ESPETTO"):
            ensure_store(nome, store_cache, dry_run)
            print(f"  {'[DRY]' if dry_run else '✓'} Loja: {nome}")

    # ── 3. Docs já importados (resumibilidade) ────────────────────────────────
    print("\nCarregando docs já importados (nome+loja)...")
    existing_docs = load_existing_docs() if not dry_run else set()
    print(f"  Já importados: {len(existing_docs)}")

    # ── 4. Loop de importação ─────────────────────────────────────────────────
    print(f"\nIniciando importação de {total_docs} documentos...\n")

    ok = 0
    pulados = 0
    erros = 0
    fora_shard = 0
    total_chunks = 0
    t_start = time.time()

    for idx, row in enumerate(rows, 1):
        nome       = str(row["nome_arquivo"] or "")
        loja       = str(row["loja"] or "").strip()
        tipo       = str(row["tipo_documento"] or "")
        texto      = str(row["texto_extraido"] or "")
        tamanho    = int(row["tamanho_bytes"] or 0)
        qtd_pags   = int(row["qtd_paginas"] or 0)
        file_hash  = str(row["hash_arquivo"] or "")

        category = map_category(tipo)
        store_id = store_cache.get(loja.upper()) if loja else None
        key      = _doc_key(store_id, file_hash)

        # Sharding: este processo só cuida das chaves do seu shard
        if shards > 1 and _shard_of(key, shards) != shard_id:
            fora_shard += 1
            continue

        # Pula já importados (mesmo conteúdo na mesma loja)
        if key in existing_docs:
            pulados += 1
            continue

        # Chunking
        chunks_text = chunk_text(texto, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP)
        if len(chunks_text) > MAX_CHUNKS:
            chunks_text = chunks_text[:MAX_CHUNKS]

        # Embeddings em lotes (uma chamada à API por EMBED_BATCH chunks)
        if no_embed or not chunks_text:
            embeddings: List[Optional[List[float]]] = [None] * len(chunks_text)
        else:
            embeddings = []
            for bi in range(0, len(chunks_text), batch_sz):
                embeddings.extend(embed_batch(chunks_text[bi:bi + batch_sz]))
        while len(embeddings) < len(chunks_text):
            embeddings.append(None)
        has_embeddings = any(e is not None for e in embeddings)

        # Registro de documento (espelha o fluxo de upload do app)
        doc_id = str(uuid.uuid4())
        doc_record = {
            "id":            doc_id,
            "name":          nome,
            "category":      category,
            "allowed_roles": [],
            "size_kb":       tamanho // 1024,
            "pages":         qtd_pags,
            "embedded":      has_embeddings,
            "brand_id":      BRAND_ID,
            "store_id":      store_id,
            "source_hash":   file_hash or None,
            "uploaded_by":   "Migração Oráculo",
            "created_at":    datetime.now(timezone.utc).isoformat(),
        }

        if not insert_document(doc_record, dry_run):
            erros += 1
            print(f"  ERRO ao inserir doc: {nome}")
            continue

        if not chunks_text:
            existing_docs.add(key)
            ok += 1
            continue

        # Registros de chunks (embedding só quando existir, como no upload)
        chunk_records = []
        for c_text, c_emb in zip(chunks_text, embeddings):
            rec = {
                "id":            str(uuid.uuid4()),
                "doc_id":        doc_id,
                "text":          c_text,
                "allowed_roles": [],
                "brand_id":      BRAND_ID,
                "store_id":      store_id,
                "created_at":    datetime.now(timezone.utc).isoformat(),
            }
            if c_emb is not None:
                rec["embedding"] = c_emb
            chunk_records.append(rec)

        try:
            insert_chunks(chunk_records, dry_run)
        except Exception as e:
            # Rollback do doc para manter consistência e permitir reprocesso no rerun
            erros += 1
            print(f"  ERRO chunks de '{nome}': {str(e)[:150]} -> rollback doc")
            if not dry_run:
                try:
                    get_client().table("chunks").delete().eq("doc_id", doc_id).execute()
                    get_client().table("documents").delete().eq("id", doc_id).execute()
                except Exception:
                    pass
            continue

        # Só marca como importado após doc + chunks confirmados
        existing_docs.add(key)
        total_chunks += len(chunk_records)
        ok += 1

        # Progress
        if idx % 10 == 0 or idx == total_docs:
            elapsed = time.time() - t_start
            rate = ok / elapsed if elapsed > 0 else 0
            remaining = (total_docs - idx) / shards
            eta  = int(remaining / rate) if rate > 0 else 0
            print(
                f"  [{idx:>4}/{total_docs}] ok={ok} pulados={pulados} fora={fora_shard}"
                f" erros={erros} chunks={total_chunks}  {rate:.2f}doc/s  ETA~{eta//60}m{eta%60:02d}s"
            )

    # ── 5. Resumo final ───────────────────────────────────────────────────────
    elapsed_total = time.time() - t_start
    print("\n" + "=" * 70)
    print("MIGRAÇÃO CONCLUÍDA")
    print(f"  Shard:                  {shard_id} de {shards}")
    print(f"  Documentos importados:  {ok}")
    print(f"  Pulados (já existiam):  {pulados}")
    print(f"  Fora do shard:          {fora_shard}")
    print(f"  Erros:                  {erros}")
    print(f"  Chunks gerados:         {total_chunks}")
    print(f"  Lojas criadas/cache:    {len(store_cache)}")
    print(f"  Tempo total:            {int(elapsed_total//60)}m{int(elapsed_total%60):02d}s")
    if dry_run:
        print("\n  [DRY-RUN] Nenhum dado foi gravado no Supabase.")
    print("=" * 70)
    con.close()

    # Sinaliza conclusão deste shard (watcher detecta fim do conjunto paralelo)
    if shards > 1 and not dry_run:
        try:
            (BACKEND_DIR / "scripts" / f".shard_done_{shard_id}").write_text(
                f"ok docs={ok} chunks={total_chunks} erros={erros}", encoding="utf-8")
        except Exception:
            pass


# ── Entrypoint ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migra Oráculo SQLite → Supabase")
    parser.add_argument("--dry-run",    action="store_true", help="Simula sem gravar")
    parser.add_argument("--limit",      type=int, default=0, help="Limita número de docs")
    parser.add_argument("--no-embed",   action="store_true", help="Importa sem gerar embeddings")
    parser.add_argument("--batch-size", type=int, default=EMBED_BATCH, help="Chunks por lote de embed")
    parser.add_argument("--shards",     type=int, default=1, help="Total de shards (processos paralelos)")
    parser.add_argument("--shard-id",   type=int, default=0, help="ID deste shard (0..shards-1)")
    args = parser.parse_args()
    migrate(args)

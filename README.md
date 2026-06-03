# Impettus IA — V12.0

Central Inteligente de Conhecimento para o Grupo Impettus.

## Destaques da V12.0 (atual)

- **`start.py` unificado** — `python start.py` detecta portas livres automaticamente, atualiza `frontend/.env`, sobe backend + frontend e abre o browser; Ctrl+C encerra tudo
- **Bug fix: MarcaPage resiliente** — `Promise.allSettled` + `try/catch` individuais: falha em um endpoint não impede os demais de carregar (lojas, docs, usuários, stats)
- **Bug fix: URL `/faq` corrigida** — endpoint estava sendo chamado como `/faqs` (inexistente), FAQs de marca agora carregam corretamente
- **Bug fix: `_ensure_admin()` com hash repair** — se o hash da senha do admin estiver corrompido (troca de algoritmo, migração), é redefinido automaticamente no startup sem intervenção manual

## Inicialização rápida (V12+)

```bat
python start.py
```

Detecta portas livres a partir de 8000 (backend) e 5173 (frontend), escreve `frontend/.env` com a URL correta e abre o browser automaticamente.

## Destaques da V3.0 (histórico)

- **Supabase como backend de dados** — PostgreSQL + pgvector em nuvem, sem JSON local
- **Multi-tenancy completo** — Grupo → Marca (brand_id) → Loja (store_id) → Documentos/Chunks
- **Portal do Franqueado** — cada marca tem seu portal com Documentos, Usuários, FAQ e Lojas
- **Base de conhecimento por loja** — cascata de visibilidade: loja vê docs da loja + da marca + do grupo
- **Importação inteligente de rede de lojas** — pasta da marca com subpastas (nível 1 = lojas, nível 2 = categorias)
- **Auto-criação de lojas** via `/stores/ensure` (idempotente)
- **Endpoints `/stores`** — GET, POST, POST `/ensure`, DELETE
- **Retriever com store_id** — busca semântica e BM25 filtradas por loja
- **Fix timeout Supabase free tier** — queries de chunks substituídas por documents; try/except em todos os contadores
- **Reset automático do cliente Supabase** após RemoteProtocolError/timeout
- **Fontes citadas otimizadas** — usa tabela `documents` em vez de scan de chunks (sem timeout)
- **Paginação nas fontes** — renderiza 50 por vez com busca por nome/categoria

## Destaques das versões anteriores

### V2.0
- Embeddings reais (text-embedding-3-small)
- Permissões por documento (allowed_roles)
- pgvector para busca semântica

### V1.2
- JWT real com expiração de 8h
- Cadastro de usuários com perfis
- Histórico de conversas
- FAQ, Departamentos, Logs do sistema

### V1.1
- Identidade visual Impettus (dark + laranja)
- Upload de documentos com categoria
- Chat com fontes citadas
- Suporte a XLSX/XLSM/PDF/DOCX

## Login inicial

```text
Usuário: admin@impettus.local
Senha: Admin@123
```

## Variáveis de ambiente

Copie `.env.example` para `.env` e configure:

```env
APP_NAME=Impettus IA
ENVIRONMENT=local
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
ADMIN_EMAIL=admin@impettus.local
ADMIN_PASSWORD=Admin@123

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...   # recomendado em produção
```

## Rodar no Windows

Abra dois terminais:

### Backend

```bat
scripts\run_backend_windows.bat
```

### Frontend

```bat
scripts\run_frontend_windows.bat
```

Acesse: `http://localhost:5173`

## Rodar com Docker

```bash
docker compose up --build
```

## Estrutura de pastas para importação de rede de lojas

```
ESPETTO CARIOCA/          <- pasta raiz da marca
  AEROTOWN/               <- loja (nível 1)
    Contratos/            <- categoria (nível 2)
      contrato.pdf
    Financeiro/
      relatorio.xlsx
  COPACABANA/
    Operacional/
      manual.pdf
```

A importação cria automaticamente as lojas e indexa os documentos com brand_id + store_id.

## Arquitetura

- **Backend**: FastAPI + Python 3.11
- **Frontend**: React (Vite) — single file `main.jsx`
- **Banco**: Supabase (PostgreSQL + pgvector)
- **IA**: OpenAI embeddings + GPT-4.1-mini
- **Autenticação**: JWT (python-jose)

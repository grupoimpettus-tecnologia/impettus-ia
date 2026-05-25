# Impettus IA — V3.0

Central Inteligente de Conhecimento para o Grupo Impettus.

## Destaques da V3.0 (atual)

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

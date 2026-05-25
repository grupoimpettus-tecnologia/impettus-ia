# Roadmap — Impettus IA

## ✅ V1.1 — Identidade executiva e base documental
- [x] Logo oficial Impettus (Zap icon + IMPETTUS + "be unstoppable")
- [x] Layout dark executivo
- [x] Categorias por documento (10 categorias com ícones coloridos)
- [x] Tela de fontes citadas
- [x] Extração de planilhas melhorada (openpyxl, pandas, fórmulas, abas)

## ✅ V1.2 — Segurança e gestão
- [x] JWT real (python-jose, PBKDF2-HMAC-SHA256, 480 min)
- [x] Cadastro de usuários com perfis
- [x] Perfis por área: Admin, Diretoria, Operação, Franqueado, Financeiro, TI
- [x] Auditoria de perguntas e respostas (histórico de conversas)
- [x] FAQ com categorias e filtro por aba
- [x] Departamentos, Logs do sistema, Histórico de conversas
- [x] Importação de pasta (múltiplos arquivos de uma vez)

## ✅ V2.0 — Motor RAG semântico e permissões
- [x] Embeddings reais via OpenAI text-embedding-3-small
- [x] Retriever híbrido: busca semântica (cosine similarity) com fallback BM25 lexical
- [x] Permissões por documento — controle de acesso por perfil
- [x] Filtro de chunks por role do usuário logado na recuperação
- [x] Badge "IA" nos documentos indexados com embedding
- [x] SettingsPage com status real do sistema e roadmap

> **Nota:** Supabase PostgreSQL + pgvector são a evolução natural da V3.
> Os embeddings estão armazenados em `chunks.json` (JSON file store) para V2.
> A migração para pgvector mantém o mesmo modelo lógico já implementado.

## ⏳ V3 — Portal do franqueado
- [ ] Login por franqueado (subdomínio / tenant)
- [ ] Base por marca
- [ ] Base por loja
- [ ] Respostas com trilha de fonte (citação com número de página real)
- [ ] Supabase PostgreSQL + pgvector (migração do file store)

## ⏳ V4 — Integrações
- [ ] Sults
- [ ] BI/CMV/Vendas
- [ ] WhatsApp
- [ ] Relatórios executivos automáticos

# Mini-planet Voxel

Pequenos planetas de **voxel** gerados proceduralmente — para editar bloco a bloco e compartilhar.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · three.js + @react-three/fiber + drei · Drizzle ORM + PostgreSQL (Supabase em produção) · GitHub Actions · Vercel

---

## O fluxo automatizado

```
Você descreve a feature ──> Eu codifico neste ambiente ──> git push (GitHub)
                                                              │
                ┌─────────────────────────────────────────────┼──────────────────────────────┐
                ▼                                             ▼                              ▼
        GitHub Actions (CI)                             Vercel (deploy)              GitHub Actions (DB)
        typecheck + build                          push na main = deploy        schema.ts mudou? drizzle-kit
        em cada commit                             automático em produção       push aplica no Supabase
```

Depois da configuração inicial (uma vez só), **nenhum passo manual é necessário**: cada sessão termina com push, cada push vira deploy, e cada mudança de schema é aplicada no Supabase automaticamente.

---

## Configuração inicial (uma vez, ~6 minutos)

### 1. GitHub — criar o repositório e conectar este ambiente

1. Crie um repositório **vazio** chamado `mini-planet-voxel` em [github.com/new](https://github.com/new) (não marque "Add README").
2. Crie um *fine-grained Personal Access Token* (passo a passo detalhado em [TUTORIAL.md](TUTORIAL.md), Parte 2):
   - **Repository access:** apenas `mini-planet-voxel`
   - **Permissions:** `Contents: Read and Write` **e** `Workflows: Read and Write`
3. Adicione **dois secrets neste ambiente de desenvolvimento** (painel de secrets do sandbox):
   - `GITHUB_TOKEN` = o token criado
   - `GITHUB_REPO` = `seu-usuario/mini-planet-voxel`
4. Na próxima conversa, me peça para "conectar o GitHub" — eu rodo `bash scripts/connect-github.sh`, que cria o repo (se faltar), conecta o `origin` e faz o primeiro push.

> Prefere fazer da sua máquina? Clone este código ou rode manualmente:
> `git remote add origin https://github.com/<usuario>/mini-planet-voxel.git && git push -u origin main`

### 2. Supabase — banco de dados de produção

1. Crie um projeto em [supabase.com](https://supabase.com) (anote a senha do banco!).
2. No dashboard, clique em **Connect** e copie as duas URLs do pooler:
   - **Transaction Pooler** (porta **6543**) → runtime do app
   - **Session Pooler** (porta **5432**) → migrações de schema

### 3. Vercel — deploy automático

1. Em [vercel.com/new](https://vercel.com/new), escolha **Import Git Repository** e selecione `mini-planet-voxel`.
2. Antes do primeiro deploy, adicione a Environment Variable:
   - `DATABASE_URL` = URL do **Transaction Pooler** (porta 6543)
3. Clique em **Deploy**. Pronto: todo push na `main` vira deploy de produção, e todo PR ganha um preview automático.

### 4. GitHub Actions — aplicar o schema no Supabase sozinho

1. No repo: **Settings → Secrets and variables → Actions → New repository secret**
   - `DATABASE_URL` = URL do **Session Pooler** (porta 5432)
2. A partir daí, qualquer push na `main` que altere `src/db/schema.ts` roda `drizzle-kit push --force` contra o Supabase automaticamente. Dá também para rodar manualmente na aba **Actions → DB · Aplicar schema no Supabase → Run workflow**.

---

## Como trabalhamos nas próximas conversas

- **Fim de sessão:** eu commito tudo e envio com `bash scripts/push.sh "mensagem"` (precisa do `GITHUB_TOKEN` configurado no ambiente).
- **Mudança de schema:** eu edito `src/db/schema.ts`, faço push, e a Action aplica no Supabase sem nenhum comando seu.
- **Sem token configurado:** eu te entrego os comandos prontos para colar no seu terminal.

## Comandos úteis

```bash
npm run dev                    # desenvolvimento local
npm run build                  # build de produção
npx tsc --noEmit               # typecheck
npx drizzle-kit push           # aplica schema no DATABASE_URL atual
bash scripts/connect-github.sh # conecta o repositório ao GitHub
bash scripts/push.sh "msg"     # commit + push da sessão
```

## Estrutura

```
├── .github/workflows/
│   ├── ci.yml              # typecheck + build em cada push/PR
│   └── db-migrate.yml      # aplica schema no Supabase quando schema.ts muda
├── scripts/
│   ├── connect-github.sh   # cria repo, conecta origin, primeiro push
│   └── push.sh             # commit + push do fim de sessão
├── src/
│   ├── app/                # App Router (landing + api/health)
│   ├── components/         # cena 3D do mini-planeta (three.js)
│   └── db/
│       ├── index.ts        # conexão (SSL automático fora de localhost)
│       └── schema.ts       # tabelas: planets, voxels
├── drizzle.config.ts       # lê DATABASE_URL do ambiente
└── vercel.json             # build & install commands
```

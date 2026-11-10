# Tutorial: conectando GitHub, Supabase e Vercel

> Feito para quem **nunca usou** essas ferramentas. Cada passo tem o clique exato.
> Tempo total: ~15 minutos, **uma vez só**. Nada para instalar no seu computador — tudo pelo navegador.

## O que estamos montando (e por quê)

```
Este ambiente (onde eu programo)
        │  push
        ▼
     GitHub  ────────── guarda o código e dispara os robôs
        │
        ├──────────────▶ Vercel  ── monta o site e publica (deploy)
        │
        └──────────────▶ Supabase ── recebe as tabelas do banco de dados
```

- **GitHub** = a pasta central do código. Tudo que eu faço termina lá.
- **Vercel** = olha o GitHub; a cada atualização, publica o site sozinha.
- **Supabase** = o banco de dados na nuvem (onde os planetas e voxels vão morar).

Ao final, o ciclo fica 100% automático: **eu codifico → GitHub → Vercel publica → Supabase atualizado.**

---

## Antes de começar

- Contas criadas nas 3 plataformas (você já tem).
- Abra um **bloco de notas** — vamos guardar 3 textos ali: uma senha e duas URLs.
- Regra de ouro: **nunca cole senhas ou tokens no chat.** Eles vão em caixas específicas que indico abaixo.

---

## Parte 1 — GitHub: criar o repositório (a casa do código)

1. Acesse **https://github.com/new** (logado).
2. Em **Repository name**, digite exatamente: `mini-planet-voxel`
3. Deixe **Private** marcado (recomendado).
4. **Importante:** deixe **desmarcado** "Add a README file" — o repositório precisa nascer **vazio**, porque já temos arquivos prontos para enviar.
5. Clique no botão verde **Create repository**.
6. Pronto. Anote no bloco de notas o endereço que aparece no topo, no formato:
   `seu-usuario/mini-planet-voxel` (vamos chamar isso de **GITHUB_REPO**).

## Parte 2 — GitHub: criar a chave de acesso (token)

O token é uma "chave" que me permite enviar código para o SEU repositório, sem nunca precisar da sua senha.

1. Acesse **https://github.com/settings/personal-access-tokens**
   (se preferir navegar: foto do perfil (canto superior direito) → **Settings** → no menu esquerdo, lá embaixo, **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**)
2. Preencha:
   - **Token name:** `mini-planet-voxel-push`
   - **Expiration:** 90 days (anote a data — quando vencer, repetimos esta parte)
   - **Repository access:** escolha **Only select repositories** → selecione `mini-planet-voxel`
3. Em **Permissions**, abra **Repository permissions** e ajuste **duas** linhas:
   - **Contents** → mude para **Read and write**
   - **Workflows** → mude para **Read and write**
   *(Contents deixa eu enviar o código; Workflows é obrigatório porque nosso projeto inclui os robôs de automação do GitHub.)*
4. Desça e clique em **Generate token**.
5. **COPIE O TOKEN AGORA** (começa com `github_pat_...`). Ele aparece **uma única vez**. Guarde no bloco de notas com a etiqueta **GITHUB_TOKEN**.

## Parte 3 — Entregar a chave neste ambiente de desenvolvimento

Agora precisamos colocar duas informações como **secrets** (variáveis sensíveis) neste ambiente onde eu trabalho:

- `GITHUB_TOKEN` = o token da Parte 2
- `GITHUB_REPO` = `seu-usuario/mini-planet-voxel` da Parte 1

**Onde:** procure na interface deste ambiente/plataforma de desenvolvimento por **Secrets**, **Environment Variables** ou **Variáveis de ambiente** (normalmente nas configurações do projeto/sandbox) e adicione os dois pares nome → valor.

> **Não achou onde colocar?** Me avise no chat que eu te passo um plano B (um comando único que você roda no seu computador, ou outro caminho de autenticação).

Quando os dois secrets estiverem salvos, venha ao chat e me diga:

> **"conecta o GitHub"**

Eu mesmo crio/conecto o repositório e faço o primeiro push. Você só acompanha.

## Parte 4 — Supabase: o banco de dados

1. Acesse **https://supabase.com/dashboard** e clique em **New project**.
2. Escolha sua **Organization** (já existe uma criada por padrão).
3. Preencha:
   - **Name:** `mini-planet-voxel`
   - **Database password:** clique em **Generate a password** e **COPIE essa senha para o bloco de notas** (etiqueta: SENHA DO BANCO). Sem ela, as URLs daqui pra frente não funcionam.
   - **Region:** se aparecer **South America (São Paulo)**, escolha ela; senão, a mais próxima.
4. Clique em **Create new project** e aguarde ~2 minutos (o projeto está sendo provisionado).
5. Com o projeto aberto, clique no botão **Connect** (barra superior do Supabase).
6. Na janela que abre, procure a seção de **connection string** e copie **duas** URLs para o bloco de notas:
   - **Transaction pooler** (a URL termina com **:6543/postgres**) → etiquete como **URL APP (6543)**
   - **Session pooler** (termina com **:5432/postgres**, mas o host é `...pooler.supabase.com`) → etiquete como **URL MIGRAÇÃO (5432)**
7. **Passo crucial:** nos dois textos copiados, substitua o trecho `[YOUR-PASSWORD]` pela **senha do banco** que você anotou no passo 3.

Exemplo de como fica (fictício):
```
URL APP (6543):      postgresql://postgres.abcdefgh:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
URL MIGRAÇÃO (5432): postgresql://postgres.abcdefgh:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

## Parte 5 — Vercel: o site no ar

1. Acesse **https://vercel.com/login** e entre com **Continue with GitHub** (assim a Vercel já enxerga seus repositórios; autorize quando o GitHub perguntar).
2. No dashboard, clique em **Add New... → Project**.
3. Em **Import Git Repository**, encontre `mini-planet-voxel` e clique em **Import**.
   - Se ele não aparecer: clique em **Adjust GitHub App Permissions** e autorize a Vercel a acessar o repositório, depois volte.
4. Na tela **Configure Project**:
   - **Framework Preset** já vem como Next.js — não mexa.
   - Abra a seção **Environment Variables** e adicione:
     - **Name:** `DATABASE_URL`
     - **Value:** sua **URL APP (6543)** (aquela com a senha já trocada)
     - Clique em **Add**.
5. Clique em **Deploy** e aguarde 1–2 minutos.
6. Quando aparecer a tela de sucesso, clique em **Continue to Dashboard** e depois no endereço `seu-projeto.vercel.app` — o Mini-planet Voxel está no ar!

> **Esqueceu a variável e o deploy falhou?** Sem pânico: no projeto da Vercel, vá em **Settings → Environment Variables**, adicione `DATABASE_URL`, e depois em **Deployments → ⋯ → Redeploy**.

## Parte 6 — GitHub Actions: o robô que atualiza o Supabase

Última peça: uma caixinha de segredo dentro do GitHub, usada pelo robô que aplica as tabelas no Supabase.

1. Abra seu repositório: `https://github.com/seu-usuario/mini-planet-voxel`
2. Clique na aba **Settings** (engrenagem, no topo do repo).
3. No menu esquerdo, em **Security**, clique em **Secrets and variables → Actions**.
4. Clique no botão verde **New repository secret**.
5. Preencha:
   - **Name:** `DATABASE_URL` (exatamente assim, maiúsculo)
   - **Secret:** sua **URL MIGRAÇÃO (5432)** (com a senha já trocada)
6. **Add secret**. Fim da parte manual!

## Parte 7 — Testando tudo junto

1. Me chame no chat: **"conecta o GitHub e faz o push"** — em segundos o código sobe.
2. **Ver o CI:** no repo, aba **Actions** → aparece uma execução "Typecheck + Build" (bolinha amarela → vira check verde).
3. **Ver o deploy:** na Vercel, aba **Deployments** → status **Ready**. Clique no link e veja o planeta girando.
4. **Testar o robô do banco:** no repo, **Actions → DB · Aplicar schema no Supabase → Run workflow → Run workflow**. Quando ficar verde, abra o Supabase → **Table Editor** (menu esquerdo) — as tabelas `planets` e `voxels` estarão lá.

A partir daí, **nunca mais toca em nada disso**: cada conversa termina com push, o site se atualiza sozinho, e mudanças de banco são aplicadas pelo robô.

---

## Erros comuns (e como resolver)

| Sintoma | Causa provável | Solução |
|---|---|---|
| Push recusado com erro mencionando "workflow" | Faltou a permissão **Workflows** no token | Refaça a Parte 2 incluindo as duas permissões; atualize o secret |
| Erro HTTP 403/404 ao conectar | Token errado ou repo inexistente | Confira `GITHUB_TOKEN` e `GITHUB_REPO`; crie o repo (Parte 1) |
| Action "DB" falha com erro de conexão/senha | URL errada ou `[YOUR-PASSWORD]` não trocado | Use a URL **Session (5432)** e troque a senha (Parte 4.7) |
| Action "DB" falha com erro de SSL | Conexão sem SSL | Adicione `?sslmode=require` no fim da URL do secret |
| Vercel falha ao conectar no banco | `DATABASE_URL` não configurada | Parte 5.4 → depois Redeploy |
| Site no ar mas página quebra | Deploy rodou antes da Action do banco | Rode a Action "DB" manualmente (Parte 7.4) e dê Redeploy |
| Vercel: "couldn't find a Git account for the commit author" | Commit feito com e-mail genérico, sem conta GitHub vinculada | Já corrigido: todos os commits usam o noreply email do dono da conta. Em planos Hobby a Vercel exige isso. Não precisa de upgrade Pro. |

## Cola rápida (resumo de uma página)

1. **Repo** vazio chamado `mini-planet-voxel` → github.com/new
2. **Token** fine-grained com `Contents` + `Workflows` (Read & Write) → secret `GITHUB_TOKEN` aqui no ambiente
3. `GITHUB_REPO` = `seu-usuario/mini-planet-voxel` → secret aqui no ambiente
4. **Supabase**: projeto novo → Connect → copiar URL **6543** (app) e **5432** (migração), trocando `[YOUR-PASSWORD]`
5. **Vercel**: importar o repo + env `DATABASE_URL` = URL 6543 → Deploy
6. **GitHub**: repo → Settings → Secrets → Actions → `DATABASE_URL` = URL 5432
7. Me chamar: **"conecta o GitHub"** → acompanhar os checks verdes

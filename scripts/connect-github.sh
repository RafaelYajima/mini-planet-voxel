#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# connect-github.sh — conecta este projeto ao GitHub e faz o
# primeiro push. Se o repositório não existir, tenta criar.
#
# Pré-requisitos (secrets deste ambiente):
#   GITHUB_TOKEN  -> fine-grained PAT com estas permissões no repo:
#                    Contents: Read & Write  +  Workflows: Read & Write
#   GITHUB_REPO   -> ex: "seu-usuario/mini-planet-voxel"
#
# Passo a passo completo: veja TUTORIAL.md na raiz do projeto.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${GITHUB_TOKEN:?Defina GITHUB_TOKEN nos secrets do ambiente (veja TUTORIAL.md, Parte 2 e 3).}"
: "${GITHUB_REPO:?Defina GITHUB_REPO nos secrets do ambiente, ex: usuario/mini-planet-voxel.}"

REPO_NAME="${GITHUB_REPO#*/}"
API="https://api.github.com"
AUTH_HEADER="Authorization: Bearer ${GITHUB_TOKEN}"

echo "Verificando se github.com/${GITHUB_REPO} existe..."
HTTP_CODE=$(curl -s -o /tmp/gh_repo_check.json -w "%{http_code}" \
  "${API}/repos/${GITHUB_REPO}" \
  -H "${AUTH_HEADER}" \
  -H "Accept: application/vnd.github+json")

if [ "$HTTP_CODE" = "200" ]; then
  echo "Repositório encontrado, seguindo..."
elif [ "$HTTP_CODE" = "404" ]; then
  echo "Repositório não encontrado. Tentando criar..."
  CREATE_CODE=$(curl -s -o /tmp/gh_repo_create.json -w "%{http_code}" -X POST \
    "${API}/user/repos" \
    -H "${AUTH_HEADER}" \
    -H "Accept: application/vnd.github+json" \
    -d "{\"name\":\"${REPO_NAME}\",\"private\":true,\"description\":\"Mini-planet Voxel — pequenos planetas de voxel gerados proceduralmente.\"}")

  if [ "$CREATE_CODE" = "201" ]; then
    echo "Repositório criado."
  else
    echo ""
    echo "Não consegui criar o repositório automaticamente (tokens fine-grained nem sempre têm essa permissão)."
    echo "Solução rápida:"
    echo "  1. Abra https://github.com/new"
    echo "  2. Nome do repositório: ${REPO_NAME}"
    echo "  3. NÃO marque 'Add a README' (ele precisa nascer vazio)"
    echo "  4. Clique em 'Create repository' e rode este script de novo."
    exit 1
  fi
else
  echo "Erro ao consultar o GitHub (HTTP ${HTTP_CODE})."
  echo "Confira GITHUB_TOKEN e GITHUB_REPO nos secrets do ambiente."
  exit 1
fi

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GITHUB_REPO}.git"

BRANCH="$(git branch --show-current || echo main)"
git add -A
git diff --cached --quiet || git commit -m "chore: setup inicial do Mini-planet Voxel"

# GitHub exige Basic auth (base64 de "x-access-token:TOKEN") para git over HTTPS
BASIC_AUTH=$(printf 'x-access-token:%s' "${GITHUB_TOKEN}" | base64 -w0)

echo "Enviando código para o GitHub..."
GIT_TERMINAL_PROMPT=0 git -c http.extraHeader="AUTHORIZATION: basic ${BASIC_AUTH}" push -u origin "${BRANCH}"

echo ""
echo "Conectado! Daqui em diante, todo fim de sessão: bash scripts/push.sh \"mensagem\""

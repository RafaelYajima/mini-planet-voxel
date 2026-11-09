#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# connect-github.sh — cria o repositório no GitHub (se necessário),
# conecta o remote 'origin' e faz o primeiro push.
#
# Pré-requisitos (secrets deste ambiente):
#   GITHUB_TOKEN  -> fine-grained PAT com Contents: Read & Write
#   GITHUB_REPO   -> ex: "seu-usuario/mini-planet-voxel"
# ─────────────────────────────────────────────────────────────
set -euo pipefail

: "${GITHUB_TOKEN:?Defina GITHUB_TOKEN nos secrets do ambiente.}"
: "${GITHUB_REPO:?Defina GITHUB_REPO nos secrets do ambiente (ex: usuario/mini-planet-voxel).}"

REPO_NAME="${GITHUB_REPO#*/}"

echo "Criando repositório '${GITHUB_REPO}' (se ainda não existir)..."
HTTP_CODE=$(curl -s -o /tmp/gh_repo_resp.json -w "%{http_code}" -X POST https://api.github.com/user/repos \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"name\":\"${REPO_NAME}\",\"private\":true,\"description\":\"Mini-planet Voxel — pequenos planetas de voxel gerados proceduralmente.\"}")

if [ "$HTTP_CODE" = "201" ]; then
  echo "Repositório criado."
elif [ "$HTTP_CODE" = "422" ]; then
  echo "Repositório já existe, seguindo..."
else
  echo "Falha ao criar repositório (HTTP ${HTTP_CODE})."
  cat /tmp/gh_repo_resp.json
  exit 1
fi

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GITHUB_REPO}.git"

echo "Fazendo push inicial..."
git add -A
git diff --cached --quiet || git commit -m "chore: setup inicial do Mini-planet Voxel"
git -c http.extraHeader="AUTHORIZATION: Bearer ${GITHUB_TOKEN}" push -u origin main

echo "Conectado! Próximos pushes: bash scripts/push.sh \"mensagem\""

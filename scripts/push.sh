#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# push.sh — commita tudo e envia para o GitHub.
# Uso: bash scripts/push.sh "mensagem do commit"
#
# Se GITHUB_TOKEN estiver definido nos secrets do ambiente,
# o push é autenticado via header (o token não fica salvo no remote).
# ─────────────────────────────────────────────────────────────
set -euo pipefail

MSG="${1:-chore: atualização da sessão de desenvolvimento}"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' ainda não configurado."
  echo "Rode: bash scripts/connect-github.sh  (com GITHUB_TOKEN e GITHUB_REPO definidos)"
  echo "ou configure manualmente: git remote add origin https://github.com/<usuario>/mini-planet-voxel.git"
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "Nada novo para commitar."
  exit 0
fi

git commit -m "$MSG"

BRANCH="$(git branch --show-current)"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  git -c http.extraHeader="AUTHORIZATION: Bearer ${GITHUB_TOKEN}" push -u origin "$BRANCH"
else
  git push -u origin "$BRANCH"
fi

echo "Enviado para o GitHub. CI e deploy da Vercel rodam automaticamente."

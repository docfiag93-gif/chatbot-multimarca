#!/bin/bash
# Doble clic para correr las pruebas en el navegador.
cd "$(dirname "$0")/.." || exit 1
PUERTO=8795
while lsof -i :$PUERTO >/dev/null 2>&1; do PUERTO=$((PUERTO+1)); done
echo ""; echo "  Pruebas del chatbot"; echo "  ──────────────────────────"
echo "  http://127.0.0.1:$PUERTO/pruebas/pruebas.html"; echo ""
python3 -m http.server $PUERTO --bind 127.0.0.1 >/dev/null 2>&1 &
S=$!; sleep 1
open "http://127.0.0.1:$PUERTO/pruebas/pruebas.html"
trap "kill $S 2>/dev/null; exit 0" INT TERM
wait $S

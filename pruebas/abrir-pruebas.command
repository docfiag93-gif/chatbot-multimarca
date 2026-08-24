#!/bin/bash
# Doble clic para correr las pruebas en el navegador.
#
# Usa servidor-pruebas.py, que manda `no-store` en todo. NO es un detalle: el
# navegador guarda los módulos en caché, y unas pruebas que leen la versión
# vieja de un archivo dan aprobado justo después de que alguien lo rompió —
# que es exactamente cuando uno las corre.
cd "$(dirname "$0")/.." || exit 1
PUERTO=8795
while lsof -i :$PUERTO >/dev/null 2>&1; do PUERTO=$((PUERTO+1)); done
echo ""; echo "  Pruebas del chatbot"; echo "  ──────────────────────────"
echo "  http://127.0.0.1:$PUERTO/pruebas/pruebas.html"; echo ""
python3 pruebas/servidor-pruebas.py "$PUERTO" &
S=$!
sleep 1
open "http://127.0.0.1:$PUERTO/pruebas/pruebas.html"
trap "kill $S 2>/dev/null; exit 0" INT TERM
wait $S

#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Abrir la consola — doble clic y listo
#
#  Por qué hace falta: el navegador BLOQUEA los módulos de JavaScript
#  cuando abres un archivo directamente (file://). Es una protección suya,
#  no un error nuestro, y no se puede desactivar desde el código.
#
#  Esto levanta un servidor local en tu propia Mac —nada sale a internet—
#  y abre la consola en el navegador. Para cerrarlo: Ctrl+C, o cierra
#  esta ventana.
# ════════════════════════════════════════════════════════════════════════
cd "$(dirname "$0")" || exit 1

PUERTO=8790
while lsof -i :$PUERTO >/dev/null 2>&1; do PUERTO=$((PUERTO+1)); done

echo ""
echo "  Consola de negocios"
echo "  ───────────────────────────────────────────"
echo "  Abriendo en:  http://127.0.0.1:$PUERTO/publico/index.html"
echo ""
echo "  Para cerrar:  Ctrl+C o cierra esta ventana"
echo ""

python3 -m http.server $PUERTO --bind 127.0.0.1 >/dev/null 2>&1 &
SERVIDOR=$!
sleep 1
open "http://127.0.0.1:$PUERTO/publico/index.html"

trap "kill $SERVIDOR 2>/dev/null; echo ''; echo '  Servidor cerrado.'; exit 0" INT TERM
wait $SERVIDOR

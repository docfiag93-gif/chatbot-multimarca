#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Auditoría del sitio EN VIVO
#
#  Las pruebas del navegador revisan el código de tu máquina. Esto revisa lo
#  que de verdad está publicado en internet, que no siempre es lo mismo:
#  una copia vieja en la caché puede seguir sirviéndose días después de que
#  el archivo se borró del repositorio. Así encontramos una.
#
#  Uso:  bash pruebas/auditar-sitio.sh
# ════════════════════════════════════════════════════════════════════════
SITIO="${1:-https://chatbot-multimarca.pages.dev}"
FALLOS=0

echo ""
echo "  Auditando: $SITIO"
echo "  ═══════════════════════════════════════════════════"

# Lo que NUNCA debe poder descargarse
PROHIBIDOS="anclaje cerebro politicas acciones proveedores datos supabase entorno enlaces seguridad diagnostico avisos"
echo ""
echo "  Módulos del servidor (no deben servirse):"
for f in $PROHIBIDOS; do
  cuerpo=$(curl -s "$SITIO/cerebro/$f.mjs" 2>/dev/null | head -c 40)
  case "$cuerpo" in
    "<!doctype html>"*|"<!DOCTYPE html>"*|"") echo "    ok   $f.mjs" ;;
    *) echo "    ⚠️   $f.mjs SE DESCARGA"; FALLOS=$((FALLOS+1)) ;;
  esac
done

# Ningún archivo público debe contener texto de prompt
echo ""
echo "  Texto de prompts en archivos públicos:"
PUBLICOS="perfil catalogos-ui cifrado semillas marcas"
PATRONES="NO diagnosticas|NO recetas|signos vitales|no interpretas resultados"
for f in $PUBLICOS; do
  if curl -s "$SITIO/cerebro/$f.mjs" 2>/dev/null | grep -qE "$PATRONES"; then
    echo "    ⚠️   $f.mjs CONTIENE PROMPT"; FALLOS=$((FALLOS+1))
  else
    echo "    ok   $f.mjs"
  fi
done

# Copias viejas atoradas en la caché
echo ""
echo "  Caché del borde (una copia vieja tarda en irse):"
for f in $PROHIBIDOS marcas; do
  edad=$(curl -sI "$SITIO/cerebro/$f.mjs" 2>/dev/null | grep -i "^age:" | tr -d '\r' | awk '{print $2}')
  if [ -n "$edad" ] && [ "$edad" -gt 3600 ] 2>/dev/null; then
    echo "    ⚠️   $f.mjs cacheado hace $((edad/3600)) h"; FALLOS=$((FALLOS+1))
  fi
done
[ $FALLOS -eq 0 ] && echo "    ok   sin copias viejas"

# El servidor responde
echo ""
echo "  Servidor:"
ping=$(curl -s "$SITIO/api/bot?ping=1" 2>/dev/null)
echo "$ping" | grep -q '"ok":true' && echo "    ok   /api/bot responde" \
  || { echo "    ⚠️   /api/bot no responde"; FALLOS=$((FALLOS+1)); }
echo "$ping" | grep -q '"listo":true' && echo "    ok   configuración completa" \
  || echo "    ·    faltan llaves (esperado hasta que las cargues)"

echo ""
echo "  ═══════════════════════════════════════════════════"
[ $FALLOS -eq 0 ] && echo "  ✅ Sin hallazgos" || echo "  ⚠️  $FALLOS hallazgo(s)"
echo ""
exit $FALLOS

#!/usr/bin/env python3
# Prueba de las banderas rojas de seguridad.mjs.
#
# Existe porque en esta Mac no hay Node: las expresiones se extraen del
# archivo .mjs y se corren en Python, que para estos patrones se comporta
# igual. No es un sustituto de probarlo en el navegador, pero atrapa lo
# que importa: que una frase de urgencia NO dispare.
#
#   python3 chatbot/pruebas/probar_banderas.py
#
# Al agregar un patrón nuevo, agrega también la frase aquí abajo.

import re, unicodedata, sys

import os
AQUI = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(AQUI, '..', 'servidor', 'nucleo', 'seguridad.mjs'), encoding='utf-8').read()

bloques = re.findall(r"motivo:\s*'([^']+)',\s*patrones:\s*\[(.*?)\n\s*\],", src, re.S)
banderas = []
for motivo, cuerpo in bloques:
    # Ahora sí tolera comentario al final de la línea.
    pats = re.findall(r"^\s*/(.*?)/([a-z]*),(?:\s*//.*)?\s*$", cuerpo, re.M)
    banderas.append((motivo, [re.compile(c, re.I if 'i' in f else 0) for c, f in pats]))

def sin_acentos(t):
    return ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')

def revisar(texto):
    t = sin_acentos(texto).lower()
    for motivo, pats in banderas:
        for p in pats:
            if p.search(texto) or p.search(t):
                return motivo
    return None

URGENTES = [
 'me duele el pecho desde hace una hora', 'Me APRIETA EL PECHO y sudo frio',
 'creo que me esta dando un infarto', 'me duele mucho el pecho',
 'siento que me duele el corazon', 'no puedo respirar bien',
 'me falta el aire al subir escaleras', 'se me ahoga mi hijo',
 'se me torcio la boca y no puedo hablar', 'es el peor dolor de cabeza de mi vida',
 'no puedo mover el brazo derecho', 'mi papa se desmayo y no responde',
 'vomite sangre', 'las heces negras desde ayer',
 'estoy embarazada y tengo sangrado', 'traigo la glucosa en 420',
 'el azucar me salio en 380', 'ya no quiero vivir',
 'quiero quitarme la vida', 'tuve una convulsion',
 'tengo los labios morados', 'dolor de pecho',
]
NORMALES = [
 'hola, quiero agendar una cita', 'cuanto cuesta la consulta',
 'a que hora abren los sabados', 'me duele un poco la rodilla',
 'quiero bajar de peso', 'donde estan ubicados',
 'que debo llevar a mi primera consulta', 'mi glucosa en ayunas salio en 105',
 'me interesa el cafe de altura', 'hacen envios a Tuxtla',
 'me duele la muela', 'quiero informacion de la app',
 'traigo la presion en 130/85', 'mi azucar anda en 98',
]

fallos = []
print(f"Banderas: {len(banderas)} motivos, {sum(len(p) for _,p in banderas)} patrones\n")
print("── DEBEN disparar ──")
for c in URGENTES:
    m = revisar(c)
    if m is None: fallos.append(('NO DISPARÓ', c)); print(f"  ❌ {c!r}")
    else: print(f"  ✅ {c!r}  → {m}")
print("\n── NO deben disparar ──")
for c in NORMALES:
    m = revisar(c)
    if m: fallos.append(('FALSO POSITIVO', c)); print(f"  ❌ {c!r} → {m}")
    else: print(f"  ✅ {c!r}")
print(f"\n{'✅ TODO EN ORDEN' if not fallos else '❌ ' + str(len(fallos)) + ' FALLO(S)'}")
sys.exit(1 if fallos else 0)

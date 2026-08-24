#!/usr/bin/env python3
"""
Servidor local para las pruebas, con una sola diferencia frente al de siempre:
manda `no-store` en todo.

No es una manía. El navegador guarda los módulos en caché, y unas pruebas que
leen la versión vieja de un archivo dan APROBADO justo después de que alguien
lo rompió — que es exactamente cuando uno las corre. Ese aprobado falso es
peor que no tener pruebas, porque da permiso para subir.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *_):
        pass          # la consola es para el resultado, no para el tráfico


if __name__ == '__main__':
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8795
    ThreadingHTTPServer(('127.0.0.1', puerto), SinCache).serve_forever()

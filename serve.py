"""
Servidor local de Mundo Cero (a prueba de caché).

    python serve.py 8003

Como `python -m http.server`, pero el navegador nunca usa archivos viejos guardados:
  - Cada vez que se arranca, el juego se sirve bajo una ruta nueva (/r<número>/...):
    abrir http://localhost:8003/ redirige a ella. Para el navegador son direcciones
    nuevas, así que no puede reutilizar módulos de una versión anterior.
  - Además manda Cache-Control: no-store y nunca responde 304.
  - Fija el tipo de los .js/.mjs (en Windows a veces sale mal).
"""
import http.server
import re
import sys
import time

TOKEN = f'r{int(time.time())}'
PREFIX = re.compile(r'^/r\d+(/.*)?$')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
        '.gz': 'application/octet-stream',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _route(self):
        """True si ya ha respondido (redirección a la ruta de esta sesión del servidor)."""
        path, _, query = self.path.partition('?')
        m = PREFIX.match(path)
        if m:
            # /r123/js/main.js → /js/main.js (sea cual sea el número: pestañas abiertas de antes)
            self.path = (m.group(1) or '/') + (f'?{query}' if query else '')
            return False
        if path in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', f'/{TOKEN}/' + (f'?{query}' if query else ''))
            self.send_header('Content-Length', '0')
            self.end_headers()
            return True
        return False

    def send_head(self):
        if self._route():
            return None
        # Sin "If-Modified-Since": siempre el archivo entero (nada de 304 con copias viejas).
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        return super().send_head()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8003
    with http.server.ThreadingHTTPServer(('', port), NoCacheHandler) as httpd:
        print(f'Mundo Cero en http://localhost:{port}/  (Ctrl+C para parar)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()

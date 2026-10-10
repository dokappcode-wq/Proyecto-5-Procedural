"""
Servidor local de Mundo Cero (sin caché).

    python serve.py 8003

Igual que `python -m http.server`, pero le dice al navegador que no guarde los
archivos: tras un `git pull` siempre se cargan los módulos nuevos (si no, el
navegador puede mezclar archivos viejos guardados con los nuevos y el juego falla
al arrancar). Además fija el tipo de los .js/.mjs (en Windows a veces sale mal).
"""
import http.server
import socketserver
import sys


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

    def send_head(self):
        # Sin "If-Modified-Since": siempre el archivo entero (nada de 304 con copias viejas).
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        return super().send_head()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8003
    socketserver.TCPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(('', port), NoCacheHandler) as httpd:
        print(f'Mundo Cero en http://localhost:{port}/  (Ctrl+C para parar)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()

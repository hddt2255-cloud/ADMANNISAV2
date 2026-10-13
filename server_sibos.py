import http.server
import socketserver
import os
import sys

PORT = 8002
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class DualStackServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    with DualStackServer(('0.0.0.0', PORT), CustomHandler) as httpd:
        print(f"SiBOS V1 Server running on port {PORT} at {DIRECTORY}")
        sys.stdout.flush()
        httpd.serve_forever()

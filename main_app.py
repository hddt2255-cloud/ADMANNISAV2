import os
import sys
import json
import threading
import time
import socket
import http.server
import socketserver
import webview

def get_exe_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

EXE_DIR = get_exe_dir()
DATA_DIR = os.path.join(EXE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

class Api:
    pass

class SiBosHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        # Serve index.html directly without local DB injection (100% Firebase Realtime DB)
        clean_path = self.path.split('?')[0]
        if clean_path in ('', '/', '/index.html'):
            index_path = os.path.join(get_base_dir(), 'index.html')
            if os.path.exists(index_path):
                with open(index_path, 'r', encoding='utf-8') as f:
                    html = f.read()

                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.end_headers()
                self.wfile.write(html.encode('utf-8'))
                return

        return super().do_GET()

def start_server(port, directory):
    os.chdir(directory)
    handler = SiBosHTTPRequestHandler
    with socketserver.TCPServer(('127.0.0.1', port), handler) as httpd:
        httpd.serve_forever()

if __name__ == '__main__':
    base_dir = get_base_dir()
    
    port = 5173
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', port))
        s.close()
    except Exception:
        port = find_free_port()

    server_thread = threading.Thread(target=start_server, args=(port, base_dir), daemon=True)
    server_thread.start()

    time.sleep(0.5)

    icon_path = os.path.join(base_dir, 'sibos_icon.ico')
    url = f'http://127.0.0.1:{port}/index.html'

    api = Api()
    webview_storage = os.path.join(DATA_DIR, 'webview_profile')
    os.makedirs(webview_storage, exist_ok=True)

    window = webview.create_window(
        title='SiBOS — Aplikasi Pengelolaan Dana BOS & Standing Instruction',
        url=url,
        js_api=api,
        width=1280,
        height=820,
        min_size=(900, 600),
        resizable=True
    )

    webview.start(
        storage_path=webview_storage,
        icon=icon_path if os.path.exists(icon_path) else None
    )

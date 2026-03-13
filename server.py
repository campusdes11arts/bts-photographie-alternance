#!/usr/bin/env python3
"""
SUP-PHOTO — Serveur interne avec base de données SQLite
Lance : python3 server.py
Accès : http://localhost:8080
"""
import http.server
import json
import os
import sqlite3
import urllib.parse
from datetime import datetime

PORT = 8080
BASE = os.path.dirname(os.path.abspath(__file__))
DB   = os.path.join(BASE, 'supphoto.db')

# ── INIT BASE DE DONNÉES ──────────────────────────────────────────────────────
def init_db():
    with sqlite3.connect(DB) as c:
        c.execute('''
            CREATE TABLE IF NOT EXISTS dossiers (
                id         TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                data       TEXT NOT NULL
            )
        ''')

def now():
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

# ── HANDLER HTTP ──────────────────────────────────────────────────────────────
class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def log_message(self, fmt, *args):
        method = self.command
        path   = self.path.split('?')[0]
        code   = args[1] if len(args) > 1 else '?'
        if path.startswith('/api'):
            print(f'  {method} {path} → {code}')

    # CORS headers
    def cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    # Réponse JSON
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json;charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    # Lire le body JSON
    def read_json(self):
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n)) if n else {}

    # ── OPTIONS (preflight CORS) ──────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(200)
        self.cors()
        self.end_headers()

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        # Liste tous les dossiers
        if path == '/api/dossiers':
            with sqlite3.connect(DB) as c:
                c.row_factory = sqlite3.Row
                rows = c.execute(
                    'SELECT id, created_at, updated_at, data FROM dossiers ORDER BY updated_at DESC'
                ).fetchall()
            result = []
            for r in rows:
                d = json.loads(r['data'])
                d.update({'id': r['id'], 'createdAt': r['created_at'], 'updatedAt': r['updated_at']})
                result.append(d)
            self.send_json(result)

        # Un dossier par ID
        elif path.startswith('/api/dossiers/'):
            id_ = path.rsplit('/', 1)[-1]
            with sqlite3.connect(DB) as c:
                c.row_factory = sqlite3.Row
                row = c.execute('SELECT * FROM dossiers WHERE id=?', (id_,)).fetchone()
            if row:
                d = json.loads(row['data'])
                d.update({'id': row['id'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at']})
                self.send_json(d)
            else:
                self.send_json({'error': 'Dossier introuvable'}, 404)

        # Export JSON complet
        elif path == '/api/export/json':
            with sqlite3.connect(DB) as c:
                c.row_factory = sqlite3.Row
                rows = c.execute('SELECT * FROM dossiers ORDER BY updated_at DESC').fetchall()
            export = []
            for r in rows:
                d = json.loads(r['data'])
                d.update({'id': r['id'], 'createdAt': r['created_at'], 'updatedAt': r['updated_at']})
                export.append(d)
            body = json.dumps(export, ensure_ascii=False, indent=2).encode('utf-8')
            fname = f'supphoto_export_{datetime.now().strftime("%Y-%m-%d")}.json'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json;charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="{fname}"')
            self.send_header('Content-Length', str(len(body)))
            self.cors()
            self.end_headers()
            self.wfile.write(body)

        # Statistiques globales
        elif path == '/api/stats':
            with sqlite3.connect(DB) as c:
                total = c.execute('SELECT COUNT(*) FROM dossiers').fetchone()[0]
                rows  = c.execute('SELECT data FROM dossiers').fetchall()
            stats = {'total': total, 'conformes': 0, 'bloques': 0}
            for (data_str,) in rows:
                d = json.loads(data_str)
                conf = d.get('conformite') or {}
                if conf.get('bloque'):
                    stats['bloques'] += 1
                elif conf.get('done') and (conf.get('score') or 0) >= 25:
                    stats['conformes'] += 1
            self.send_json(stats)

        # Fichiers statiques (HTML, CSS, images…)
        else:
            super().do_GET()

    # ── POST : créer ou mettre à jour un dossier (upsert) ────────────────────
    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path

        if path == '/api/dossiers':
            try:
                d   = self.read_json()
                id_ = d.get('id') or datetime.utcnow().strftime('%Y%m%d%H%M%S%f')
                d['id'] = id_
                n = now()
                data_str = json.dumps(d, ensure_ascii=False)
                with sqlite3.connect(DB) as c:
                    exists = c.execute('SELECT id FROM dossiers WHERE id=?', (id_,)).fetchone()
                    if exists:
                        c.execute(
                            'UPDATE dossiers SET updated_at=?, data=? WHERE id=?',
                            (n, data_str, id_)
                        )
                    else:
                        created = d.get('createdAt', n)
                        c.execute(
                            'INSERT INTO dossiers (id, created_at, updated_at, data) VALUES (?,?,?,?)',
                            (id_, created, n, data_str)
                        )
                self.send_json({'ok': True, 'id': id_})
            except Exception as e:
                self.send_json({'error': str(e)}, 400)

        # Import en masse (liste de dossiers JSON)
        elif path == '/api/import':
            try:
                items = self.read_json()
                if isinstance(items, dict):
                    items = [items]
                count = 0
                n = now()
                for d in items:
                    if not isinstance(d, dict):
                        continue
                    id_ = d.get('id') or datetime.utcnow().strftime('%Y%m%d%H%M%S%f')
                    d['id'] = id_
                    data_str = json.dumps(d, ensure_ascii=False)
                    with sqlite3.connect(DB) as c:
                        exists = c.execute('SELECT id FROM dossiers WHERE id=?', (id_,)).fetchone()
                        if exists:
                            c.execute('UPDATE dossiers SET updated_at=?,data=? WHERE id=?', (n, data_str, id_))
                        else:
                            created = d.get('createdAt', n)
                            c.execute('INSERT INTO dossiers VALUES(?,?,?,?)', (id_, created, n, data_str))
                    count += 1
                self.send_json({'ok': True, 'imported': count})
            except Exception as e:
                self.send_json({'error': str(e)}, 400)

        else:
            self.send_json({'error': 'Route inconnue'}, 404)

    # ── DELETE ────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/api/dossiers/'):
            id_ = path.rsplit('/', 1)[-1]
            with sqlite3.connect(DB) as c:
                c.execute('DELETE FROM dossiers WHERE id=?', (id_,))
            self.send_json({'ok': True})
        else:
            self.send_json({'error': 'Route inconnue'}, 404)


# ── LANCEMENT ─────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    print()
    print('  ██████╗  ██╗  ██╗ ██████╗ ████████╗ ██████╗ ')
    print('  ██╔══██╗ ██║  ██║██╔═══██╗╚══██╔══╝██╔═══██╗')
    print('  ██████╔╝ ███████║██║   ██║   ██║   ██║   ██║')
    print('  ██╔═══╝  ██╔══██║██║   ██║   ██║   ██║   ██║')
    print('  ██║      ██║  ██║╚██████╔╝   ██║   ╚██████╔╝')
    print('  ╚═╝      ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ')
    print()
    print(f'  ✅  Serveur démarré → http://localhost:{PORT}')
    print(f'  🗄️   Base de données → {DB}')
    print(f'  ⌨️   Ctrl+C pour arrêter')
    print()
    with http.server.ThreadingHTTPServer(('', PORT), Handler) as s:
        s.serve_forever()

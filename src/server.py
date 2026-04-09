#!/usr/bin/env python3
import os
import re
import http.server
import socketserver
import json
import pymysql
import subprocess
import cgi
import uuid
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get('PORT', 3001))
SERVE_DIR = os.environ.get('SERVE_DIR', '/app/public')
YT_DLP_PATH = os.environ.get('YT_DLP_PATH', '/usr/local/bin/yt-dlp')
CACHE_DIR = os.environ.get('CACHE_DIR', '/tmp/ukesync_cache')
DATA_DIR = os.environ.get('DATA_DIR', '/app/data')

DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = int(os.environ.get('DB_PORT', 3306))
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_NAME = os.environ.get('DB_NAME', 'ukesync_db')


def get_db_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[HTTP] {args[0]}", flush=True)

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path
        parsed = urlparse(path)
        print(f"GET {path}", flush=True)

        if path.startswith('/api/youtube-info'):
            params = parse_qs(parsed.query)
            url = params.get('url', [''])[0]
            if not url:
                self.send_error(400, 'Missing url parameter')
                return
            try:
                result = subprocess.run(
                    [YT_DLP_PATH, '--dump-json', '--no-download', '--no-playlist', url],
                    capture_output=True, text=True, timeout=30
                )
                if result.returncode != 0:
                    raise Exception(result.stderr or 'yt-dlp failed')
                info = json.loads(result.stdout)
                video_id = info.get('display_id') or info.get('id', '')
                response = {
                    'title': info.get('title', 'Unknown'),
                    'duration': info.get('duration', 0) or 0,
                    'videoId': video_id,
                    'thumbnail': f'https://i.ytimg.com/vi/{video_id}/mqdefault.jpg',
                    'author': info.get('uploader') or info.get('channel') or 'Unknown'
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(response).encode())
            except Exception as e:
                print(f"YouTube info error: {e}")
                self.send_error(500, str(e))
            return

        if path.startswith('/api/youtube-audio'):
            params = parse_qs(parsed.query)
            url = params.get('url', [''])[0]
            if not url:
                self.send_error(400, 'Missing url parameter')
                return
            print(f"Streaming audio from: {url}")
            os.makedirs(CACHE_DIR, exist_ok=True)
            safe_name = ''.join(c if c.isalnum() else '_' for c in url)[:50]
            audio_file = f'{CACHE_DIR}/{safe_name}.m4a'
            try:
                if not os.path.exists(audio_file):
                    print(f"Downloading audio to {audio_file}")
                    proc = subprocess.run(
                        [YT_DLP_PATH, '-x', '--audio-format', 'm4a', '-o', audio_file, '--no-playlist', '--no-warnings', url],
                        capture_output, timeout=300
                    )
                    if proc.returncode != 0:
                        raise Exception(proc.stderr or 'Download failed')
                file_size = os.path.getsize(audio_file)
                print(f"Serving {file_size} bytes")
                self.send_response(200)
                self.send_header('Content-Type', 'audio/mp4')
                self.send_header('Content-Length', str(file_size))
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_cors_headers()
                self.end_headers()
                with open(audio_file, 'rb') as f:
                    self.wfile.write(f.read())
            except subprocess.TimeoutExpired:
                self.send_error(504, 'Download timeout')
            except Exception as e:
                print(f"Streaming error: {e}")
                self.send_error(500, str(e))
            return

        if path == '/api/biblioteca':
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT c.id, c.titulo, c.artista, c.duracion, c.archivo_mp3,
                           c.archivo_xml, c.thumbnail, c.youtube_url, c.nivel_id,
                           c.created_at, c.tags, c.has_tablatura, c.has_karaoke,
                           n.nombre as nivel_nombre
                    FROM canciones c
                    LEFT JOIN niveles n ON c.nivel_id = n.id
                    ORDER BY c.created_at DESC
                """)
                rows = cursor.fetchall()
                cols = [desc[0] for desc in cursor.description]
                result = []
                for row in rows:
                    r = {}
                    for i, col in enumerate(cols):
                        v = row[i] if i < len(row) else None
                        if v is None or v == 'NULL':
                            r[col] = None
                        elif isinstance(v, (int, float, str)):
                            r[col] = v
                        elif isinstance(v, bytes):
                            r[col] = str(v)
                        else:
                            r[col] = str(v)
                    result.append(r)
                cursor.close()
                conn.close()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            except Exception as e:
                import traceback
                print(f"Error: {e}", flush=True)
                traceback.print_exc()
                self.send_error(500, str(e))
            return

        if path == '/api/niveles':
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT id, nombre FROM niveles ORDER BY id")
                rows = cursor.fetchall()
                cursor.close()
                conn.close()
                result = [{'id': r[0], 'nombre': r[1]} for r in rows]
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        if path.startswith('/api/songs/') and path.endswith('/delete'):
            song_id = path.split('/')[-2]
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT archivo_mp3, archivo_xml FROM canciones WHERE id = %s", (song_id,))
                row = cursor.fetchone()
                if row:
                    mp3_path = row[0]
                    xml_path = row[1]
                    if mp3_path:
                        full_mp3 = os.path.join(DATA_DIR, mp3_path.lstrip('/'))
                        if os.path.exists(full_mp3):
                            os.remove(full_mp3)
                    if xml_path:
                        full_xml = os.path.join(DATA_DIR, xml_path.lstrip('/'))
                        if os.path.exists(full_xml):
                            os.remove(full_xml)
                cursor.execute("DELETE FROM canciones WHERE id = %s", (song_id,))
                conn.commit()
                cursor.close()
                conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        if path.startswith('/api/songs/'):
            song_id = path.split('/')[-1]
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT c.id, c.titulo, c.artista, c.duracion, c.archivo_mp3,
                           c.archivo_xml, c.thumbnail, c.youtube_url, c.nivel_id,
                           c.created_at, c.tags, c.has_tablatura, c.has_karaoke,
                           c.observaciones, c.lyrics_with_chords, c.timestamps_json,
                           n.nombre as nivel_nombre
                    FROM canciones c
                    LEFT JOIN niveles n ON c.nivel_id = n.id
                    WHERE c.id = %s
                """, (song_id,))
                row = cursor.fetchone()
                cursor.close()
                conn.close()
                if row:
                    cols = [desc[0] for desc in cursor.description]
                    r = {}
                    for i, col in enumerate(cols):
                        v = row[i] if i < len(row) else None
                        r[col] = v
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps(r).encode())
                else:
                    self.send_error(404, 'Song not found')
            except Exception as e:
                self.send_error(500, str(e))
            return

        clean_path = parsed.path.split('?')[0]
        if clean_path == '/' or clean_path == '':
            file_path = os.path.join(SERVE_DIR, 'index.html')
        else:
            file_path = os.path.join(SERVE_DIR, clean_path.lstrip('/'))

        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')

        if os.path.isfile(file_path):
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                ext = os.path.splitext(file_path)[1].lower()
                mime_types = {
                    '.html': 'text/html; charset=utf-8',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.mp3': 'audio/mpeg',
                    '.wav': 'audio/wav',
                    '.ogg': 'audio/ogg',
                    '.m4a': 'audio/mp4',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.zip': 'application/zip',
                    '.xml': 'application/xml',
                    '.musicxml': 'application/xml',
                }
                mime = mime_types.get(ext, 'application/octet-stream')
                self.send_response(200)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', len(content))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404)

    def do_POST(self):
        path = self.path
        parsed = urlparse(path)
        print(f"POST {path}", flush=True)

        if path == '/api/upload-song':
            try:
                content_type = self.headers.get('Content-Type', '')
                if 'multipart/form-data' in content_type:
                    form = cgi.FieldStorage(
                        fp=self.rfile,
                        headers=self.headers,
                        environ={
                            'REQUEST_METHOD': 'POST',
                            'CONTENT_TYPE': content_type,
                        }
                    )

                    titulo = form.getfirst('titulo', '')
                    artista = form.getfirst('artista', '')
                    nivel_id = int(form.getfirst('nivel_id', 1))
                    youtube_url = form.getfirst('youtube_url', '')
                    duracion = int(form.getfirst('duracion', 0) or 0)
                    observaciones = form.getfirst('observaciones', '')
                    tags = form.getfirst('tags', '')
                    has_tablatura = form.getfirst('has_tablatura', 'false') == 'true'
                    has_karaoke = form.getfirst('has_karaoke', 'false') == 'true'
                    existing_id = form.getfirst('id', '')

                    archivo_mp3_path = ''
                    archivo_xml_path = ''

                    mp3_file = form.getfirst('mp3_file')
                    if mp3_file and mp3_file.filename:
                        ext = os.path.splitext(mp3_file.filename)[1] or '.mp3'
                        unique_name = f"{uuid.uuid4().hex}{ext}"
                        audio_dir = os.path.join(DATA_DIR, 'audio')
                        os.makedirs(audio_dir, exist_ok=True)
                        archivo_mp3_path = f'/audio/{unique_name}'
                        full_path = os.path.join(audio_dir, unique_name)
                        with open(full_path, 'wb') as f:
                            f.write(mp3_file.file.read())

                    xml_file = form.getfirst('xml_file')
                    if xml_file and xml_file.filename:
                        ext = os.path.splitext(xml_file.filename)[1] or '.xml'
                        unique_name = f"{uuid.uuid4().hex}{ext}"
                        xml_dir = os.path.join(DATA_DIR, 'xml')
                        os.makedirs(xml_dir, exist_ok=True)
                        archivo_xml_path = f'/xml/{unique_name}'
                        full_path = os.path.join(xml_dir, unique_name)
                        with open(full_path, 'wb') as f:
                            f.write(xml_file.file.read())

                    conn = get_db_connection()
                    cursor = conn.cursor()

                    if existing_id:
                        song_id = int(existing_id)
                        if archivo_mp3_path:
                            cursor.execute("UPDATE canciones SET archivo_mp3 = %s WHERE id = %s", (archivo_mp3_path, song_id))
                        if archivo_xml_path:
                            cursor.execute("UPDATE canciones SET archivo_xml = %s WHERE id = %s", (archivo_xml_path, song_id))
                        cursor.execute("""
                            UPDATE canciones SET
                                titulo = %s, artista = %s, nivel_id = %s, duracion = %s,
                                youtube_url = %s, observaciones = %s, tags = %s,
                                has_tablatura = %s, has_karaoke = %s, updated_at = NOW()
                            WHERE id = %s
                        """, (titulo, artista, nivel_id, duracion, youtube_url,
                              observaciones, tags, has_tablatura, has_karaoke, song_id))
                        message = f"Song '{titulo}' updated successfully"
                    else:
                        cursor.execute("""
                            INSERT INTO canciones
                            (titulo, artista, nivel_id, duracion, archivo_mp3, archivo_xml,
                             youtube_url, observaciones, tags, has_tablatura, has_karaoke, created_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        """, (titulo, artista, nivel_id, duracion, archivo_mp3_path, archivo_xml_path,
                              youtube_url, observaciones, tags, has_tablatura, has_karaoke))
                        song_id = cursor.lastrowid
                        message = f"Song '{titulo}' created successfully"

                    conn.commit()
                    cursor.close()
                    conn.close()

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'success': True,
                        'message': message,
                        'song_id': song_id,
                        'archivo_mp3': archivo_mp3_path,
                        'archivo_xml': archivo_xml_path
                    }).encode())
                else:
                    self.send_error(400, 'Expected multipart/form-data')
            except Exception as e:
                import traceback
                print(f"Error uploading song: {e}", flush=True)
                traceback.print_exc()
                self.send_error(500, str(e))
            return

        if path == '/api/save-song':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode('utf-8'))

                title = data.get('title', '')
                artist = data.get('artist', '')
                lyrics_with_chords = data.get('lyrics_with_chords', '')
                youtube_url = data.get('youtube_url', '')
                timestamps_json = json.dumps(data.get('timestamps', []))
                duracion = data.get('duration', 0)
                archivo_mp3 = data.get('archivo_mp3', '')
                archivo_xml = data.get('archivo_xml', '')
                thumbnail = data.get('thumbnail', '')
                nivel_id = data.get('nivel_id', 1)
                tags = data.get('tags', '')
                has_tablatura = data.get('has_tablatura', False)
                has_karaoke = data.get('has_karaoke', False)

                conn = get_db_connection()
                cursor = conn.cursor()

                cursor.execute("SELECT id FROM canciones WHERE titulo = %s AND artista = %s", (title, artist))
                existing_song = cursor.fetchone()

                if existing_song:
                    song_id = existing_song[0]
                    query = """
                        UPDATE canciones
                        SET artista = %s, duracion = %s, archivo_mp3 = %s, archivo_xml = %s,
                            thumbnail = %s, youtube_url = %s, nivel_id = %s,
                            lyrics_with_chords = %s, timestamps_json = %s,
                            tags = %s, has_tablatura = %s, has_karaoke = %s,
                            updated_at = NOW()
                        WHERE id = %s
                    """
                    cursor.execute(query, (
                        artist, duracion, archivo_mp3, archivo_xml, thumbnail,
                        youtube_url, nivel_id, lyrics_with_chords, timestamps_json,
                        tags, has_tablatura, has_karaoke, song_id
                    ))
                    message = f"Song '{title}' updated successfully (ID: {song_id})."
                else:
                    query = """
                        INSERT INTO canciones
                        (titulo, artista, duracion, archivo_mp3, archivo_xml, thumbnail,
                         youtube_url, nivel_id, lyrics_with_chords, timestamps_json,
                         tags, has_tablatura, has_karaoke, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    """
                    cursor.execute(query, (
                        title, artist, duracion, archivo_mp3, archivo_xml, thumbnail,
                        youtube_url, nivel_id, lyrics_with_chords, timestamps_json,
                        tags, has_tablatura, has_karaoke
                    ))
                    song_id = cursor.lastrowid
                    message = f"Song '{title}' saved successfully (ID: {song_id})."

                conn.commit()
                cursor.close()
                conn.close()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'message': message, 'song_id': song_id}).encode())

            except Exception as e:
                import traceback
                print(f"Error saving song: {e}", flush=True)
                traceback.print_exc()
                self.send_error(500, str(e))
            return

        self.send_error(404, 'Not Found')

    def do_DELETE(self):
        path = self.path
        parsed = urlparse(path)
        print(f"DELETE {path}", flush=True)

        if path.startswith('/api/songs/'):
            song_id = path.split('/')[-1]
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT archivo_mp3, archivo_xml FROM canciones WHERE id = %s", (song_id,))
                row = cursor.fetchone()
                if row:
                    mp3_path = row[0]
                    xml_path = row[1]
                    if mp3_path:
                        full_mp3 = os.path.join(DATA_DIR, mp3_path.lstrip('/'))
                        if os.path.exists(full_mp3):
                            os.remove(full_mp3)
                    if xml_path:
                        full_xml = os.path.join(DATA_DIR, xml_path.lstrip('/'))
                        if os.path.exists(full_xml):
                            os.remove(full_xml)
                cursor.execute("DELETE FROM canciones WHERE id = %s", (song_id,))
                conn.commit()
                cursor.close()
                conn.close()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode())
            except Exception as e:
                self.send_error(500, str(e))
            return

        self.send_error(404, 'Not Found')


if __name__ == '__main__':
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, 'audio'), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, 'xml'), exist_ok=True)
    socketserver.TCPServer(('0.0.0.0', PORT), H).serve_forever()

#!/usr/bin/env python3
"""
Migrate songs from Synology MariaDB to local Docker MariaDB.

Usage:
    python migrate_songs.py

Environment variables (from .env or system):
    # Source (Synology)
    SYNOLOGY_DB_HOST=127.0.0.1
    SYNOLOGY_DB_PORT=3306
    SYNOLOGY_DB_USER=root
    SYNOLOGY_DB_PASSWORD=hekqy2-guNcuz-roqfuc
    SYNOLOGY_DB_NAME=ukesync_db

    # Target (local Docker - usually defaults work for local dev)
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=ukesync_user
    DB_PASSWORD=<from .env>
    DB_NAME=ukesync_db
"""

import os
import sys
import json
import pymysql
import argparse


def get_source_connection():
    return pymysql.connect(
        host=os.environ.get('SYNOLOGY_DB_HOST', '127.0.0.1'),
        port=int(os.environ.get('SYNOLOGY_DB_PORT', 3306)),
        user=os.environ.get('SYNOLOGY_DB_USER', 'root'),
        password=os.environ.get('SYNOLOGY_DB_PASSWORD', ''),
        database=os.environ.get('SYNOLOGY_DB_NAME', 'ukesync_db')
    )


def get_target_connection():
    return pymysql.connect(
        host=os.environ.get('DB_HOST', 'localhost'),
        port=int(os.environ.get('DB_PORT', 3306)),
        user=os.environ.get('DB_USER', 'root'),
        password=os.environ.get('DB_PASSWORD', ''),
        database=os.environ.get('DB_NAME', 'ukesync_db')
    )


def export_songs(source_conn):
    """Export all songs from source database."""
    cursor = source_conn.cursor()
    cursor.execute("""
        SELECT id, titulo, artista, duracion, archivo_mp3, archivo_xml,
               thumbnail, youtube_url, nivel_id, lyrics_with_chords,
               timestamps_json, observaciones, created_at, updated_at
        FROM canciones
        ORDER BY created_at DESC
    """)
    rows = cursor.fetchall()
    cursor.close()
    return rows


def export_niveles(source_conn):
    """Export all niveles from source database."""
    cursor = source_conn.cursor()
    cursor.execute("SELECT id, nombre FROM niveles ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def import_niveles(target_conn, niveles):
    """Import niveles into target database."""
    cursor = target_conn.cursor()
    for row in niveles:
        old_id, nombre = row
        cursor.execute("""
            INSERT INTO niveles (nombre) VALUES (%s)
            ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)
        """, (nombre,))
    target_conn.commit()
    cursor.close()
    print(f"  -> Migrated {len(niveles)} niveles")


def import_songs(target_conn, songs, dry_run=False):
    """Import songs into target database."""
    cursor = target_conn.cursor()
    migrated = 0
    skipped = 0

    for row in songs:
        (old_id, titulo, artista, duracion, archivo_mp3, archivo_xml,
         thumbnail, youtube_url, nivel_id, lyrics_with_chords,
         timestamps_json, observaciones, created_at, updated_at) = row

        if dry_run:
            print(f"  [DRY RUN] Would migrate: {titulo} - {artista}")
            migrated += 1
            continue

        try:
            cursor.execute("""
                INSERT INTO canciones
                (titulo, artista, duracion, archivo_mp3, archivo_xml,
                 thumbnail, youtube_url, nivel_id, lyrics_with_chords,
                 timestamps_json, observaciones, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                titulo, artista, duracion, archivo_mp3, archivo_xml,
                thumbnail, youtube_url, nivel_id, lyrics_with_chords,
                timestamps_json, observaciones, created_at, updated_at
            ))
            migrated += 1
        except pymysql.IntegrityError as e:
            if 'Duplicate' in str(e):
                skipped += 1
                print(f"  [SKIP] '{titulo}' already exists, updating...")
                cursor.execute("""
                    UPDATE canciones SET
                        artista = %s, duracion = %s, archivo_mp3 = %s, archivo_xml = %s,
                        thumbnail = %s, youtube_url = %s, nivel_id = %s,
                        lyrics_with_chords = %s, timestamps_json = %s,
                        observaciones = %s, updated_at = NOW()
                    WHERE titulo = %s AND (artista = %s OR (artista = '' AND %s = ''))
                """, (
                    artista, duracion, archivo_mp3, archivo_xml,
                    thumbnail, youtube_url, nivel_id, lyrics_with_chords,
                    timestamps_json, observaciones, titulo, artista, artista
                ))
                migrated += 1
            else:
                raise

    target_conn.commit()
    cursor.close()
    return migrated, skipped


def export_to_json(songs, niveles, filename='songs_migration.json'):
    """Export songs and niveles to JSON file for backup."""
    data = {
        'niveles': [
            {'id': n[0], 'nombre': n[1]} for n in niveles
        ],
        'songs': [
            {
                'id': s[0], 'titulo': s[1], 'artista': s[2], 'duracion': s[3],
                'archivo_mp3': s[4], 'archivo_xml': s[5], 'thumbnail': s[6],
                'youtube_url': s[7], 'nivel_id': s[8], 'lyrics_with_chords': s[9],
                'timestamps_json': s[10], 'observaciones': s[11],
                'created_at': str(s[12]) if s[12] else None,
                'updated_at': str(s[13]) if s[13] else None
            }
            for s in songs
        ]
    }
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  -> Exported to {filename}")


def main():
    parser = argparse.ArgumentParser(description='Migrate songs from Synology to local Docker')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be migrated')
    parser.add_argument('--export-json', metavar='FILE', help='Export to JSON instead of migrating')
    parser.add_argument('--import-json', metavar='FILE', help='Import from JSON file')
    args = parser.parse_args()

    if args.import_json:
        print(f"[IMPORT] Loading from {args.import_json}...")
        with open(args.import_json, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        target_conn = get_target_connection()
        
        if 'niveles' in data:
            import_niveles(target_conn, [(n['id'], n['nombre']) for n in data['niveles']])
        
        if 'songs' in data:
            songs_data = []
            for s in data['songs']:
                songs_data.append((
                    s['id'], s['titulo'], s['artista'], s['duracion'],
                    s['archivo_mp3'], s['archivo_xml'], s['thumbnail'],
                    s['youtube_url'], s['nivel_id'], s['lyrics_with_chords'],
                    s['timestamps_json'], s['observaciones'],
                    s['created_at'], s['updated_at']
                ))
            migrated, skipped = import_songs(target_conn, songs_data)
            print(f"[IMPORT] Migrated: {migrated}, Skipped: {skipped}")
        
        target_conn.close()
        return

    if args.export_json:
        print(f"[EXPORT] Connecting to Synology database...")
        source_conn = get_source_connection()
        niveles = export_niveles(source_conn)
        songs = export_songs(source_conn)
        source_conn.close()
        export_to_json(songs, niveles, args.export_json)
        return

    print("[MIGRATION] Connecting to Synology database...")
    try:
        source_conn = get_source_connection()
        print("  -> Connected to source")
    except Exception as e:
        print(f"ERROR: Cannot connect to Synology database: {e}")
        print("  Make sure you're on the network or VPN.")
        sys.exit(1)

    print("[MIGRATION] Exporting songs...")
    niveles = export_niveles(source_conn)
    songs = export_songs(source_conn)
    print(f"  -> Found {len(songs)} songs, {len(niveles)} niveles")
    source_conn.close()

    if args.dry_run:
        print("\n[DRY RUN] Songs that would be migrated:")
        for s in songs:
            print(f"  - {s[1]} - {s[2]} (nivel_id: {s[8]})")
        return

    print("\n[MIGRATION] Connecting to local database...")
    try:
        target_conn = get_target_connection()
        print("  -> Connected to target")
    except Exception as e:
        print(f"ERROR: Cannot connect to local database: {e}")
        print("  Make sure Docker containers are running (docker compose up -d).")
        sys.exit(1)

    print("[MIGRATION] Importing niveles...")
    import_niveles(target_conn, niveles)

    print("[MIGRATION] Importing songs...")
    migrated, skipped = import_songs(target_conn, songs)
    print(f"  -> Migrated: {migrated}, Skipped: {skipped}")

    target_conn.close()
    print("\n[MIGRATION] Complete!")


if __name__ == '__main__':
    main()

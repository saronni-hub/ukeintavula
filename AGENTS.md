# UKEINTAVULA - UKE Intavula Project

## Project Overview
Ukulele learning app with tablatura visualizer and karaoke system for chords.

## Architecture

```
GitHub: https://github.com/saronni-hub/ukeintavula
Local: ~/openclaw/workspace/ukesync_from_synology/
Synology: /volume2/homes/saronni/ukeintavula/

Docker Compose:
├── mariadb:10.11 (port 3306)
└── api: saronni/ukeintavula-api:latest (port 3001)
```

## Important Paths

| Path | Description |
|------|-------------|
| `public/` | Frontend (HTML, JS, CSS) |
| `public/biblioteca/` | Central library (new) |
| `public/tablatura/` | Tablatura visualizer (5037 lines) |
| `public/acordes/` | Karaoke system (new) |
| `src/server.py` | Python API server |
| `scripts/init_db.sql` | Database schema |
| `scripts/migrate_songs.py` | Migration from Synology |
| `data/audio/` | Uploaded MP3 files |
| `data/xml/` | Uploaded MusicXML files |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/biblioteca` | GET | List all songs |
| `/api/niveles` | GET | List difficulty levels |
| `/api/songs/:id` | GET | Get single song |
| `/api/upload-song` | POST | Upload song (multipart) |
| `/api/save-song` | POST | Save/update song (JSON) |
| `/api/songs/:id` | DELETE | Delete song |
| `/api/youtube-info` | GET | YouTube video info |
| `/api/youtube-audio` | GET | Stream YouTube audio |

## Database Schema

Table: `canciones`
- id, titulo, artista, duracion
- archivo_mp3, archivo_xml, youtube_url
- nivel_id (FK), tags
- has_tablatura, has_karaoke (BOOLEAN)
- lyrics_with_chords, timestamps_json
- observaciones, thumbnail
- created_at, updated_at

Table: `niveles`
- 1: ELEMENTAL, 2: BÁSICO, 3: INTERMEDIO, 4: AVANZADO

## Admin Password
`more2000` (used in biblioteca modal)

## Navigation Flow
```
/ (Landing)
└── /biblioteca?mode=tablatura → Tablatura
└── /biblioteca?mode=karaoke   → Karaoke
```

## Docker Commands (local)
```bash
cd ~/openclaw/workspace/ukesync_from_synology/
docker-compose up -d      # Start
docker-compose down        # Stop
docker-compose down -v     # Stop + remove volumes
docker-compose restart     # Restart
```

## Rebuilding API Image
```bash
docker build -t saronni/ukeintavula-api:latest -f ./docker/python/Dockerfile .
```

## Synology Deployment
1. Upload `docker-compose.yml` and image tar to Synology
2. In Portainer: Images → Import image (tar file)
3. Stacks → Add stack → Web editor → paste compose file
4. Deploy

## TODO / Known Issues
- Video logo: place file at `public/assets/videos/logo_animado.mp4`
- Tablatura player needs testing with real songs
- YouTube audio streaming needs yt-dlp (may not work on Synology Python 3.8)

# UKEINTAVULA

Aplicación web de ukelele que sincroniza tablaturas (Canvas) con audio en tiempo real.

## Desarrollo Local

### Requisitos

- Docker y Docker Compose
- Python 3.11+ (solo para desarrollo sin Docker)

### Setup

1. **Copiar variables de entorno:**
   ```bash
   cp .env.example .env
   # Editar .env con las contraseñas deseadas
   ```

2. **Iniciar contenedores:**
   ```bash
   docker compose up -d
   ```

3. **Verificar que funciona:**
   - API: http://localhost:3001/api/biblioteca
   - Frontend: http://localhost:3001/

### Migrar canciones desde Synology

```bash
# Asegúrate de estar en la red del Synology
python scripts/migrate_songs.py

# O exportar a JSON primero
python scripts/migrate_songs.py --export-json backup.json
python scripts/migrate_songs.py --import-json backup.json
```

## Estructura

```
├── docker/
│   ├── docker-compose.yml
│   └── python/Dockerfile
├── src/
│   ├── server.py           # API server
│   └── requirements.txt
├── public/                 # Frontend
│   ├── index.html         # Landing
│   ├── tablatura/         # Tablatura visualizer
│   ├── acordes/           # Lyrics with chords
│   └── src/               # JS modules
├── scripts/
│   ├── init_db.sql        # Database schema
│   └── migrate_songs.py   # Migration tool
└── data/                  # Audio/XML files (fuera de Git)
```

## API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/biblioteca` | GET | Lista de canciones |
| `/api/niveles` | GET | Niveles de dificultad |
| `/api/youtube-info?url=...` | GET | Info de YouTube |
| `/api/save-song` | POST | Guardar canción |

## Despliegue en Synology

1. Clonar el repo en el Synology
2. Crear `.env` con contraseñas
3. `docker compose up -d`
4. Configurar firewall/puerto si es necesario

## Tech Stack

- **Backend:** Python 3.11 + pymysql
- **Database:** MariaDB 10.11
- **Frontend:** HTML5 Canvas, Web Audio API
- **YouTube:** yt-dlp

-- UKEINTAVULA Database Schema
-- MariaDB 10.11

CREATE DATABASE IF NOT EXISTS ukesync_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ukesync_db;

-- Niveles (difficulty levels)
CREATE TABLE IF NOT EXISTS niveles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canciones (songs)
CREATE TABLE IF NOT EXISTS canciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    artista VARCHAR(255) DEFAULT '',
    duracion INT DEFAULT 0,
    archivo_mp3 VARCHAR(500) DEFAULT '',
    archivo_xml VARCHAR(500) DEFAULT '',
    thumbnail VARCHAR(500) DEFAULT '',
    youtube_url VARCHAR(500) DEFAULT '',
    nivel_id INT DEFAULT 1,
    lyrics_with_chords TEXT,
    timestamps_json TEXT,
    observaciones TEXT,
    tags VARCHAR(500) DEFAULT '',
    has_tablatura BOOLEAN DEFAULT FALSE,
    has_karaoke BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (nivel_id) REFERENCES niveles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para búsqueda
CREATE INDEX idx_canciones_titulo ON canciones(titulo);
CREATE INDEX idx_canciones_artista ON canciones(artista);
CREATE INDEX idx_canciones_nivel ON canciones(nivel_id);

-- Datos iniciales: Niveles
INSERT INTO niveles (nombre) VALUES 
    ('ELEMENTAL'),
    ('BÁSICO'),
    ('INTERMEDIO'),
    ('AVANZADO')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- Datos iniciales: Canciones de ejemplo (vacío - migración desde Synology)
-- Las canciones reales se migran con el script migrate_songs.py
INSERT INTO canciones (titulo, artista, nivel_id, duracion, observaciones) VALUES
    ('Escala Do Mayor', 'UKEINTAVULA', 1, 10, 'Escala básica de Do Mayor para principiantes'),
    ('Escala Re Mayor', 'UKEINTAVULA', 1, 12, 'Escala básica de Re Mayor');

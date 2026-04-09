/**
 * UIControls - Gestiona toda la UI de UKESYNC
 */
export class UIControls {
  constructor() {
    this.audioEngine = null;
    this.visualizer = null;
    this.bucleEngine = null;
  }

  init(audioEngine, visualizer, bucleEngine) {
    this.audioEngine = audioEngine;
    this.visualizer = visualizer;
    this.bucleEngine = bucleEngine;

    this.bindEvents();
  }

  bindEvents() {
    // Playback buttons
    document.getElementById('play-btn').addEventListener('click', () => {
      if (this.audioEngine) {
        this.audioEngine.play();
        this.updatePlaybackState(true);
      }
    });

    document.getElementById('pause-btn').addEventListener('click', () => {
      if (this.audioEngine) {
        this.audioEngine.pause();
        this.updatePlaybackState(false);
      }
    });

    document.getElementById('stop-btn').addEventListener('click', () => {
      if (this.audioEngine) {
        this.audioEngine.stop();
        this.updatePlaybackState(false);
        this.updateTime(0, this.audioEngine.duration || 0);
      }
    });

    // Transport
    document.getElementById('prev-btn').addEventListener('click', () => {
      if (this.audioEngine) {
        this.audioEngine.seek(Math.max(0, (this.audioEngine.currentTime || 0) - 5));
      }
    });

    document.getElementById('next-btn').addEventListener('click', () => {
      if (this.audioEngine) {
        const dur = this.audioEngine.duration || 0;
        this.audioEngine.seek(Math.min(dur, (this.audioEngine.currentTime || 0) + 5));
      }
    });

    // Progress bar seek
    document.getElementById('progress-bar').addEventListener('input', (e) => {
      if (this.audioEngine && this.audioEngine.duration) {
        const time = (parseFloat(e.target.value) / 100) * this.audioEngine.duration;
        this.audioEngine.seek(time);
      }
    });

    // Bucle toggle
    document.getElementById('bucle-btn').addEventListener('click', () => {
      if (this.bucleEngine) {
        const enabled = !this.bucleEngine.isBucleEnabled();
        this.bucleEngine.enableBucle(enabled);
        this.updateBucleState(enabled);
      }
    });

    // Offset slider
    document.getElementById('offset-slider').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      document.getElementById('offset-value').textContent = (val >= 0 ? '+' : '') + val + 'ms';
      if (this.audioEngine) {
        this.audioEngine.offset = val / 1000; // ms to seconds
      }
    });

    // Speed slider
    document.getElementById('speed-slider').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById('speed-value').textContent = val.toFixed(2) + 'x';
      document.getElementById('velocidad-display').textContent = val.toFixed(1) + 'x';
      if (this.audioEngine) {
        this.audioEngine.setPlaybackRate(val);
      }
    });

    // File: MusicXML
    document.getElementById('xml-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        console.log('[UIControls] MusicXML cargado:', file.name);
        console.log('[UIControls] Contenido XML (primeros 500 chars):', text.substring(0, 500));
        this.showMessage(`XML cargado: ${file.name}`, 'success');
      } catch (err) {
        console.error('[UIControls] Error leyendo XML:', err);
        this.showMessage('Error al leer el archivo XML', 'error');
      }
    });

    // File: Audio
    document.getElementById('audio-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const arrayBuffer = await file.arrayBuffer();
        console.log('[UIControls] Audio cargado:', file.name, '(' + (arrayBuffer.byteLength / 1024 / 1024).toFixed(2) + ' MB)');

        if (this.audioEngine) {
          await this.audioEngine.loadAudio(arrayBuffer);
          this.showMessage(`Audio cargado: ${file.name}`, 'success');
        } else {
          this.showMessage('AudioEngine no disponible', 'error');
        }
      } catch (err) {
        console.error('[UIControls] Error cargando audio:', err);
        this.showMessage('Error al cargar el audio', 'error');
      }
    });
  }

  updatePlaybackState(isPlaying) {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');

    if (isPlaying) {
      playBtn.style.display = 'none';
      pauseBtn.style.display = 'flex';
    } else {
      playBtn.style.display = 'flex';
      pauseBtn.style.display = 'none';
    }
  }

  updateTime(currentTime, duration) {
    const currentEl = document.getElementById('current-time');
    const totalEl = document.getElementById('total-time');
    const progressBar = document.getElementById('progress-bar');

    currentEl.textContent = this.formatTime(currentTime);
    totalEl.textContent = this.formatTime(duration);

    if (duration > 0) {
      progressBar.value = (currentTime / duration) * 100;
    } else {
      progressBar.value = 0;
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  updateBucleState(enabled) {
    const btn = document.getElementById('bucle-btn');
    if (enabled) {
      btn.classList.add('active');
      btn.textContent = '🔁 Bucle ON';
    } else {
      btn.classList.remove('active');
      btn.textContent = '🔁 Bucle OFF';
    }
  }

  showMessage(text, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = text;
    toast.className = 'toast ' + type;

    // Force reflow
    toast.offsetHeight;

    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

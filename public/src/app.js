/**
 * app.js — UKESYNC v2.0
 * Orquestador: conecta AudioSyncEngine + TabVisualizer + BucleEngine + UIControls
 */

import AudioSyncEngine from './engine/AudioSyncEngine.js';
import BucleEngine     from './engine/BucleEngine.js';
import TabVisualizer   from './components/TabVisualizer.js';
import UIControls      from './components/UIControls.js';

// ─── INSTANCIAS ──────────────────────────────────────────────────────────────
const audioEngine = new AudioSyncEngine();
const bucleEngine = new BucleEngine(audioEngine);
const canvas      = document.getElementById('tab-canvas');
const visualizer  = new TabVisualizer(canvas, audioEngine);
const ui          = new UIControls();

// ─── ESCALA DO MAYOR — precargada ────────────────────────────────────────────
// C  D  E  F  G  A  B  C  (100 BPM → 0.6s/nota, última 1.2s)
const mockNotes = [
    { timeStart: 0.0, string: 2, fret: 3, duration: 0.6, note: 'C', measure: 1 },
    { timeStart: 0.6, string: 2, fret: 5, duration: 0.6, note: 'D', measure: 1 },
    { timeStart: 1.2, string: 3, fret: 0, duration: 0.6, note: 'E', measure: 1 },
    { timeStart: 1.8, string: 3, fret: 1, duration: 0.6, note: 'F', measure: 1 },
    { timeStart: 2.4, string: 1, fret: 0, duration: 0.6, note: 'G', measure: 2 },
    { timeStart: 3.0, string: 4, fret: 0, duration: 0.6, note: 'A', measure: 2 },
    { timeStart: 3.6, string: 4, fret: 2, duration: 0.6, note: 'B', measure: 2 },
    { timeStart: 4.2, string: 4, fret: 3, duration: 1.2, note: 'C', measure: 2 },
];

// Cargar notas en todos los motores
visualizer.loadNotes(mockNotes);
visualizer.setBPM(100);
bucleEngine.setNotes(mockNotes);

// Inicializar UI con los tres motores
ui.init(audioEngine, visualizer, bucleEngine);

// Arrancar visualización (preview sin audio)
visualizer.start();

// ─── PRECARGAR AUDIO DO MAYOR ────────────────────────────────────────────────
fetch('../assets/audio/c-major-scale.wav')
    .then(r => r.arrayBuffer())
    .then(buf => audioEngine.loadAudio(buf))
    .catch(() => console.warn('[UKESYNC] Audio precargado no disponible'));

// ─── LOOP PRINCIPAL ──────────────────────────────────────────────────────────
function mainLoop() {
    const currentTime = audioEngine.isLoaded()
        ? audioEngine.getCurrentTime()
        : (performance.now() / 1000);

    // Actualizar bucle y detección de hits
    bucleEngine.update(currentTime);

    // Actualizar UI (barra de progreso, tiempo)
    if (audioEngine.isLoaded()) {
        ui.updateTime(currentTime, audioEngine.getDuration());
    }

    requestAnimationFrame(mainLoop);
}
mainLoop();

// ─── EVENTOS DE AUDIO ────────────────────────────────────────────────────────
audioEngine.addEventListener('play',   () => ui.updatePlaybackState(true));
audioEngine.addEventListener('pause',  () => ui.updatePlaybackState(false));
audioEngine.addEventListener('stop',   () => ui.updatePlaybackState(false));
audioEngine.addEventListener('ended',  () => ui.updatePlaybackState(false));
audioEngine.addEventListener('loaded', () => {
    ui.showMessage('🎵 Audio listo — pulsa Play', 'success');
});

// ─── EVENTOS DE JUEGO ────────────────────────────────────────────────────────
bucleEngine.addEventListener('hit', (e) => {
    const { note, accuracy } = e.detail;
    const pct = Math.round(accuracy * 100);
    ui.showMessage(`✅ ${note?.note ?? '?'} — ${pct}%`, 'success');
});

bucleEngine.addEventListener('miss', () => {
    ui.showMessage('❌ Miss', 'error');
});

bucleEngine.addEventListener('bucle-restart', () => {
    ui.showMessage('🔁 Bucle reiniciado', 'info');
});

// ─── TECLADO: cuerdas 1-4 con teclas Q W E R ────────────────────────────────
const keyMap = { q: 1, w: 2, e: 3, r: 4 };
document.addEventListener('keydown', (ev) => {
    const string = keyMap[ev.key.toLowerCase()];
    if (string) bucleEngine.registerHit(string);
});

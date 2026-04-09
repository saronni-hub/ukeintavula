// ─────────────────────────────────────────────────────────────────────────────
// TabVisualizer.js  —  UKESync v2.0  (Yousician-style ukulele fretboard)
// Vanilla JS ES6+, no dependencies, 60fps via requestAnimationFrame
// ─────────────────────────────────────────────────────────────────────────────

// ── Configurable constants ────────────────────────────────────────────────────
const CURSOR_X       = 150;   // px from left where the "play zone" lives
const LOOKAHEAD_SEC  = 5;     // seconds of notes visible ahead of cursor
const LOOKBEHIND_SEC = 0.3;   // seconds of notes visible behind cursor
const PIXELS_PER_SEC = 180;   // horizontal scale: 1 second = N pixels
const FRET_PADDING   = 0.12;  // fraction of canvas height above/below fretboard
const HIT_WINDOW_SEC = 0.08;  // ±80 ms tolerance for a "hit"

// ── String identity ───────────────────────────────────────────────────────────
// Ukulele strings (afinación GCEA estándar):
// Índice 0 = A (cuerda 4 - arriba en tablatura)
// Índice 1 = E (cuerda 3)
// Índice 2 = C (cuerda 2)
// Índice 3 = G (cuerda 1 - abajo en tablatura)
const STRING_LABELS = ['A', 'E', 'C', 'G'];
const STRING_COLORS = ['#F48FB1', '#FFD54F', '#81C784', '#4FC3F7'];

// ─────────────────────────────────────────────────────────────────────────────
class TabVisualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object|null} audioEngine  – must expose .currentTime (seconds)
   */
  constructor(canvas, audioEngine = null) {
    this.canvas      = canvas;
    this.ctx         = canvas.getContext('2d');
    this.audioEngine = audioEngine;

    this.notes   = [];   // loaded note objects
    this.bpm     = 120;  // default BPM for beat-line spacing
    this.running = false;
    this.rafId   = null;

    // Per-string hit state: { active: bool, startTime: DOMHighResTimeStamp }
    this._hitState = STRING_LABELS.map(() => ({ active: false, startTime: 0 }));

    // Bind resize + DPR support
    this._handleResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._handleResize);
    this._handleResize();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * @param {Array<{timeStart:number, string:number, fret:number,
   *                duration:number, note?:string, measure?:number}>} notesArray
   * String index is 1-based (1=G, 2=C, 3=E, 4=A);
   * Internamente mapeamos a: 0=A (arriba), 1=E, 2=C, 3=G (abajo)
   */
  loadNotes(notesArray) {
    this.notes = notesArray
      .map(n => ({ 
        ...n, 
        // Mapeo: string 4(A)→0, 3(E)→1, 2(C)→2, 1(G)→3
        _stringIdx: 4 - n.string 
      }))
      .sort((a, b) => a.timeStart - b.timeStart);
  }

  /** @param {number} bpm */
  setBPM(bpm) { this.bpm = bpm > 0 ? bpm : 120; }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  _handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this._cssW = rect.width;
    this._cssH = rect.height;
  }

  /** Returns audio engine's current playback position in seconds, or 0. */
  get _currentTime() {
    return this.audioEngine?.currentTime ?? 0;
  }

  // ── Main draw ───────────────────────────────────────────────────────────────

  _draw() {
    const ctx  = this.ctx;
    const W    = this._cssW;
    const H    = this._cssH;
    const now  = this._currentTime;
    const ts   = performance.now() / 1000; // wall-clock seconds for animations

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // Fretboard geometry
    const fbTop    = H * FRET_PADDING;
    const fbBottom = H * (1 - FRET_PADDING);
    const fbH      = fbBottom - fbTop;

    // String Y positions (evenly distributed inside fretboard)
    const stringYs = STRING_LABELS.map((_, i) =>
      fbTop + fbH * ((i + 1) / (STRING_LABELS.length + 1))
    );

    this._drawFretboard(ctx, W, H, fbTop, fbBottom, fbH);
    this._drawBeatLines(ctx, W, fbTop, fbBottom, now);
    this._drawStringLines(ctx, W, stringYs);
    this._drawNotes(ctx, W, stringYs, fbH, now);
    this._drawCursorLine(ctx, H);
    this._drawCursorBalls(ctx, stringYs, ts, now);
    this._drawStringLabels(ctx, stringYs, fbH);
  }

  // ── Fretboard ───────────────────────────────────────────────────────────────

  _drawFretboard(ctx, W, H, fbTop, fbBottom, fbH) {
    // Green fretboard body
    ctx.fillStyle = '#2d5a1b';
    ctx.beginPath();
    ctx.roundRect(CURSOR_X - 10, fbTop, W - CURSOR_X + 10, fbH, 6);
    ctx.fill();

    // Subtle wood-grain gradient overlay
    const grad = ctx.createLinearGradient(0, fbTop, 0, fbBottom);
    grad.addColorStop(0,   'rgba(0,0,0,0.18)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(CURSOR_X - 10, fbTop, W - CURSOR_X + 10, fbH, 6);
    ctx.fill();
  }

  // ── Beat / fret lines ───────────────────────────────────────────────────────

  _drawBeatLines(ctx, W, fbTop, fbBottom, now) {
    // px distance between beat lines = one beat duration × PIXELS_PER_SEC
    const beatPx = PIXELS_PER_SEC * (60 / this.bpm);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 1;
    ctx.font        = '9px monospace';
    ctx.fillStyle   = 'rgba(255,255,255,0.25)';
    ctx.textAlign   = 'center';

    // Offset so lines scroll in sync with playback
    // x of a beat at time T: CURSOR_X + (T - now) * PIXELS_PER_SEC
    // First visible beat to the right of CURSOR_X
    const firstBeatTime = Math.ceil(now * this.bpm / 60) * (60 / this.bpm);
    let beatIndex = Math.round(firstBeatTime * this.bpm / 60);

    for (let t = firstBeatTime; ; t += 60 / this.bpm) {
      // x position: distance from cursor = (t - now) * PIXELS_PER_SEC
      const x = CURSOR_X + (t - now) * PIXELS_PER_SEC;
      if (x > W + beatPx) break;
      if (x > CURSOR_X) {
        ctx.beginPath();
        ctx.moveTo(x, fbTop);
        ctx.lineTo(x, fbBottom);
        ctx.stroke();
        // Beat number label at top
        ctx.fillText(beatIndex + 1, x, fbTop - 3);
      }
      beatIndex++;
    }
    ctx.restore();
  }

  // ── String lines ─────────────────────────────────────────────────────────────

  _drawStringLines(ctx, stringYs) {
    stringYs.forEach((y, i) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(220,210,180,0.45)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(CURSOR_X, y);
      ctx.lineTo(this._cssW, y);
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── Note blocks ─────────────────────────────────────────────────────────────

  _drawNotes(ctx, W, stringYs, fbH, now) {
    const blockH = Math.min(fbH * 0.22, 26); // ~24px capped

    for (const note of this.notes) {
      // ── Horizontal positioning math ──────────────────────────────────────
      // The left edge of the block is at:
      //   x = CURSOR_X + (note.timeStart - now) * PIXELS_PER_SEC
      // The block's right edge is at x + blockW.
      // The block's CENTER crosses the cursor when:
      //   x + blockW/2 === CURSOR_X  →  note.timeStart - now ≈ -duration/2
      const blockW = Math.max(note.duration * PIXELS_PER_SEC, 18);
      const x      = CURSOR_X + (note.timeStart - now) * PIXELS_PER_SEC;

      // Cull: skip notes entirely off-screen
      if (x + blockW < 0)  continue;
      if (x > W)            continue;

      const si    = note._stringIdx;
      const y     = stringYs[si];
      const color = STRING_COLORS[si];

      // Is this note in the hit window?
      // Hit center: when the block's midpoint aligns with cursor
      // midTime = note.timeStart + duration/2
      // distance = |now - midTime|
      const midTime  = note.timeStart + note.duration / 2;
      const inHit    = Math.abs(now - midTime) <= HIT_WINDOW_SEC;

      this._drawNoteBlock(ctx, x, y, blockW, blockH, color, note, inHit);
    }
  }

  _drawNoteBlock(ctx, x, y, w, h, color, note, inHit) {
    const r = 8; // border radius

    ctx.save();

    // Glow when in hit window
    if (inHit) {
      ctx.shadowColor = color;
      ctx.shadowBlur  = 18;
    }

    // Fill
    ctx.fillStyle = inHit ? _lighten(color, 0.25) : color;
    _roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.fill();

    // Border
    ctx.strokeStyle = inHit ? '#ffffff' : _darken(color, 0.3);
    ctx.lineWidth   = inHit ? 2.5 : 1;
    _roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Fret number — centered in block
    if (w > 14) {
      ctx.fillStyle  = '#1a1a1a';
      ctx.font       = `bold ${Math.min(h * 0.65, 14)}px sans-serif`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(note.fret), x + w / 2, y);
    }

    // Note name — small label above block if provided
    if (note.note && w > 20) {
      ctx.fillStyle    = 'rgba(255,255,255,0.8)';
      ctx.font         = '9px sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(note.note, x + w / 2, y - h / 2 - 2);
    }

    ctx.restore();
  }

  // ── Cursor line ─────────────────────────────────────────────────────────────

  _drawCursorLine(ctx, H) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.moveTo(CURSOR_X, 0);
    ctx.lineTo(CURSOR_X, H);
    ctx.stroke();
    ctx.restore();
  }

  // ── Cursor balls + hit feedback ─────────────────────────────────────────────

  _drawCursorBalls(ctx, stringYs, ts, now) {
    // Pulse: scale oscillates 1.0 ↔ 1.3 over ~0.8 s
    const pulse = 1.0 + 0.15 * (1 + Math.sin(ts * (2 * Math.PI / 0.8))) / 2;

    stringYs.forEach((y, i) => {
      const color = STRING_COLORS[i];
      const hit   = this._hitState[i];

      // Check if any note on this string is currently in hit window
      const isHit = this.notes.some(n => {
        if (n._stringIdx !== i) return false;
        const midTime = n.timeStart + n.duration / 2;
        return Math.abs(now - midTime) <= HIT_WINDOW_SEC;
      });

      // Update hit state
      if (isHit && !hit.active) {
        hit.active    = true;
        hit.startTime = performance.now();
      } else if (!isHit) {
        hit.active = false;
      }

      const baseR = 9;

      ctx.save();

      if (hit.active) {
        // Explode: scale up fast
        const elapsed = (performance.now() - hit.startTime) / 1000;
        const boom    = 1 + elapsed * 4; // grows quickly
        const alpha   = Math.max(0, 1 - elapsed * 3);

        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur  = 30;
        ctx.beginPath();
        ctx.arc(CURSOR_X, y, baseR * boom, 0, Math.PI * 2);
        ctx.fill();

        // "¡Toca!" text with fade-out
        ctx.globalAlpha  = Math.max(0, 1 - elapsed * 2.5);
        ctx.fillStyle    = '#ffffff';
        ctx.font         = 'bold 16px sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowBlur   = 10;
        ctx.fillText('¡Toca!', CURSOR_X, y - baseR - 8);

      } else {
        // Idle pulsing ball
        const r = baseR * pulse;
        ctx.fillStyle   = '#ffffff';
        ctx.shadowColor = color;
        ctx.shadowBlur  = 10;
        ctx.beginPath();
        ctx.arc(CURSOR_X, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Inner colored dot
        ctx.fillStyle = color;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(CURSOR_X, y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  // ── String labels (left panel) ───────────────────────────────────────────────

  _drawStringLabels(ctx, stringYs, fbH) {
    const fontSize = Math.min(fbH * 0.13, 15);
    ctx.save();
    ctx.font         = `bold ${fontSize}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    stringYs.forEach((y, i) => {
      const color = STRING_COLORS[i];
      ctx.fillStyle   = color;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 6;
      ctx.fillText(STRING_LABELS[i], CURSOR_X * 0.45, y);
    });

    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: draw a rounded rectangle path (polyfill for older browsers)
// ─────────────────────────────────────────────────────────────────────────────
function _roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    const minR = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + minR, y);
    ctx.lineTo(x + w - minR, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + minR);
    ctx.lineTo(x + w, y + h - minR);
    ctx.quadraticCurveTo(x + w, y + h, x + w - minR, y + h);
    ctx.lineTo(x + minR, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - minR);
    ctx.lineTo(x, y + minR);
    ctx.quadraticCurveTo(x, y, x + minR, y);
    ctx.closePath();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: naive hex color lightening / darkening
// ─────────────────────────────────────────────────────────────────────────────
function _hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function _lighten(hex, amount) {
  const [r, g, b] = _hexToRgb(hex);
  return `rgb(${Math.min(255, r + 255 * amount)|0},${Math.min(255, g + 255 * amount)|0},${Math.min(255, b + 255 * amount)|0})`;
}

function _darken(hex, amount) {
  const [r, g, b] = _hexToRgb(hex);
  return `rgb(${Math.max(0, r - 255 * amount)|0},${Math.max(0, g - 255 * amount)|0},${Math.max(0, b - 255 * amount)|0})`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default TabVisualizer;

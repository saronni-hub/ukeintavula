/**
 * BucleEngine - Motor de lógica de juego para UKESYNC.
 * Sistema de bucle (loop de compases) y detección de "hit" para práctica interactiva.
 * @extends EventTarget
 */
class BucleEngine extends EventTarget {
  /**
   * Crea una instancia de BucleEngine.
   * @param {Object} audioEngine - Instancia del motor de audio (debe tener método seek).
   */
  constructor(audioEngine) {
    super();
    this._audioEngine = audioEngine;

    // Bucle
    this._bucleStart = 0;
    this._bucleEnd = 0;
    this._bucleEnabled = false;

    // Notas
    this._notes = [];               // Array de objetos { timeStart, string }
    this._activeNotes = new Set();  // Índices de notas ya "hit" en este ciclo

    // Puntuación
    this._hits = 0;
    this._misses = 0;
    this._totalHits = 0;            // hits + misses (intentos)
    this._accuracySum = 0;          // suma de accuracy de cada hit (0.5 o 1.0)

    // Tiempo actual (actualizado en update)
    this._currentTime = 0;
  }

  // --- BUCLE ---

  /**
   * Define el rango del bucle en segundos.
   * @param {number} startSec - Tiempo de inicio (segundos).
   * @param {number} endSec - Tiempo de fin (segundos).
   */
  setBucleRange(startSec, endSec) {
    if (startSec < 0 || endSec <= startSec) {
      throw new Error('BucleEngine: rango inválido');
    }
    this._bucleStart = startSec;
    this._bucleEnd = endSec;
  }

  /**
   * Activa o desactiva el bucle.
   * @param {boolean} enabled - true para activar.
   */
  enableBucle(enabled) {
    this._bucleEnabled = enabled;
  }

  /**
   * Indica si el bucle está activado.
   * @returns {boolean}
   */
  isBucleEnabled() {
    return this._bucleEnabled;
  }

  // --- DETECCIÓN DE HIT ---

  /**
   * Carga el array de notas para evaluación.
   * @param {Array} notesArray - Cada nota debe tener { timeStart, string }.
   */
  setNotes(notesArray) {
    this._notes = notesArray.slice(); // copia
    this._activeNotes.clear();
    this.resetScore();
  }

  /**
   * Registra un hit del usuario en una cuerda.
   * Debe llamarse cuando el usuario pulsa una cuerda (1-4).
   * @param {number} stringNumber - Número de cuerda (1 a 4).
   * @param {number} [time] - Tiempo actual del audio en segundos. Si no se proporciona,
   *                          se usará el último tiempo pasado a update().
   */
  registerHit(stringNumber, time = undefined) {
    if (stringNumber < 1 || stringNumber > 4) {
      console.warn(`BucleEngine: número de cuerda inválido ${stringNumber}`);
      return;
    }

    const currentTime = time !== undefined ? time : this._currentTime;

    // Buscar la nota más cercana en la misma cuerda que aún no haya sido hit
    // y que esté dentro de la ventana de ±100ms.
    const hitWindow = 0.1; // 100ms en segundos
    const epsilon = 1e-9;  // margen para errores de punto flotante
    let bestNote = null;
    let bestDelta = Infinity;
    let bestIndex = -1;

    for (let i = 0; i < this._notes.length; i++) {
      const note = this._notes[i];
      if (note.string !== stringNumber) continue;
      if (this._activeNotes.has(i)) continue; // ya hit

      const delta = Math.abs(currentTime - note.timeStart);
      if (delta <= hitWindow + epsilon) {
        if (delta < bestDelta) {
          bestDelta = delta;
          bestNote = note;
          bestIndex = i;
        }
      }
    }

    if (bestNote) {
      // HIT
      this._activeNotes.add(bestIndex);
      this._hits++;
      this._totalHits++;

      // Calcular accuracy: 1.0 si delta < 30ms, 0.5 si delta < 100ms
      const accuracy = bestDelta < 0.03 + epsilon ? 1.0 : 0.5;
      this._accuracySum += accuracy;

      this.dispatchEvent(new CustomEvent('hit', {
        detail: {
          note: bestNote,
          string: stringNumber,
          accuracy: accuracy,
          delta: bestDelta
        }
      }));
    } else {
      // MISS
      this._misses++;
      this._totalHits++;

      this.dispatchEvent(new CustomEvent('miss', {
        detail: { string: stringNumber }
      }));
    }
  }

  // --- UPDATE LOOP ---

  /**
   * Actualiza la lógica del motor. Debe llamarse desde requestAnimationFrame
   * (o similar) con el tiempo actual del audio.
   * @param {number} currentTime - Tiempo actual del audio en segundos.
   */
  update(currentTime) {
    this._currentTime = currentTime;

    // Lógica de bucle
    if (this._bucleEnabled && currentTime >= this._bucleEnd) {
      this._audioEngine.seek(this._bucleStart);
      this._currentTime = this._bucleStart; // ajustar para siguientes cálculos
      this._activeNotes.clear(); // resetear hits dentro del bucle

      this.dispatchEvent(new CustomEvent('bucle-restart', {
        detail: { startSec: this._bucleStart }
      }));
    }

    // (Opcional) Detección automática de misses por notas no pulsadas.
    // Se podría implementar si se desea, pero la especificación solo requiere
    // miss cuando el usuario pulsa y no hay nota en ventana.
  }

  // --- PUNTUACIÓN ---

  /**
   * Devuelve el estado actual de la puntuación.
   * @returns {Object} - { hits, misses, total, accuracy }
   */
  getScore() {
    const accuracy = this._hits > 0 ? this._accuracySum / this._hits : 0;
    return {
      hits: this._hits,
      misses: this._misses,
      total: this._totalHits,
      accuracy: accuracy
    };
  }

  /**
   * Reinicia los contadores de puntuación.
   */
  resetScore() {
    this._hits = 0;
    this._misses = 0;
    this._totalHits = 0;
    this._accuracySum = 0;
    this._activeNotes.clear();
  }
}

export default BucleEngine;
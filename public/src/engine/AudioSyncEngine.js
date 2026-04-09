/**
 * AudioSyncEngine - Motor de sincronización de audio con precisión de milisegundos.
 * Gestiona la reproducción de audio usando Web Audio API, permitiendo ajuste de offset
 * para corregir desfases entre audio y partitura.
 */
class AudioSyncEngine extends EventTarget {
    constructor() {
        super();

        // Contexto de audio (creación diferida para cumplir con políticas de autoplay)
        this.audioContext = null;

        // Buffer de audio decodificado
        this.audioBuffer = null;

        // Nodo de fuente de audio actual
        this.sourceNode = null;

        // Estado de reproducción
        this.isPlaying = false;

        // Tiempo de inicio de la reproducción actual (en tiempo absoluto del audioContext)
        this.startTime = 0;

        // Posición acumulada en segundos (cuando está pausado)
        this.pausedAt = 0;

        // Offset en milisegundos (positivo = retrasa tablatura, negativo = adelanta tablatura)
        this.offsetMs = 0;

        // Velocidad de reproducción (1.0 = normal)
        this.playbackRate = 1.0;

        // Referencia al nodo de ganancia para control de volumen (opcional)
        this.gainNode = null;
    }

    /**
     * Carga y decodifica un archivo de audio a partir de un ArrayBuffer.
     * @param {ArrayBuffer} arrayBuffer - Buffer de audio (MP3, WAV, etc.)
     * @returns {Promise<void>}
     */
    async loadAudio(arrayBuffer) {
        console.log('[AudioSyncEngine] loadAudio() llamado, tamaño buffer:', arrayBuffer.byteLength, 'bytes');
        
        // Crear contexto de audio si aún no existe
        if (!this.audioContext) {
            console.log('[AudioSyncEngine] Creando AudioContext para decodificación');
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        console.log('[AudioSyncEngine] Decodificando audio...');
        try {
            // Decodificar el buffer
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('[AudioSyncEngine] Audio decodificado correctamente');
            console.log('[AudioSyncEngine] Canales:', this.audioBuffer.numberOfChannels);
            console.log('[AudioSyncEngine] Sample rate:', this.audioBuffer.sampleRate);
            console.log('[AudioSyncEngine] Duración:', this.audioBuffer.duration, 'segundos');
        } catch (error) {
            console.error('[AudioSyncEngine] Error al decodificar audio:', error);
            throw error;
        }

        // Resetear estado de reproducción
        this.stop();
        this.pausedAt = 0;
        this.startTime = 0;

        console.log('[AudioSyncEngine] Audio cargado y listo');
        this.dispatchEvent(new CustomEvent('loaded'));
    }

    /**
     * Inicia o reanuda la reproducción.
     * Si ya está reproduciendo, no hace nada.
     */
    play() {
        console.log('[AudioSyncEngine] play() llamado');
        if (this.isPlaying) {
            console.log('[AudioSyncEngine] Ya está reproduciendo');
            return;
        }
        if (!this.audioBuffer) {
            console.warn('[AudioSyncEngine] No hay audio cargado.');
            return;
        }

        console.log('[AudioSyncEngine] AudioBuffer cargado:', this.audioBuffer);
        console.log('[AudioSyncEngine] Duración:', this.audioBuffer.duration, 'segundos');

        // Crear contexto si aún no existe (por si loadAudio no lo creó)
        if (!this.audioContext) {
            console.log('[AudioSyncEngine] Creando nuevo AudioContext');
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        console.log('[AudioSyncEngine] Estado AudioContext:', this.audioContext.state);
        
        // Si el contexto está suspendido (política de autoplay), reanudarlo
        if (this.audioContext.state === 'suspended') {
            console.log('[AudioSyncEngine] Reanudando AudioContext suspendido');
            this.audioContext.resume();
        }

        // Crear nodo de fuente
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;

        // Configurar velocidad de reproducción
        this.sourceNode.playbackRate.value = this.playbackRate;

        // Crear nodo de ganancia (para volumen, opcional)
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;

        // Conectar fuente → ganancia → destino
        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        // Calcular el momento de inicio en la línea de tiempo del audioContext
        const now = this.audioContext.currentTime;
        // El audio debe comenzar desde pausedAt, pero ajustado por el offset de inicio
        this.startTime = now - this.pausedAt;

        // Programar la reproducción desde pausedAt
        console.log('[AudioSyncEngine] Iniciando reproducción en:', now, 'desde offset:', this.pausedAt);
        try {
            this.sourceNode.start(now, this.pausedAt);
            console.log('[AudioSyncEngine] Reproducción iniciada correctamente');
        } catch (error) {
            console.error('[AudioSyncEngine] Error al iniciar reproducción:', error);
            return;
        }

        this.isPlaying = true;
        console.log('[AudioSyncEngine] Estado: reproduciendo');

        // Configurar evento de finalización
        this.sourceNode.onended = () => {
            console.log('[AudioSyncEngine] Reproducción finalizada');
            this.isPlaying = false;
            this.pausedAt = 0;
            this.startTime = 0;
            this.dispatchEvent(new CustomEvent('ended'));
        };

        this.dispatchEvent(new CustomEvent('play'));
    }

    /**
     * Pausa la reproducción y guarda la posición actual.
     */
    pause() {
        if (!this.isPlaying || !this.sourceNode) return;

        // Detener la fuente actual
        this.sourceNode.stop();
        this.sourceNode = null;

        // Actualizar pausedAt con la posición actual (sin offset)
        this.pausedAt = this.getCurrentAudioTime();
        this.isPlaying = false;

        this.dispatchEvent(new CustomEvent('pause'));
    }

    /**
     * Detiene la reproducción y reinicia a posición cero.
     */
    stop() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch (e) {
                // Ignorar errores si ya está detenido
            }
            this.sourceNode = null;
        }
        this.isPlaying = false;
        this.pausedAt = 0;
        this.startTime = 0;

        this.dispatchEvent(new CustomEvent('stop'));
    }

    /**
     * Salta a un punto exacto del audio (en segundos).
     * Si está reproduciendo, reprograma la reproducción desde la nueva posición.
     * @param {number} seconds - Posición deseada en segundos (0 = inicio del buffer)
     */
    seek(seconds) {
        // Asegurar que la posición esté dentro de los límites del buffer
        const duration = this.audioBuffer ? this.audioBuffer.duration : 0;
        const clamped = Math.max(0, Math.min(seconds, duration));

        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.pause();
        }

        // Actualizar posición pausada
        this.pausedAt = clamped;

        if (wasPlaying) {
            // Reanudar desde la nueva posición
            this.play();
        }

        this.dispatchEvent(new CustomEvent('seek', { detail: clamped }));
    }

    /**
     * Devuelve el tiempo actual de reproducción en segundos con precisión de milisegundos,
     * descontando el offset para sincronización exacta con la tablatura.
     * 
     * Lógica matemática:
     * - Si está reproduciendo: tiempo = audioContext.currentTime - startTime
     * - Si está pausado: tiempo = pausedAt
     * - Luego se resta el offset (convertido a segundos), porque offset positivo
     *   retrasa la tablatura respecto al audio, es decir, el audio está adelantado.
     *   Por tanto, para que la tablatura se sincronice, debemos restar el offset.
     *   Ejemplo: offset = +100 ms (audio 100 ms adelantado), restando 0.1 segundos
     *   hace que el tiempo reportado sea 0.1 s menor, retrasando la tablatura.
     * @returns {number} Tiempo actual en segundos (con offset aplicado)
     */
    getCurrentTime() {
        const rawTime = this.getCurrentAudioTime();
        // Convertir offset a segundos (positivo = retrasa tablatura)
        const offsetSeconds = this.offsetMs / 1000;
        // Restar offset: tiempo reportado = tiempo real - offset
        const syncedTime = rawTime - offsetSeconds;
        // Asegurar que no sea negativo
        return Math.max(0, syncedTime);
    }

    /**
     * Devuelve el tiempo actual de reproducción en segundos SIN aplicar offset.
     * Uso interno.
     */
    getCurrentAudioTime() {
        if (this.isPlaying && this.audioContext) {
            // Tiempo transcurrido desde que se inició la reproducción actual
            return this.audioContext.currentTime - this.startTime;
        } else {
            return this.pausedAt;
        }
    }

    /**
     * Ajusta el offset en milisegundos (retraso/adelanto entre audio y partitura).
     * @param {number} ms - Offset en milisegundos. Positivo retrasa la tablatura, negativo la adelanta.
     */
    setOffset(ms) {
        const oldOffset = this.offsetMs;
        this.offsetMs = ms;
        if (oldOffset !== ms) {
            this.dispatchEvent(new CustomEvent('offsetchange', { detail: ms }));
        }
    }

    /**
     * Devuelve el offset actual en segundos.
     * @returns {number} Offset en segundos (positivo = retraso de tablatura)
     */
    getOffsetSeconds() {
        return this.offsetMs / 1000;
    }

    /**
     * Controla la velocidad de reproducción.
     * @param {number} rate - Factor de velocidad (0.5 = mitad, 1.0 = normal, 2.0 = doble)
     */
    setPlaybackRate(rate) {
        this.playbackRate = rate;
        if (this.sourceNode) {
            this.sourceNode.playbackRate.value = rate;
        }
        this.dispatchEvent(new CustomEvent('ratechange', { detail: rate }));
    }

    /**
     * Devuelve la duración total del audio cargado (en segundos).
     * @returns {number} Duración en segundos, 0 si no hay audio cargado.
     */
    getDuration() {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    /**
     * Devuelve si hay un audio cargado.
     */
    isLoaded() {
        return !!this.audioBuffer;
    }

    /**
     * Libera recursos (detiene reproducción, cierra contexto).
     */
    dispose() {
        this.stop();
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.audioBuffer = null;
    }
}

export default AudioSyncEngine;
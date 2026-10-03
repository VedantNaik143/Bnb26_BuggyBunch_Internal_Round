/**
 * Web Audio API helper for microphone capture,
 * audio level analysis, and PCM audio preparation.
 */

export interface MicController {
  start: () => Promise<boolean>;
  stop: () => void;
  getAudioLevel: () => number; // 0 to 100
  isListening: () => boolean;
  getError: () => string | null;

  /**
   * Optional callback that receives realtime PCM 16-bit audio chunks.
   * These chunks will later be sent to the Gemini Live backend.
   */
  onPCMChunk?: (chunk: ArrayBuffer) => void;
}

export class BrowserMicrophone implements MicController {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  private dataArray: Uint8Array<ArrayBuffer> | null = null;

  private listening = false;
  private errorMessage: string | null = null;

  /**
   * Called whenever the AudioWorklet produces
   * a new PCM 16-bit audio chunk.
   */
  onPCMChunk?: (chunk: ArrayBuffer) => void;

  /**
   * Start microphone capture.
   */
  async start(): Promise<boolean> {
    this.errorMessage = null;

    try {
      // Prevent multiple microphone sessions.
      if (this.listening) {
        return true;
      }

      // Check browser microphone support.
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        throw new Error(
          'Microphone mediaDevices API not supported in this browser.'
        );
      }

      // Request microphone permission.
      this.mediaStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

      // Create AudioContext.
      const AudioCtx =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioCtx) {
        throw new Error(
          'Web Audio API is not supported in this browser.'
        );
      }

      this.audioContext = new AudioCtx();
      console.log(
        "AudioContext sample rate:",
        this.audioContext.sampleRate
      );

      // Resume AudioContext if the browser suspended it.
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // ---------------------------------------------------------
      // Audio analyser
      // ---------------------------------------------------------

      this.analyser =
        this.audioContext.createAnalyser();

      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      // Create microphone source.
      this.source =
        this.audioContext.createMediaStreamSource(
          this.mediaStream
        );

      // Connect microphone to analyser.
      this.source.connect(this.analyser);

      // Create buffer for audio level calculation.
      this.dataArray = new Uint8Array(
        new ArrayBuffer(
          this.analyser.frequencyBinCount
        )
      );

      // ---------------------------------------------------------
      // AudioWorklet
      // ---------------------------------------------------------

      /**
       * Load the PCM processor.
       *
       * The processor converts Float32 microphone samples
       * into signed 16-bit PCM audio.
       */
      await this.audioContext.audioWorklet.addModule(
        new URL('./pcm-processor.ts', import.meta.url)
      );

      // Create AudioWorklet node.
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'pcm-processor'
      );

      // Receive PCM chunks from the AudioWorklet.
      this.workletNode.port.onmessage = (
        event: MessageEvent
      ) => {
        const pcmChunk = event.data;

        if (pcmChunk instanceof ArrayBuffer) {
          this.onPCMChunk?.(pcmChunk);
        }
      };

      // Microphone → AudioWorklet
      this.source.connect(this.workletNode);

      /**
       * Connect the worklet to the destination so that
       * the AudioWorklet continues processing.
       *
       * The PCM processor itself does not generate output
       * audio, so this does not play the microphone back.
       */
      this.workletNode.connect(
        this.audioContext.destination
      );

      this.listening = true;

      return true;
    } catch (err: unknown) {
      this.listening = false;

      const message =
        err instanceof Error
          ? err.message
          : 'Permission denied or microphone unavailable';

      this.errorMessage = message;

      console.warn(
        'Microphone start error:',
        message
      );

      // Clean up partially initialized resources.
      this.stop();

      this.errorMessage = message;

      return false;
    }
  }

  /**
   * Stop microphone capture and clean up
   * all Web Audio resources.
   */
  stop(): void {
    // Stop microphone tracks.
    if (this.mediaStream) {
      this.mediaStream
        .getTracks()
        .forEach((track) => track.stop());

      this.mediaStream = null;
    }

    // Disconnect microphone source.
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    // Disconnect AudioWorklet.
    if (this.workletNode) {
      this.workletNode.disconnect();

      this.workletNode.port.onmessage = null;

      this.workletNode = null;
    }

    // Close AudioContext.
    if (
      this.audioContext &&
      this.audioContext.state !== 'closed'
    ) {
      void this.audioContext.close();
    }

    this.audioContext = null;

    // Clear analyser resources.
    this.analyser = null;
    this.dataArray = null;

    this.listening = false;
  }

  /**
   * Get current microphone audio level.
   *
   * Returns a value from 0 to 100.
   */
  getAudioLevel(): number {
    if (
      !this.listening ||
      !this.analyser ||
      !this.dataArray
    ) {
      return 0;
    }

    this.analyser.getByteFrequencyData(
      this.dataArray
    );

    let sum = 0;

    for (
      let i = 0;
      i < this.dataArray.length;
      i++
    ) {
      sum += this.dataArray[i];
    }

    const average =
      sum / this.dataArray.length;

    // Map approximately 0–64 to 0–100%.
    return Math.min(
      100,
      Math.round((average / 64) * 100)
    );
  }

  /**
   * Check whether microphone capture is active.
   */
  isListening(): boolean {
    return this.listening;
  }

  /**
   * Get the most recent microphone error.
   */
  getError(): string | null {
    return this.errorMessage;
  }
}
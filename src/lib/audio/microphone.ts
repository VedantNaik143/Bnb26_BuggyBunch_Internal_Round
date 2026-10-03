/**
 * Web Audio API helper for microphone capture, audio level analysis, and PCM preparation.
 */

export interface MicController {
  start: () => Promise<boolean>;
  stop: () => void;
  getAudioLevel: () => number; // 0 to 100
  isListening: () => boolean;
  getError: () => string | null;
}

export class BrowserMicrophone implements MicController {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private listening: boolean = false;
  private errorMessage: string | null = null;

  async start(): Promise<boolean> {
    this.errorMessage = null;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone mediaDevices API not supported in this browser.');
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.source.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.listening = true;
      return true;
    } catch (err: unknown) {
      this.listening = false;
      const message = err instanceof Error ? err.message : 'Permission denied or microphone unavailable';
      this.errorMessage = message;
      console.warn('Microphone start error:', message);
      return false;
    }
  }

  stop(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.listening = false;
  }

  getAudioLevel(): number {
    if (!this.listening || !this.analyser || !this.dataArray) {
      return 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.analyser as any).getByteFrequencyData(this.dataArray);

    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const avg = sum / this.dataArray.length;
    // Map 0-128 to 0-100%
    return Math.min(100, Math.round((avg / 64) * 100));
  }

  isListening(): boolean {
    return this.listening;
  }

  getError(): string | null {
    return this.errorMessage;
  }
}

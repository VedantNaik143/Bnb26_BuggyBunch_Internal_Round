/**
 * Real Web Audio API microphone capture, 16 kHz mono PCM16 resampling,
 * genuine time-domain RMS calculation, client speech recognition, and live audio level tracking.
 */

export interface MicController {
  start: (
    onAudioChunk?: (chunk: ArrayBuffer, sequence: number, timestampMs: number) => void,
    onSpeechText?: (text: string, isFinal: boolean) => void
  ) => Promise<boolean>;
  stop: () => void;
  mute: () => void;
  unmute: () => void;
  isMuted: () => boolean;
  getAudioLevel: () => number; // 0 to 100
  getTrueRms: () => number;    // Genuine time-domain RMS
  isListening: () => boolean;
  getError: () => string | null;
}

export class BrowserMicrophone implements MicController {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private timeDomainBuffer: Float32Array | null = null;
  private listening: boolean = false;
  private muted: boolean = false;
  private errorMessage: string | null = null;
  private sequenceNumber: number = 0;
  private onChunkCallback?: (chunk: ArrayBuffer, sequence: number, timestampMs: number) => void;
  private onSpeechCallback?: (text: string, isFinal: boolean) => void;
  private currentRms: number = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;

  async start(
    onAudioChunk?: (chunk: ArrayBuffer, sequence: number, timestampMs: number) => void,
    onSpeechText?: (text: string, isFinal: boolean) => void
  ): Promise<boolean> {
    this.errorMessage = null;
    this.onChunkCallback = onAudioChunk;
    this.onSpeechCallback = onSpeechText;
    this.sequenceNumber = 0;

    try {
      let stream: MediaStream | null = null;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } else {
        // Fallback for older browsers or legacy WebKit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const legacyNav = navigator as any;
        const getUserMedia =
          legacyNav.getUserMedia ||
          legacyNav.webkitGetUserMedia ||
          legacyNav.mozGetUserMedia ||
          legacyNav.msGetUserMedia;
        if (getUserMedia) {
          stream = await new Promise<MediaStream>((resolve, reject) => {
            getUserMedia.call(
              navigator,
              { audio: true, video: false },
              resolve,
              reject
            );
          });
        } else {
          const isLocal =
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
          if (!isLocal && !window.isSecureContext) {
            throw new Error(
              'Microphone access on mobile / LAN devices requires a secure context (HTTPS or localhost). Please open over HTTPS or enable "Insecure origins treated as secure" in chrome://flags.'
            );
          }
          throw new Error('Microphone audio capture is not supported in this browser.');
        }
      }

      this.mediaStream = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API (AudioContext) is not supported in this browser.');
      }
      this.audioContext = new AudioCtx();

      // Ensure AudioContext is unlocked without blocking on autoplay restrictions
      const tryResume = () => {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }
      };
      if (this.audioContext.state === 'suspended') {
        window.addEventListener('click', tryResume, { passive: true });
        window.addEventListener('pointerdown', tryResume, { passive: true });
        window.addEventListener('touchstart', tryResume, { passive: true });
        window.addEventListener('keydown', tryResume, { passive: true });
        tryResume();
      }

      const inputSampleRate = this.audioContext.sampleRate;
      const targetSampleRate = 16000;

      // Analyser for honest time-domain RMS
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      this.timeDomainBuffer = new Float32Array(this.analyser.fftSize);

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.source.connect(this.analyser);

      // Buffer size 4096 gives ~85ms at 48kHz or ~92ms at 44.1kHz
      const bufferSize = 4096;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
        // Mute speaker output buffer so audio is never routed to local speakers (prevents echo/feedback)
        const outputChannelData = e.outputBuffer.getChannelData(0);
        outputChannelData.fill(0);

        if (!this.listening || this.muted) {
          this.currentRms = 0;
          return;
        }

        const inputChannelData = e.inputBuffer.getChannelData(0);

        // 1. Calculate genuine time-domain RMS
        let sumSquares = 0;
        for (let i = 0; i < inputChannelData.length; i++) {
          const sample = inputChannelData[i];
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / inputChannelData.length);
        this.currentRms = rms;

        // 2. Resample to 16,000 Hz Mono PCM16
        const pcm16 = this.downsampleTo16kPCM(inputChannelData, inputSampleRate, targetSampleRate);

        if (this.onChunkCallback && pcm16.byteLength > 0) {
          this.sequenceNumber += 1;
          this.onChunkCallback(pcm16.buffer as ArrayBuffer, this.sequenceNumber, Date.now());
        }
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // 3. Initialize Browser Speech Recognition (Web Speech API) for real-time transcription
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec && onSpeechText) {
        try {
          const rec = new SpeechRec();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rec.onresult = (event: any) => {
            if (this.muted || !this.listening) return;
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              if (res && res[0]) {
                const text = res[0].transcript.trim();
                const isFinal = Boolean(res.isFinal);
                if (text) {
                  onSpeechText(text, isFinal);
                }
              }
            }
          };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rec.onerror = (e: any) => {
            console.debug('Browser speech recognition notice:', e.error);
            if (e.error === 'no-speech' && this.listening && !this.muted) {
              try {
                rec.start();
              } catch {}
            }
          };

          rec.onend = () => {
            if (this.listening && !this.muted) {
              try {
                rec.start();
              } catch {
                // ignore
              }
            }
          };

          // Short delay to let media stream audio tracks settle before starting browser recognizer
          setTimeout(() => {
            if (this.listening && !this.muted) {
              try {
                rec.start();
              } catch (e) {
                console.debug('Speech recognition start notice:', e);
              }
            }
          }, 100);
          this.recognition = rec;
        } catch (e) {
          console.debug('Browser speech recognition initialization notice:', e);
        }
      }

      this.listening = true;
      this.muted = false;
      return true;
    } catch (err: unknown) {
      this.listening = false;
      const message =
        err instanceof Error ? err.message : 'Permission denied or microphone unavailable';
      this.errorMessage = message;
      console.warn('Microphone initialization error:', message);
      return false;
    }
  }

  private downsampleTo16kPCM(
    buffer: Float32Array,
    inputRate: number,
    targetRate: number
  ): Int16Array {
    if (targetRate === inputRate) {
      const pcm16 = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm16;
    }

    const ratio = inputRate / targetRate;
    const newLength = Math.round(buffer.length / ratio);
    const pcm16 = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalIndex = Math.floor(i * ratio);
      const s = Math.max(-1, Math.min(1, buffer[originalIndex] || 0));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return pcm16;
  }

  stop(): void {
    this.listening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.currentRms = 0;
  }

  mute(): void {
    this.muted = true;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    this.currentRms = 0;
  }

  unmute(): void {
    this.muted = false;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
    if (this.recognition) {
      try {
        this.recognition.start();
      } catch {
        // ignore
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  getAudioLevel(): number {
    if (!this.listening || this.muted) {
      return 0;
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    if (this.analyser && this.timeDomainBuffer) {
      // True time-domain RMS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.analyser.getFloatTimeDomainData(this.timeDomainBuffer as any);
      let sum = 0;
      for (let i = 0; i < this.timeDomainBuffer.length; i++) {
        const val = this.timeDomainBuffer[i];
        sum += val * val;
      }
      const rms = Math.sqrt(sum / this.timeDomainBuffer.length);
      this.currentRms = rms;
      // Normal speech RMS ranges ~0.02 - 0.25; map to 0 - 100
      return Math.min(100, Math.round(rms * 320));
    }

    return Math.min(100, Math.round(this.currentRms * 320));
  }

  getTrueRms(): number {
    return this.muted ? 0 : this.currentRms;
  }

  isListening(): boolean {
    return this.listening;
  }

  getError(): string | null {
    return this.errorMessage;
  }
}

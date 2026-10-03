
class PCMProcessor extends AudioWorkletProcessor {
    private readonly filterSize = 31;
    private readonly history = new Float32Array(31);
    private readonly coefficients: Float32Array;

    private historyIndex = 0;
    private inputCount = 0;

    private outputBuffer = new Int16Array(160);
    private outputIndex = 0;

    constructor() {
        super();

        // Low-pass filter before reducing 48 kHz to 16 kHz.
        const cutoff = 7000 / sampleRate;
        const middle = (this.filterSize - 1) / 2;
        const coefficients = new Float32Array(this.filterSize);

        let sum = 0;

        for (let i = 0; i < this.filterSize; i++) {
            const offset = i - middle;

            const sinc =
                offset === 0
                    ? 2 * cutoff
                    : Math.sin(2 * Math.PI * cutoff * offset) /
                    (Math.PI * offset);

            // Blackman window reduces filter sidelobes.
            const window =
                0.42 -
                0.5 * Math.cos(
                    (2 * Math.PI * i) / (this.filterSize - 1)
                ) +
                0.08 * Math.cos(
                    (4 * Math.PI * i) / (this.filterSize - 1)
                );

            coefficients[i] = sinc * window;
            sum += coefficients[i];
        }

        // Normalize filter gain.
        for (let i = 0; i < this.filterSize; i++) {
            coefficients[i] /= sum;
        }

        this.coefficients = coefficients;
    }

    process(
        inputs: Float32Array[][],
        _outputs: Float32Array[][],
        _parameters: Record<string, Float32Array>
    ): boolean {
        const channel = inputs[0]?.[0];

        if (!channel) {
            return true;
        }

        // This processor currently supports 48 kHz input only.
        if (sampleRate !== 48000) {
            return true;
        }

        for (let i = 0; i < channel.length; i++) {
            // Store the newest input sample in a circular buffer.
            this.history[this.historyIndex] = channel[i];

            this.historyIndex =
                (this.historyIndex + 1) % this.filterSize;

            this.inputCount++;

            // Decimate by 3 after low-pass filtering.
            if (this.inputCount % 3 !== 0) {
                continue;
            }

            let filtered = 0;

            for (let j = 0; j < this.filterSize; j++) {
                const historyPosition =
                    (
                        this.historyIndex - 1 - j + this.filterSize
                    ) % this.filterSize;

                filtered +=
                    this.history[historyPosition] *
                    this.coefficients[j];
            }

            const sample = Math.max(
                -1,
                Math.min(1, filtered)
            );

            this.outputBuffer[this.outputIndex++] =
                sample < 0
                    ? Math.round(sample * 32768)
                    : Math.round(sample * 32767);

            // Send one 10 ms chunk: 160 samples = 320 bytes.
            if (this.outputIndex === this.outputBuffer.length) {
                const chunk = this.outputBuffer;

                // Temporary diagnostic for testing.
                console.log(
                    "PCM output:",
                    chunk.length,
                    "samples,",
                    chunk.byteLength,
                    "bytes, input rate:",
                    sampleRate
                );

                this.port.postMessage(
                    chunk.buffer,
                    [chunk.buffer]
                );

                this.outputBuffer = new Int16Array(160);
                this.outputIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor("pcm-processor", PCMProcessor);

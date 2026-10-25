// AudioWorklet: float32 mono frames -> Int16 PCM chunks (~100 ms) posted to the main thread.
class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = [];
    this.n = 0;
    this.target = Math.round(sampleRate * 0.1);
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch = input[0];
    const out = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.buf.push(out);
    this.n += out.length;
    if (this.n >= this.target) {
      const merged = new Int16Array(this.n);
      let o = 0;
      for (const b of this.buf) { merged.set(b, o); o += b.length; }
      this.port.postMessage(merged.buffer, [merged.buffer]);
      this.buf = [];
      this.n = 0;
    }
    return true;
  }
}
registerProcessor('pcm-worklet', PCMWorklet);

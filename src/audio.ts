// Procedural sound with the Web Audio API. No audio files.

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private rotorOsc: OscillatorNode[] = [];
  private rotorGain!: GainNode;
  private rotorFilter!: BiquadFilterNode;
  private washGain!: GainNode;
  private windGain!: GainNode;
  private sprayGain!: GainNode;
  private fireGain!: GainNode;
  muted = false;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // Two seconds of white noise, reused everywhere.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Rotor: detuned saws beat against each other like four props.
    this.rotorGain = ctx.createGain();
    this.rotorGain.gain.value = 0;
    this.rotorFilter = ctx.createBiquadFilter();
    this.rotorFilter.type = 'lowpass';
    this.rotorFilter.frequency.value = 700;
    this.rotorFilter.Q.value = 1.2;
    this.rotorFilter.connect(this.rotorGain).connect(this.master);
    for (const type of ['sawtooth', 'sawtooth', 'square', 'sawtooth'] as OscillatorType[]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 60;
      const g = ctx.createGain();
      g.gain.value = type === 'square' ? 0.12 : 0.22;
      o.connect(g).connect(this.rotorFilter);
      o.start();
      this.rotorOsc.push(o);
    }
    // Prop wash: hissy band of noise that rises with thrust.
    this.washGain = this.loop(1800, 0.8, 'bandpass');
    this.windGain = this.loop(500, 0.5, 'lowpass');
    this.sprayGain = this.loop(3200, 0.7, 'highpass');
    this.fireGain = this.loop(260, 0.9, 'bandpass');
  }

  private loop(freq: number, q: number, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start(0, Math.random());
    return g;
  }

  private set(p: AudioParam, v: number, t = 0.08) {
    if (this.ctx) p.setTargetAtTime(v, this.ctx.currentTime, t);
  }

  /** spool 0..1 motor speed, load -1..1 thrust demand, speed in m/s. */
  rotor(spool: number, load: number, speed: number, bulk: number) {
    if (!this.ctx) return;
    const base = (118 - bulk * 30) * (0.35 + spool * 0.65) * (1 + load * 0.22);
    const det = [1, 1.012, 0.5, 1.498];
    this.rotorOsc.forEach((o, i) => this.set(o.frequency, base * det[i], 0.06));
    this.set(this.rotorFilter.frequency, 380 + spool * 700 + Math.max(0, load) * 500);
    this.set(this.rotorGain.gain, spool * 0.2);
    this.set(this.washGain.gain, spool * (0.05 + Math.abs(load) * 0.05));
    this.set(this.windGain.gain, Math.min(0.3, speed * 0.011));
  }

  spray(on: boolean) {
    if (this.ctx) this.set(this.sprayGain.gain, on ? 0.16 : 0, 0.05);
  }

  /** 0..1 loudness of nearby flames. */
  fire(level: number) {
    if (this.ctx) this.set(this.fireGain.gain, level * 0.35, 0.3);
  }

  silence() {
    if (!this.ctx) return;
    for (const g of [this.rotorGain, this.washGain, this.windGain, this.sprayGain, this.fireGain]) this.set(g.gain, 0, 0.2);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.set(this.master.gain, this.muted ? 0 : 0.7, 0.02);
    return this.muted;
  }

  private burst(dur: number, freq: number, vol: number, type: BiquadFilterType = 'lowpass', sweepTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot() {
    this.burst(0.09, 2400, 0.3, 'lowpass', 300);
    this.tone(170, 0.07, 0.2, 'square', 60);
  }
  enemyShot(near: number) {
    this.burst(0.14, 900, 0.1 + near * 0.18, 'lowpass', 150);
  }
  rocket() {
    this.burst(0.7, 500, 0.35, 'bandpass', 2600);
  }
  explosion(size = 1) {
    this.burst(0.9 + size * 0.6, 900, Math.min(0.9, 0.45 * size), 'lowpass', 40);
    this.tone(70, 0.5 + size * 0.3, 0.5, 'sine', 28);
  }
  hit() {
    this.burst(0.12, 3000, 0.4, 'bandpass', 600);
    this.tone(320, 0.12, 0.25, 'square', 90);
  }
  crash() {
    this.burst(0.5, 1400, 0.6, 'lowpass', 80);
  }
  splash() {
    this.burst(0.5, 1500, 0.3, 'bandpass', 400);
  }
  steam() {
    this.burst(0.35, 5000, 0.07, 'highpass');
  }
  beep(freq = 880, vol = 0.12) {
    this.tone(freq, 0.12, vol, 'square');
  }
  click() {
    this.tone(660, 0.05, 0.1, 'triangle', 990);
  }
  pickup() {
    this.tone(520, 0.1, 0.15, 'triangle');
    this.tone(780, 0.14, 0.15, 'triangle', undefined, 0.09);
  }
  release() {
    this.tone(300, 0.15, 0.18, 'triangle', 140);
  }
  good() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 0.16, 'triangle', undefined, i * 0.1));
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 0.18, 'triangle', undefined, i * 0.13));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 0.18, 'sawtooth', undefined, i * 0.18));
  }
}

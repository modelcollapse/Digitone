const LOOKAHEAD = 0.06;
const TICK_INTERVAL = 25;

export class Engine {
  constructor(midi) {
    this.midi = midi;
    this.bpm = 120;
    this.patternLength = 16;
    this.playing = false;

    this._audioCtx = null;
    this._schedulerTimer = null;
    this._nextStepTime = 0;
    this._currentStep = -1;
    this._startTime = 0;

    this.tracks = [];
    this.softLfos = [];

    this.onStepChange = null;
    this._rafId = null;
  }

  get stepDuration() { return 60 / this.bpm / 4; }

  get audioCtx() {
    if (!this._audioCtx) this._audioCtx = new AudioContext();
    return this._audioCtx;
  }

  start() {
    if (this.playing) return;
    const ctx = this.audioCtx;
    if (ctx.state === 'suspended') ctx.resume();

    this.playing = true;
    this._currentStep = this.patternLength - 1;
    this._nextStepTime = ctx.currentTime + 0.05;
    this._startTime = this._nextStepTime;

    // Reset LFO state
    this.softLfos.forEach(l => {
      l._slewedVal = null;
      l._shotDone = false;
    });

    this._schedulerTimer = setInterval(() => this._scheduleSteps(), TICK_INTERVAL);
    this._lfoFrame();
  }

  stop() {
    this.playing = false;
    clearInterval(this._schedulerTimer);
    this._schedulerTimer = null;
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    for (let i = 1; i <= 4; i++) this.midi.allNotesOff(i);
    this._currentStep = -1;
    if (this.onStepChange) this.onStepChange(-1);
  }

  _scheduleSteps() {
    const now = this.audioCtx.currentTime;
    while (this._nextStepTime < now + LOOKAHEAD) {
      const step = (this._currentStep + 1) % this.patternLength;
      this._currentStep = step;
      this._triggerStep(step, this._nextStepTime);
      this._nextStepTime += this.stepDuration;
    }
  }

  _triggerStep(step, time) {
    const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
    setTimeout(() => { if (this.onStepChange) this.onStepChange(step); }, delay);

    this.tracks.forEach(track => {
      const s = track.steps[step];
      if (!s?.active) return;
      const note = s.note ?? 60;
      const vel  = s.velocity ?? 100;
      const len  = (s.length ?? 1) * this.stepDuration * 0.95;
      this.midi.noteOn(track.channel, note, vel, time);
      this.midi.noteOff(track.channel, note, time + len);
      if (s.plocks) {
        for (const [cc, val] of Object.entries(s.plocks))
          this.midi.cc(track.channel, +cc, val, time);
      }
    });
  }

  _lfoFrame() {
    if (!this.playing) return;
    const now = this.audioCtx.currentTime;
    const elapsed = now - this._startTime;
    const beatsElapsed = elapsed * this.bpm / 60;

    this.softLfos.forEach(lfo => {
      if (!lfo.active || !lfo.dest?.cc) return;
      if (lfo.oneShot && lfo._shotDone) return;

      let phase;
      if (lfo.freeHz > 0) {
        phase = (elapsed * lfo.freeHz + (lfo.phaseOffset ?? 0)) % 1;
      } else {
        const beatsPerCycle = lfo.rateBeats ?? 4;
        phase = (beatsElapsed / beatsPerCycle + (lfo.phaseOffset ?? 0)) % 1;
      }

      if (lfo.oneShot) {
        const rawPhase = lfo.freeHz > 0
          ? elapsed * lfo.freeHz
          : beatsElapsed / (lfo.rateBeats ?? 4);
        if (rawPhase >= 1) { lfo._shotDone = true; return; }
        phase = rawPhase;
      }

      let val = computeLfoValue(lfo, phase);

      // Slew / lag processor
      if ((lfo.slew ?? 0) > 0) {
        const coeff = 1 - (lfo.slew / 127) * 0.98;
        const prev = lfo._slewedVal ?? val;
        lfo._slewedVal = prev + (val - prev) * coeff;
        val = Math.round(lfo._slewedVal);
      } else {
        lfo._slewedVal = val;
      }

      this.midi.cc(lfo.dest.channel, lfo.dest.cc, val);
    });

    this._rafId = requestAnimationFrame(() => this._lfoFrame());
  }
}

export function computeLfoValue(lfo, phase) {
  const waveform = lfo.waveform ?? 'sine';
  const depth  = lfo.depth  ?? 64;
  const offset = lfo.offset ?? 64;
  let raw = 0; // -1 .. 1

  switch (waveform) {
    case 'sine':
      raw = Math.sin(phase * Math.PI * 2);
      break;

    case 'triangle':
      raw = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
      break;

    case 'sawtooth':
      raw = phase * 2 - 1;
      break;

    case 'rev-saw':
      raw = 1 - phase * 2;
      break;

    case 'square':
      raw = phase < 0.5 ? 1 : -1;
      break;

    case 'pulse-25':
      raw = phase < 0.25 ? 1 : -1;
      break;

    case 'pulse-75':
      raw = phase < 0.75 ? 1 : -1;
      break;

    case 'exp-rise':
      raw = (Math.exp(phase * 3) - 1) / (Math.exp(3) - 1) * 2 - 1;
      break;

    case 'exp-fall':
      raw = (Math.exp((1 - phase) * 3) - 1) / (Math.exp(3) - 1) * 2 - 1;
      break;

    case 'random': {
      const slot = Math.floor(phase * 16);
      if (lfo._shSlot !== slot) { lfo._shSlot = slot; lfo._shVal = Math.random() * 2 - 1; }
      raw = lfo._shVal ?? 0;
      break;
    }

    case 'smooth-random': {
      const n = 8;
      const slot = Math.floor(phase * n);
      const t = (phase * n) % 1;
      if (lfo._srSlot !== slot) {
        lfo._srSlot = slot;
        lfo._srPrev = lfo._srNext ?? 0;
        lfo._srNext = Math.random() * 2 - 1;
      }
      const tc = t * t * (3 - 2 * t); // smoothstep
      raw = (lfo._srPrev ?? 0) + ((lfo._srNext ?? 0) - (lfo._srPrev ?? 0)) * tc;
      break;
    }

    case 'drunk': {
      const slot = Math.floor(phase * 12);
      if (lfo._drunkSlot !== slot) {
        lfo._drunkSlot = slot;
        const step = (Math.random() - 0.5) * (lfo.drunkStep ?? 0.4);
        lfo._drunkVal = Math.max(-1, Math.min(1, (lfo._drunkVal ?? 0) + step));
      }
      raw = lfo._drunkVal ?? 0;
      break;
    }

    case 'stutter': {
      const n = lfo.stutterDivs ?? 16;
      const slot = Math.floor(phase * n);
      if (lfo._stutterSlot !== slot) {
        lfo._stutterSlot = slot;
        lfo._stutterVal = Math.random() > (lfo.stutterDensity ?? 0.5) ? 1 : -1;
      }
      raw = lfo._stutterVal ?? 1;
      break;
    }

    case 'steps': {
      const vals = lfo.stepValues ?? [64, 64, 64, 64, 64, 64, 64, 64];
      const n = vals.length;
      const idx = Math.floor(phase * n) % n;
      raw = (vals[idx] / 127) * 2 - 1;
      break;
    }

    case 'breakpoint': {
      const pts = lfo.breakpoints ?? [{ t: 0, v: 0.5 }, { t: 1, v: 0.5 }];
      let v01 = pts[pts.length - 1].v;
      for (let i = 0; i < pts.length - 1; i++) {
        if (phase >= pts[i].t && phase <= pts[i + 1].t) {
          const seg = pts[i + 1].t - pts[i].t;
          const t = seg > 0 ? (phase - pts[i].t) / seg : 0;
          const tc = lfo.bpSmooth ? t * t * (3 - 2 * t) : t;
          v01 = pts[i].v + (pts[i + 1].v - pts[i].v) * tc;
          break;
        }
      }
      raw = v01 * 2 - 1;
      break;
    }
  }

  const d = depth / 127;
  return Math.max(0, Math.min(127, Math.round(offset + raw * d * 63.5)));
}

export function lfoWaveformPoints(waveform, w, h, steps = 240) {
  // For display preview only — no LFO state
  const fakeLfo = { waveform, depth: 127, offset: 63, breakpoints: [{ t:0, v:0 }, { t:0.3, v:1 }, { t:0.7, v:0.2 }, { t:1, v:0.8 }], stepValues: [80,20,110,40,100,10,90,60], bpSmooth: true };
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const phase = i / steps;
    const val = computeLfoValue(fakeLfo, phase); // 0-127
    pts.push([i / steps * w, (1 - val / 127) * h]);
  }
  return pts;
}

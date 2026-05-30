const LOOKAHEAD = 0.06;      // seconds to schedule ahead
const TICK_INTERVAL = 25;    // ms between scheduler ticks

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

    this.tracks = [];     // set by app
    this.softLfos = [];   // set by app
    this._lfoPhases = [];

    this.onStepChange = null; // (stepIdx) => void — called on UI thread
    this._rafId = null;
  }

  get stepDuration() {
    return 60 / this.bpm / 4; // 16th note
  }

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
    this._lfoPhases = this.softLfos.map(l => l.phaseOffset ?? 0);

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
    // schedule UI highlight
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
        for (const [cc, val] of Object.entries(s.plocks)) {
          this.midi.cc(track.channel, +cc, val, time);
        }
      }
    });
  }

  // LFO loop: runs at ~60fps via requestAnimationFrame
  _lfoFrame() {
    if (!this.playing) return;
    const now = this.audioCtx.currentTime;
    const elapsed = now - this._startTime; // seconds since pattern start
    const beatsElapsed = elapsed * this.bpm / 60;

    this.softLfos.forEach((lfo, i) => {
      if (!lfo.active || !lfo.dest?.cc) return;

      let phase;
      if (lfo.freeHz > 0) {
        phase = (elapsed * lfo.freeHz + (lfo.phaseOffset ?? 0)) % 1;
      } else {
        const beatsPerCycle = lfo.rateBeats ?? 4;
        phase = (beatsElapsed / beatsPerCycle + (lfo.phaseOffset ?? 0)) % 1;
      }

      const val = computeLfoValue(lfo, phase);
      this.midi.cc(lfo.dest.channel, lfo.dest.cc, val);
    });

    this._rafId = requestAnimationFrame(() => this._lfoFrame());
  }
}

export function computeLfoValue(lfo, phase) {
  const { waveform, depth, offset } = lfo;
  let raw = 0;
  switch (waveform) {
    case 'sine':     raw = Math.sin(phase * Math.PI * 2); break;
    case 'triangle': raw = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4; break;
    case 'sawtooth': raw = phase * 2 - 1; break;
    case 'rev-saw':  raw = 1 - phase * 2; break;
    case 'square':   raw = phase < 0.5 ? 1 : -1; break;
    case 'random': {
      // S&H: randomize each cycle
      const slot = Math.floor(phase * 16);
      if (lfo._shSlot !== slot) {
        lfo._shSlot = slot;
        lfo._shVal = Math.random() * 2 - 1;
      }
      raw = lfo._shVal ?? 0;
      break;
    }
    case 'smooth-random': {
      // Perlin-ish: interpolate between random targets
      const slot = Math.floor(phase * 8);
      const t = (phase * 8) % 1;
      if (lfo._srSlot !== slot) {
        lfo._srSlot = slot;
        lfo._srPrev = lfo._srNext ?? 0;
        lfo._srNext = Math.random() * 2 - 1;
      }
      raw = (lfo._srPrev ?? 0) + ((lfo._srNext ?? 0) - (lfo._srPrev ?? 0)) * t;
      break;
    }
  }
  const d = (depth ?? 64) / 127;
  const o = offset ?? 64;
  return Math.max(0, Math.min(127, Math.round(o + raw * d * 63.5)));
}

export function lfoWaveformPoints(waveform, w, h, steps = 200) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const phase = i / steps;
    let raw = 0;
    switch (waveform) {
      case 'sine':     raw = Math.sin(phase * Math.PI * 2); break;
      case 'triangle': raw = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4; break;
      case 'sawtooth': raw = phase * 2 - 1; break;
      case 'rev-saw':  raw = 1 - phase * 2; break;
      case 'square':   raw = phase < 0.5 ? 1 : -1; break;
      case 'random':   raw = Math.sin(phase * Math.PI * 8) > 0 ? 0.7 : -0.7; break;
      case 'smooth-random': raw = Math.sin(phase * Math.PI * 5) * 0.8; break;
    }
    pts.push([i / steps * w, (1 - (raw + 1) / 2) * h]);
  }
  return pts;
}

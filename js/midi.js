export class MidiOutput {
  constructor() {
    this.access = null;
    this.output = null;
    this.outputs = [];
    this.onStateChange = null;
  }

  async init() {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this._refresh();
      this.access.onstatechange = () => {
        this._refresh();
        if (this.onStateChange) this.onStateChange(this.getOutputNames());
      };
      return true;
    } catch (e) {
      console.warn('MIDI access denied:', e);
      return false;
    }
  }

  _refresh() {
    this.outputs = [...this.access.outputs.values()];
    // If previously selected output disappeared, clear it
    if (this.output && !this.outputs.includes(this.output)) this.output = null;
  }

  getOutputNames() {
    return this.outputs.map((o, i) => ({ i, name: o.name }));
  }

  selectOutput(i) {
    this.output = this.outputs[i] ?? null;
  }

  noteOn(ch, note, vel, audioTime) {
    this._send([0x90 | ((ch - 1) & 0xf), note & 0x7f, vel & 0x7f], audioTime);
  }

  noteOff(ch, note, audioTime) {
    this._send([0x80 | ((ch - 1) & 0xf), note & 0x7f, 0], audioTime);
  }

  cc(ch, ccNum, value, audioTime) {
    this._send([0xb0 | ((ch - 1) & 0xf), ccNum & 0x7f, Math.max(0, Math.min(127, Math.round(value))) & 0x7f], audioTime);
  }

  allNotesOff(ch) {
    this.cc(ch, 123, 0);
  }

  _send(data, audioTime) {
    if (!this.output) return;
    try {
      if (audioTime != null) {
        this.output.send(data, audioTime * 1000);
      } else {
        this.output.send(data);
      }
    } catch (e) {
      // ignore send errors (output disconnected etc.)
    }
  }
}

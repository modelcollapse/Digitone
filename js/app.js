import { TRACK_PARAMS, FX_PARAMS, TRACK_COLORS, getAllTrackParams, midiNoteToName, noteNameToMidi } from './params.js';
import { MidiOutput } from './midi.js';
import { Engine, computeLfoValue, lfoWaveformPoints } from './engine.js';

// ─── State ──────────────────────────────────────────────────────────────────

function makeStep() {
  return { active: false, note: 60, velocity: 100, length: 1, plocks: {} };
}

function makeTrack(idx) {
  return {
    name: `T${idx + 1}`,
    channel: idx + 1,
    color: TRACK_COLORS[idx],
    steps: Array.from({ length: 16 }, makeStep),
    paramValues: buildDefaultParams(),
  };
}

function buildDefaultParams() {
  const v = {};
  for (const group of Object.values(TRACK_PARAMS)) {
    for (const p of group.params) v[p.cc] = p.def;
  }
  return v;
}

function makeLfo(id) {
  return {
    id,
    active: true,
    waveform: 'sine',
    rateBeats: 4,
    freeHz: 0,
    depth: 64,
    offset: 64,
    phaseOffset: 0,
    dest: null, // { channel, cc, paramName }
  };
}

const state = {
  tracks: [0, 1, 2, 3].map(makeTrack),
  softLfos: [],
  lfoIdCounter: 0,
  selectedTrack: 0,
  selectedStep: null,
  bpm: 120,
  playing: false,
  currentStep: -1,
  bottomTab: 'params', // 'params' | 'plocks' | 'lfos' | 'fx'
  fxParamValues: buildFxDefaults(),
  fxChannel: 9,
  midiAvailable: false,
  midiOutputs: [],
  selectedMidiOut: -1,
  paramGroupTab: 'syn1',
  fxGroupTab: 'chorus',
};

function buildFxDefaults() {
  const v = {};
  for (const group of Object.values(FX_PARAMS)) {
    for (const p of group.params) v[`fx_${p.cc}`] = p.def;
  }
  return v;
}

// ─── MIDI + Engine ──────────────────────────────────────────────────────────

const midi = new MidiOutput();
const engine = new Engine(midi);
engine.tracks = state.tracks;
engine.softLfos = state.softLfos;

engine.onStepChange = (step) => {
  state.currentStep = step;
  renderStepHighlights();
};

midi.onStateChange = (outputs) => {
  state.midiOutputs = outputs;
  renderMidiSelect();
};

// ─── DOM helpers ────────────────────────────────────────────────────────────

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  return e;
}

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// ─── Knob component ─────────────────────────────────────────────────────────

function createKnob(param, getValue, onSet, label) {
  const wrap = el('div', 'knob-wrap');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('class', 'knob-svg');

  const R = 16, cx = 20, cy = 20;
  const startAngle = 225 * Math.PI / 180; // 7 o'clock
  const endAngle   = 315 * Math.PI / 180; // 5 o'clock (going clockwise = 270°)
  const totalArc   = (360 - 90) * Math.PI / 180; // 270°

  function arcPath(from, to) {
    const x1 = cx + R * Math.cos(from);
    const y1 = cy + R * Math.sin(from);
    const x2 = cx + R * Math.cos(to);
    const y2 = cy + R * Math.sin(to);
    const large = (to - from) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`;
  }

  // bg track
  const bgTrack = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  bgTrack.setAttribute('stroke', '#2a2a2a');
  bgTrack.setAttribute('stroke-width', '3');
  bgTrack.setAttribute('fill', 'none');
  bgTrack.setAttribute('stroke-linecap', 'round');

  // value arc
  const valArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  valArc.setAttribute('stroke-width', '3');
  valArc.setAttribute('fill', 'none');
  valArc.setAttribute('stroke-linecap', 'round');

  // indicator dot
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('r', '2.5');
  dot.setAttribute('fill', '#fff');

  svg.append(bgTrack, valArc, dot);
  wrap.appendChild(svg);

  const lbl = el('div', 'knob-label', { text: label ?? param.name });
  const val = el('div', 'knob-value');
  wrap.append(lbl, val);

  function update() {
    const v = getValue();
    const norm = (v - param.min) / (param.max - param.min);
    const angle = startAngle + norm * totalArc;

    bgTrack.setAttribute('d', arcPath(startAngle, startAngle + totalArc));
    valArc.setAttribute('d', arcPath(startAngle, startAngle + norm * totalArc));
    valArc.setAttribute('stroke', '#e07020');
    dot.setAttribute('cx', cx + (R - 1) * Math.cos(angle));
    dot.setAttribute('cy', cy + (R - 1) * Math.sin(angle));

    val.textContent = v;
    svg.title = `${param.name}: ${v}`;
  }

  update();

  // Drag to change
  let startY, startVal;
  svg.addEventListener('mousedown', e => {
    e.preventDefault();
    startY = e.clientY;
    startVal = getValue();
    svg.classList.add('dragging');

    const onMove = e => {
      const dy = startY - e.clientY;
      const range = param.max - param.min;
      const newVal = Math.max(param.min, Math.min(param.max,
        Math.round(startVal + dy * range / 100)));
      onSet(newVal);
      update();
    };
    const onUp = () => {
      svg.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Double-click to type value
  svg.addEventListener('dblclick', () => {
    const input = el('input', 'knob-input', {
      type: 'number', value: getValue(),
      min: param.min, max: param.max
    });
    wrap.replaceChild(input, svg);
    input.focus();
    input.select();
    const commit = () => {
      const v = Math.max(param.min, Math.min(param.max, parseInt(input.value) || 0));
      onSet(v);
      wrap.replaceChild(svg, input);
      update();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { wrap.replaceChild(svg, input); } });
  });

  wrap._update = update;
  return wrap;
}

// ─── LFO Visualizer ─────────────────────────────────────────────────────────

function drawLfo(canvas, waveform) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = '#e07020';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const pts = lfoWaveformPoints(waveform, w, h);
  pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  // Center line
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

// ─── Render helpers ─────────────────────────────────────────────────────────

function renderMidiSelect() {
  const sel = qs('#midi-select');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="-1">-- No Output --</option>' +
    state.midiOutputs.map(o => `<option value="${o.i}">${o.name}</option>`).join('');
  sel.value = cur;
}

function renderStepHighlights() {
  const cs = state.currentStep;
  qsa('.step-btn').forEach(btn => {
    btn.classList.toggle('playing', +btn.dataset.step === cs && cs !== -1);
  });
}

// ─── Build UI ───────────────────────────────────────────────────────────────

function buildTrackRow(trackIdx) {
  const track = state.tracks[trackIdx];
  const row = el('div', 'track-row');
  row.style.setProperty('--track-color', track.color);

  // Track header
  const header = el('div', 'track-header');
  const nameEl = el('span', 'track-name', { text: track.name });
  const chEl   = el('span', 'track-ch', { text: `CH ${track.channel}` });
  nameEl.contentEditable = true;
  nameEl.addEventListener('input', () => { track.name = nameEl.textContent.trim(); });
  const chInput = el('input', 'track-ch-input', { type: 'number', min: 1, max: 16, value: track.channel });
  chInput.addEventListener('change', () => {
    track.channel = Math.max(1, Math.min(16, +chInput.value));
  });
  header.append(nameEl, chInput);
  row.appendChild(header);

  // Steps
  const stepsEl = el('div', 'steps');
  for (let s = 0; s < 16; s++) {
    const step = track.steps[s];
    const btn = el('div', 'step-btn' + (step.active ? ' active' : ''));
    btn.dataset.track = trackIdx;
    btn.dataset.step = s;

    const noteLabel = el('span', 'step-note', { text: step.active ? midiNoteToName(step.note) : '' });
    btn.appendChild(noteLabel);

    btn.addEventListener('click', () => {
      step.active = !step.active;
      btn.classList.toggle('active', step.active);
      noteLabel.textContent = step.active ? midiNoteToName(step.note) : '';
      // Select this step & track
      state.selectedTrack = trackIdx;
      state.selectedStep = s;
      renderBottomPanel();
    });

    btn.addEventListener('contextmenu', e => {
      e.preventDefault();
      state.selectedTrack = trackIdx;
      state.selectedStep = s;
      openStepEditor(trackIdx, s, btn);
    });

    stepsEl.appendChild(btn);
  }

  // Quick volume knob
  const volParam = { name: 'Vol', cc: 7, min: 0, max: 127, def: 100 };
  const volKnob = createKnob(
    volParam,
    () => track.paramValues[7] ?? 100,
    v => {
      track.paramValues[7] = v;
      midi.cc(track.channel, 7, v);
    }
  );
  volKnob.classList.add('track-vol-knob');

  row.append(stepsEl, volKnob);

  // Click row header to select track
  header.addEventListener('click', () => {
    state.selectedTrack = trackIdx;
    state.selectedStep = null;
    renderBottomPanel();
    qsa('.track-row').forEach((r, i) => r.classList.toggle('selected', i === trackIdx));
  });

  return row;
}

function openStepEditor(trackIdx, stepIdx, anchor) {
  // Remove any existing popup
  qs('.step-popup')?.remove();

  const step = state.tracks[trackIdx].steps[stepIdx];
  const popup = el('div', 'step-popup');

  popup.innerHTML = `
    <div class="popup-title">Step ${stepIdx + 1}</div>
    <label>Note
      <input type="text" id="sp-note" value="${midiNoteToName(step.note)}" maxlength="4">
    </label>
    <label>Velocity
      <input type="range" id="sp-vel" min="1" max="127" value="${step.velocity}">
      <span id="sp-vel-val">${step.velocity}</span>
    </label>
    <label>Length (steps)
      <input type="range" id="sp-len" min="1" max="16" value="${step.length}">
      <span id="sp-len-val">${step.length}</span>
    </label>
    <div class="popup-actions">
      <button id="sp-ok">OK</button>
      <button id="sp-cancel">Cancel</button>
    </div>
  `;

  const velRange = qs('#sp-vel', popup);
  const velVal   = qs('#sp-vel-val', popup);
  velRange.addEventListener('input', () => velVal.textContent = velRange.value);

  const lenRange = qs('#sp-len', popup);
  const lenVal   = qs('#sp-len-val', popup);
  lenRange.addEventListener('input', () => lenVal.textContent = lenRange.value);

  qs('#sp-ok', popup).addEventListener('click', () => {
    const noteName = qs('#sp-note', popup).value.trim();
    const midiNote = noteNameToMidi(noteName);
    step.note = midiNote;
    step.velocity = +velRange.value;
    step.length = +lenRange.value;
    step.active = true;
    // Update the button
    const btn = qs(`.step-btn[data-track="${trackIdx}"][data-step="${stepIdx}"]`);
    if (btn) {
      btn.classList.add('active');
      const nl = qs('.step-note', btn);
      if (nl) nl.textContent = midiNoteToName(midiNote);
    }
    popup.remove();
    renderBottomPanel();
  });

  qs('#sp-cancel', popup).addEventListener('click', () => popup.remove());

  // Position near anchor
  const rect = anchor.getBoundingClientRect();
  popup.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  popup.style.left = (rect.left + window.scrollX) + 'px';
  document.body.appendChild(popup);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function outside(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', outside); }
    });
  }, 50);
}

// ─── Bottom panel ───────────────────────────────────────────────────────────

function renderBottomPanel() {
  const panel = qs('#bottom-panel');
  if (!panel) return;

  // Update tab active states
  qsa('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === state.bottomTab));

  const content = qs('#panel-content');
  content.innerHTML = '';

  switch (state.bottomTab) {
    case 'params':  renderParams(content); break;
    case 'plocks':  renderPlocks(content); break;
    case 'lfos':    renderLfos(content); break;
    case 'fx':      renderFx(content); break;
  }
}

function renderParams(container) {
  const track = state.tracks[state.selectedTrack];
  if (!track) return;

  // Group tabs
  const groupTabs = el('div', 'group-tabs');
  for (const [key, group] of Object.entries(TRACK_PARAMS)) {
    const btn = el('button', 'group-tab-btn' + (state.paramGroupTab === key ? ' active' : ''), { text: group.label });
    btn.addEventListener('click', () => {
      state.paramGroupTab = key;
      renderBottomPanel();
    });
    groupTabs.appendChild(btn);
  }
  container.appendChild(groupTabs);

  const group = TRACK_PARAMS[state.paramGroupTab];
  const knobRow = el('div', 'knob-row');
  for (const param of group.params) {
    const knob = createKnob(
      param,
      () => track.paramValues[param.cc] ?? param.def,
      v => {
        track.paramValues[param.cc] = v;
        midi.cc(track.channel, param.cc, v);
        if (param.lsb) midi.cc(track.channel, param.lsb, v); // send same for LSB (simplified)
      }
    );
    knobRow.appendChild(knob);
  }
  container.appendChild(knobRow);

  const hint = el('div', 'panel-hint', { text: `Track ${state.selectedTrack + 1} — CH ${track.channel}` });
  container.appendChild(hint);
}

function renderPlocks(container) {
  const { selectedTrack: ti, selectedStep: si } = state;
  if (si === null) {
    container.innerHTML = '<p class="panel-hint">Right-click a step to select it, then edit P-Locks here.</p>';
    return;
  }
  const track = state.tracks[ti];
  const step  = track.steps[si];

  const title = el('div', 'plocks-title', { text: `P-Locks — Track ${ti + 1} Step ${si + 1} (${midiNoteToName(step.note)})` });
  container.appendChild(title);

  const hint = el('p', 'panel-hint', { text: 'Set a value to override the track parameter for this step only. Leave blank to remove.' });
  container.appendChild(hint);

  const grid = el('div', 'plocks-grid');
  for (const group of Object.values(TRACK_PARAMS)) {
    for (const param of group.params) {
      const row = el('div', 'plock-row');
      const lbl = el('label', 'plock-label', { text: param.name });
      const inp = el('input', 'plock-input', {
        type: 'number', min: param.min, max: param.max,
        placeholder: `—  (${param.min}–${param.max})`,
      });
      if (step.plocks[param.cc] != null) inp.value = step.plocks[param.cc];
      inp.addEventListener('change', () => {
        const raw = inp.value.trim();
        if (raw === '') {
          delete step.plocks[param.cc];
        } else {
          step.plocks[param.cc] = Math.max(param.min, Math.min(param.max, +raw));
        }
      });
      const ccLbl = el('span', 'plock-cc', { text: `CC${param.cc}` });
      row.append(lbl, inp, ccLbl);
      grid.appendChild(row);
    }
  }
  container.appendChild(grid);
}

function renderLfos(container) {
  const toolbar = el('div', 'lfo-toolbar');
  const addBtn = el('button', 'btn-add-lfo', { text: '+ Add LFO' });
  addBtn.addEventListener('click', () => {
    if (state.softLfos.length >= 8) return;
    const lfo = makeLfo(++state.lfoIdCounter);
    state.softLfos.push(lfo);
    renderBottomPanel();
  });
  toolbar.appendChild(addBtn);
  container.appendChild(toolbar);

  if (state.softLfos.length === 0) {
    container.appendChild(el('p', 'panel-hint', { text: 'No software LFOs yet. Click "+ Add LFO" to create one. LFOs modulate any Digitone CC parameter in real-time during playback.' }));
    return;
  }

  const allParams = getAllTrackParams();

  state.softLfos.forEach((lfo, lfoIdx) => {
    const card = el('div', 'lfo-card' + (lfo.active ? '' : ' inactive'));

    // Header row
    const hdr = el('div', 'lfo-header');
    const nameEl = el('span', 'lfo-name', { text: `LFO ${lfoIdx + 1}` });

    const activeBtn = el('button', 'lfo-active-btn' + (lfo.active ? ' on' : ''), { text: lfo.active ? 'ON' : 'OFF' });
    activeBtn.addEventListener('click', () => {
      lfo.active = !lfo.active;
      activeBtn.textContent = lfo.active ? 'ON' : 'OFF';
      activeBtn.classList.toggle('on', lfo.active);
      card.classList.toggle('inactive', !lfo.active);
    });

    const delBtn = el('button', 'lfo-del-btn', { text: '✕' });
    delBtn.addEventListener('click', () => {
      state.softLfos.splice(lfoIdx, 1);
      renderBottomPanel();
    });

    hdr.append(nameEl, activeBtn, delBtn);
    card.appendChild(hdr);

    // Controls
    const ctrl = el('div', 'lfo-controls');

    // Waveform selector
    const wfWrap = el('div', 'lfo-row');
    const wfLabel = el('label', '', { text: 'Wave' });
    const wfSel = el('select', 'lfo-select');
    ['sine','triangle','sawtooth','rev-saw','square','random','smooth-random'].forEach(w => {
      const opt = el('option', '', { value: w, text: w });
      if (lfo.waveform === w) opt.selected = true;
      wfSel.appendChild(opt);
    });
    wfSel.addEventListener('change', () => {
      lfo.waveform = wfSel.value;
      drawLfo(canvas, lfo.waveform);
    });

    // Canvas preview
    const canvas = el('canvas', 'lfo-canvas', { width: 120, height: 40 });
    drawLfo(canvas, lfo.waveform);

    wfWrap.append(wfLabel, wfSel, canvas);
    ctrl.appendChild(wfWrap);

    // Rate
    const rateWrap = el('div', 'lfo-row');
    const rateLabel = el('label', '', { text: 'Rate' });
    const rateSel = el('select', 'lfo-select');
    const rateOptions = [
      { label: '1/16 bar', beats: 0.25 },
      { label: '1/8 bar',  beats: 0.5  },
      { label: '1/4 bar',  beats: 1    },
      { label: '1/2 bar',  beats: 2    },
      { label: '1 bar',    beats: 4    },
      { label: '2 bars',   beats: 8    },
      { label: '4 bars',   beats: 16   },
      { label: '8 bars',   beats: 32   },
    ];
    rateOptions.forEach(r => {
      const opt = el('option', '', { value: r.beats, text: r.label });
      if (lfo.rateBeats === r.beats) opt.selected = true;
      rateSel.appendChild(opt);
    });
    rateSel.addEventListener('change', () => { lfo.rateBeats = +rateSel.value; lfo.freeHz = 0; });

    const freeLabel = el('label', 'lfo-free-label', { text: 'Free Hz' });
    const freeInp = el('input', 'lfo-free-inp', { type: 'number', min: 0.01, max: 20, step: 0.01, placeholder: '0 = synced', value: lfo.freeHz || '' });
    freeInp.addEventListener('input', () => { lfo.freeHz = parseFloat(freeInp.value) || 0; });

    rateWrap.append(rateLabel, rateSel, freeLabel, freeInp);
    ctrl.appendChild(rateWrap);

    // Depth + Offset knobs
    const knobWrap = el('div', 'lfo-knob-row');
    const depthParam = { name: 'Depth', cc: -1, min: 0, max: 127, def: 64 };
    const offsetParam = { name: 'Offset', cc: -1, min: 0, max: 127, def: 64 };
    const phaseParam  = { name: 'Phase', cc: -1, min: 0, max: 100, def: 0 };

    const depthKnob = createKnob(depthParam, () => lfo.depth, v => { lfo.depth = v; });
    const offsetKnob = createKnob(offsetParam, () => lfo.offset, v => { lfo.offset = v; });
    const phaseKnob = createKnob(phaseParam, () => Math.round(lfo.phaseOffset * 100), v => { lfo.phaseOffset = v / 100; });
    knobWrap.append(depthKnob, offsetKnob, phaseKnob);
    ctrl.appendChild(knobWrap);

    // Destination
    const destWrap = el('div', 'lfo-row');
    const destLabel = el('label', '', { text: 'Destination' });

    const chSel = el('select', 'lfo-select');
    [1,2,3,4].forEach(ch => {
      const opt = el('option', '', { value: ch, text: `Track ${ch} (CH ${ch})` });
      if (lfo.dest?.channel === ch) opt.selected = true;
      chSel.appendChild(opt);
    });

    const paramSel = el('select', 'lfo-select lfo-param-sel');
    const noneOpt = el('option', '', { value: '', text: '-- select param --' });
    paramSel.appendChild(noneOpt);
    for (const [groupKey, group] of Object.entries(TRACK_PARAMS)) {
      const optGroup = el('optgroup', '', { label: group.label });
      group.params.forEach(p => {
        const opt = el('option', '', { value: p.cc, text: p.name });
        if (lfo.dest?.cc === p.cc && lfo.dest?.channel === +chSel.value) opt.selected = true;
        optGroup.appendChild(opt);
      });
      paramSel.appendChild(optGroup);
    }

    const updateDest = () => {
      const cc = +paramSel.value;
      if (!cc) { lfo.dest = null; return; }
      const ch = +chSel.value;
      const param = allParams.find(p => p.cc === cc);
      lfo.dest = { channel: ch, cc, paramName: param?.name ?? `CC${cc}` };
    };
    chSel.addEventListener('change', updateDest);
    paramSel.addEventListener('change', updateDest);

    destWrap.append(destLabel, chSel, paramSel);
    ctrl.appendChild(destWrap);

    card.appendChild(ctrl);
    container.appendChild(card);
  });
}

function renderFx(container) {
  const groupTabs = el('div', 'group-tabs');
  for (const [key, group] of Object.entries(FX_PARAMS)) {
    const btn = el('button', 'group-tab-btn' + (state.fxGroupTab === key ? ' active' : ''), { text: group.label });
    btn.addEventListener('click', () => {
      state.fxGroupTab = key;
      renderBottomPanel();
    });
    groupTabs.appendChild(btn);
  }
  container.appendChild(groupTabs);

  const group = FX_PARAMS[state.fxGroupTab];
  const knobRow = el('div', 'knob-row');
  for (const param of group.params) {
    const stateKey = `fx_${param.cc}`;
    const knob = createKnob(
      param,
      () => state.fxParamValues[stateKey] ?? param.def,
      v => {
        state.fxParamValues[stateKey] = v;
        midi.cc(state.fxChannel, param.cc, v);
      }
    );
    knobRow.appendChild(knob);
  }
  container.appendChild(knobRow);

  const hint = el('div', 'panel-hint', { text: `FX — CH ${state.fxChannel}` });
  container.appendChild(hint);
}

// ─── Main init ──────────────────────────────────────────────────────────────

async function init() {
  // Build tracks
  const tracksEl = qs('#tracks');
  state.tracks.forEach((_, i) => tracksEl.appendChild(buildTrackRow(i)));

  // Select first track
  qsa('.track-row')[0]?.classList.add('selected');

  // BPM
  const bpmInput = qs('#bpm');
  bpmInput.value = state.bpm;
  bpmInput.addEventListener('input', () => {
    state.bpm = Math.max(20, Math.min(300, +bpmInput.value || 120));
    engine.bpm = state.bpm;
  });

  // Transport
  qs('#btn-play').addEventListener('click', () => {
    if (!state.playing) {
      engine.bpm = state.bpm;
      engine.patternLength = state.patternLength ?? 16;
      engine.start();
      state.playing = true;
      qs('#btn-play').classList.add('active');
      qs('#btn-stop').classList.remove('active');
    }
  });

  qs('#btn-stop').addEventListener('click', () => {
    engine.stop();
    state.playing = false;
    qs('#btn-play').classList.remove('active');
    qs('#btn-stop').classList.add('active');
  });

  // Pattern length
  const patLenSel = qs('#pat-len');
  patLenSel.addEventListener('change', () => {
    engine.patternLength = +patLenSel.value;
    state.patternLength = +patLenSel.value;
  });

  // Tabs
  qsa('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.bottomTab = btn.dataset.tab;
      renderBottomPanel();
    });
  });

  // MIDI
  const midiOk = await midi.init();
  state.midiAvailable = midiOk;
  state.midiOutputs = midi.getOutputNames();

  const midiSel = qs('#midi-select');
  midiSel.addEventListener('change', () => {
    state.selectedMidiOut = +midiSel.value;
    midi.selectOutput(state.selectedMidiOut);
  });

  if (!midiOk) {
    qs('#midi-status').textContent = 'Web MIDI not available — use Chrome or Edge';
    qs('#midi-status').className = 'midi-error';
  } else {
    renderMidiSelect();
    qs('#midi-status').textContent = midiOk ? '' : '';
  }

  // FX channel input
  const fxChInput = qs('#fx-channel');
  fxChInput.addEventListener('change', () => {
    state.fxChannel = Math.max(1, Math.min(16, +fxChInput.value));
  });

  // Initial panel render
  renderBottomPanel();
}

document.addEventListener('DOMContentLoaded', init);

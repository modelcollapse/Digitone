import { TRACK_PARAMS, FX_PARAMS, TRACK_COLORS, getAllTrackParams, midiNoteToName, noteNameToMidi } from './params.js';
import { MidiOutput } from './midi.js';
import { Engine, computeLfoValue, lfoWaveformPoints } from './engine.js';

// ─── State ──────────────────────────────────────────────────────────────────

function makeStep() {
  return { active: false, note: 60, velocity: 100, length: 1, plocks: {} };
}
function makeTrack(idx) {
  return { name: `T${idx+1}`, channel: idx+1, color: TRACK_COLORS[idx],
           steps: Array.from({length:16}, makeStep), paramValues: buildDefaultParams() };
}
function buildDefaultParams() {
  const v = {};
  for (const g of Object.values(TRACK_PARAMS)) for (const p of g.params) v[p.cc] = p.def;
  return v;
}
function makeLfo(id) {
  return {
    id, active: true, waveform: 'sine',
    rateBeats: 4, freeHz: 0,
    depth: 64, offset: 64, phaseOffset: 0, slew: 0,
    oneShot: false,
    // breakpoint data
    breakpoints: [{t:0,v:0.3},{t:0.25,v:0.9},{t:0.6,v:0.2},{t:1,v:0.5}],
    bpSmooth: true,
    // step LFO data
    stepValues: [100,40,80,20,110,55,90,30,70,100,10,80,60,50,120,64],
    stepCount: 8,
    // drunk
    drunkStep: 0.4,
    // stutter
    stutterDivs: 16, stutterDensity: 0.5,
    dest: null,
  };
}

const state = {
  tracks: [0,1,2,3].map(makeTrack),
  softLfos: [], lfoIdCounter: 0,
  selectedTrack: 0, selectedStep: null,
  bpm: 120, playing: false, currentStep: -1,
  bottomTab: 'params',
  fxParamValues: buildFxDefaults(), fxChannel: 9,
  midiAvailable: false, midiOutputs: [], selectedMidiOut: -1,
  paramGroupTab: 'syn1', fxGroupTab: 'chorus',
};

function buildFxDefaults() {
  const v = {};
  for (const g of Object.values(FX_PARAMS)) for (const p of g.params) v[`fx_${p.cc}`] = p.def;
  return v;
}

const midi = new MidiOutput();
const engine = new Engine(midi);
engine.tracks = state.tracks;
engine.softLfos = state.softLfos;
engine.onStepChange = step => { state.currentStep = step; renderStepHighlights(); };
midi.onStateChange = outputs => { state.midiOutputs = outputs; renderMidiSelect(); };

// ─── DOM helpers ────────────────────────────────────────────────────────────

function el(tag, cls, attrs={}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k,v] of Object.entries(attrs)) {
    if (k==='text') e.textContent=v; else if (k==='html') e.innerHTML=v; else e.setAttribute(k,v);
  }
  return e;
}
const qs  = (s,r=document) => r.querySelector(s);
const qsa = (s,r=document) => [...r.querySelectorAll(s)];

// ─── Piano keyboard ──────────────────────────────────────────────────────────

const WHITE_SEMIS = new Set([0,2,4,5,7,9,11]);
const WHITE_W = 26, BLACK_W = 17, WHITE_H = 68, BLACK_H = 42;

function buildPianoKeyboard(selectedNote, onSelect) {
  // Show C2 – B6 (5 octaves = 60 notes, 35 white keys)
  const startNote = 24; // C2
  const endNote   = 107; // B7

  const wrap = el('div', 'piano-wrap');

  // Octave nav
  let viewOct = Math.max(2, Math.min(6, Math.floor(selectedNote/12)-1));

  function rebuild() {
    wrap.innerHTML = '';

    const octNav = el('div', 'piano-oct-nav');
    const left  = el('button', 'piano-oct-btn', {text: '◀'});
    const right = el('button', 'piano-oct-btn', {text: '▶'});
    const octLbl = el('span', 'piano-oct-lbl', {text: `Oct ${viewOct}–${viewOct+1}`});
    left.addEventListener('click', ()  => { viewOct = Math.max(1,viewOct-1); rebuild(); });
    right.addEventListener('click', () => { viewOct = Math.min(6,viewOct+1); rebuild(); });
    octNav.append(left, octLbl, right);
    wrap.appendChild(octNav);

    const keyboard = el('div', 'piano-keyboard');
    const lo = viewOct * 12;
    const hi = lo + 24; // 2 octaves

    // Build position map for white keys
    const whitePos = {};
    let wIdx = 0;
    for (let n = lo; n <= hi; n++) {
      if (WHITE_SEMIS.has(n%12)) { whitePos[n] = wIdx++; }
    }
    const totalWhites = wIdx;
    keyboard.style.width = (totalWhites * WHITE_W) + 'px';
    keyboard.style.height = WHITE_H + 'px';

    for (let n = lo; n <= hi; n++) {
      const isWhite = WHITE_SEMIS.has(n%12);
      const key = el('div', `piano-key ${isWhite?'white':'black'}${n===selectedNote?' selected':''}`);
      if (isWhite) {
        key.style.left = (whitePos[n] * WHITE_W) + 'px';
        key.style.width = WHITE_W + 'px';
        key.style.height = WHITE_H + 'px';
        if (n%12===0) key.textContent = `C${Math.floor(n/12)-1}`;
      } else {
        const prevLeft = whitePos[n-1] * WHITE_W;
        key.style.left = (prevLeft + WHITE_W - Math.floor(BLACK_W/2)) + 'px';
        key.style.width = BLACK_W + 'px';
        key.style.height = BLACK_H + 'px';
      }
      key.addEventListener('mousedown', e => {
        e.stopPropagation();
        selectedNote = n;
        onSelect(n);
        qsa('.piano-key.selected', keyboard).forEach(k => k.classList.remove('selected'));
        key.classList.add('selected');
        // Audition
        midi.noteOn(state.tracks[state.selectedTrack].channel, n, 100);
        setTimeout(() => midi.noteOff(state.tracks[state.selectedTrack].channel, n), 250);
      });
      keyboard.appendChild(key);
    }

    wrap.appendChild(keyboard);
  }

  rebuild();
  return wrap;
}

// ─── Step editor modal ───────────────────────────────────────────────────────

function openStepEditor(trackIdx, stepIdx, anchor) {
  qs('.step-modal')?.remove();

  const step  = state.tracks[trackIdx].steps[stepIdx];
  const modal = el('div', 'step-modal');

  const title = el('div', 'modal-title', {text: `Track ${trackIdx+1} — Step ${stepIdx+1}`});
  modal.appendChild(title);

  // Piano note picker
  let currentNote = step.note ?? 60;
  const noteDisplay = el('div', 'modal-note-display', {text: midiNoteToName(currentNote)});
  const piano = buildPianoKeyboard(currentNote, n => {
    currentNote = n;
    noteDisplay.textContent = midiNoteToName(n);
  });
  modal.append(noteDisplay, piano);

  // Velocity
  const velRow = el('div', 'modal-row');
  const velLbl = el('label', 'modal-label', {text: 'Velocity'});
  const velVal = el('span', 'modal-val', {text: step.velocity});
  const velSlider = el('input', 'modal-slider', {type:'range', min:1, max:127, value: step.velocity});
  velSlider.addEventListener('input', () => { velVal.textContent = velSlider.value; });
  velRow.append(velLbl, velSlider, velVal);
  modal.appendChild(velRow);

  // Length
  const lenRow = el('div', 'modal-row');
  const lenLbl = el('label', 'modal-label', {text: 'Length (steps)'});
  const lenVal = el('span', 'modal-val', {text: step.length});
  const lenSlider = el('input', 'modal-slider', {type:'range', min:1, max:32, value: step.length});
  lenSlider.addEventListener('input', () => { lenVal.textContent = lenSlider.value; });
  lenRow.append(lenLbl, lenSlider, lenVal);
  modal.appendChild(lenRow);

  // Actions
  const actions = el('div', 'modal-actions');
  const okBtn     = el('button', 'modal-btn primary', {text: 'OK'});
  const cancelBtn = el('button', 'modal-btn', {text: 'Cancel'});
  const clearBtn  = el('button', 'modal-btn danger', {text: 'Clear'});

  okBtn.addEventListener('click', () => {
    step.note = currentNote;
    step.velocity = +velSlider.value;
    step.length = +lenSlider.value;
    step.active = true;
    const btn = qs(`.step-btn[data-track="${trackIdx}"][data-step="${stepIdx}"]`);
    if (btn) {
      btn.classList.add('active');
      const nl = qs('.step-note', btn);
      if (nl) nl.textContent = midiNoteToName(currentNote);
    }
    modal.remove();
    renderBottomPanel();
  });
  cancelBtn.addEventListener('click', () => modal.remove());
  clearBtn.addEventListener('click', () => {
    step.active = false;
    step.plocks = {};
    const btn = qs(`.step-btn[data-track="${trackIdx}"][data-step="${stepIdx}"]`);
    if (btn) { btn.classList.remove('active'); const nl=qs('.step-note',btn); if(nl) nl.textContent=''; }
    modal.remove();
  });

  actions.append(okBtn, cancelBtn, clearBtn);
  modal.appendChild(actions);

  // Position
  const rect = anchor.getBoundingClientRect();
  const top = Math.min(rect.bottom + 4, window.innerHeight - 340);
  const left = Math.min(rect.left, window.innerWidth - 420);
  modal.style.top  = (top  + window.scrollY) + 'px';
  modal.style.left = (left + window.scrollX) + 'px';
  document.body.appendChild(modal);

  setTimeout(() => {
    document.addEventListener('click', function out(e) {
      if (!modal.contains(e.target) && !anchor.contains(e.target)) { modal.remove(); document.removeEventListener('click',out); }
    });
  }, 60);
}

// ─── Knob ────────────────────────────────────────────────────────────────────

function createKnob(param, getValue, onSet) {
  const wrap = el('div', 'knob-wrap');
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 40 40');
  svg.setAttribute('width','40');
  svg.setAttribute('height','40');
  svg.setAttribute('class','knob-svg');

  const R=16, cx=20, cy=20;
  const SA = 225*Math.PI/180, ARC = 270*Math.PI/180;

  function arcPath(from, to) {
    const x1=cx+R*Math.cos(from), y1=cy+R*Math.sin(from);
    const x2=cx+R*Math.cos(to),   y2=cy+R*Math.sin(to);
    return `M ${x1} ${y1} A ${R} ${R} 0 ${to-from>Math.PI?1:0} 1 ${x2} ${y2}`;
  }

  const bg = document.createElementNS('http://www.w3.org/2000/svg','path');
  bg.setAttribute('stroke','#2a2a2a'); bg.setAttribute('stroke-width','3');
  bg.setAttribute('fill','none'); bg.setAttribute('stroke-linecap','round');

  const arc = document.createElementNS('http://www.w3.org/2000/svg','path');
  arc.setAttribute('stroke-width','3'); arc.setAttribute('fill','none');
  arc.setAttribute('stroke-linecap','round');

  const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('r','2.5'); dot.setAttribute('fill','#fff');

  svg.append(bg, arc, dot);
  wrap.appendChild(svg);

  const lbl = el('div','knob-label',{text:param.name});
  const val = el('div','knob-value');
  wrap.append(lbl, val);

  function update() {
    const v = getValue();
    const norm = (v - param.min) / (param.max - param.min);
    const angle = SA + norm * ARC;
    bg.setAttribute('d', arcPath(SA, SA+ARC));
    arc.setAttribute('d', arcPath(SA, SA+norm*ARC));
    arc.setAttribute('stroke', '#e07020');
    dot.setAttribute('cx', cx + (R-1)*Math.cos(angle));
    dot.setAttribute('cy', cy + (R-1)*Math.sin(angle));
    val.textContent = v;
  }
  update();

  let startY, startVal;
  svg.addEventListener('mousedown', e => {
    e.preventDefault();
    startY = e.clientY; startVal = getValue();
    svg.classList.add('dragging');
    const onMove = e => {
      const dy = startY - e.clientY;
      const nv = Math.max(param.min, Math.min(param.max, Math.round(startVal + dy*(param.max-param.min)/100)));
      onSet(nv); update();
    };
    const onUp = () => { svg.classList.remove('dragging'); document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  svg.addEventListener('dblclick', () => {
    const inp = el('input','knob-input',{type:'number',value:getValue(),min:param.min,max:param.max});
    wrap.replaceChild(inp, svg);
    inp.focus(); inp.select();
    const commit = () => { onSet(Math.max(param.min,Math.min(param.max,+inp.value||0))); wrap.replaceChild(svg,inp); update(); };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if(e.key==='Enter') commit(); if(e.key==='Escape') wrap.replaceChild(svg,inp); });
  });

  wrap._update = update;
  return wrap;
}

// ─── Breakpoint canvas ───────────────────────────────────────────────────────

function buildBreakpointCanvas(lfo) {
  const W = 320, H = 100;
  const canvas = el('canvas','bp-canvas',{width:W,height:H});
  let dragging = null;

  function ptToPx(pt) { return {x: pt.t*W, y: (1-pt.v)*H}; }
  function pxToPt(cx,cy) { return {t: Math.max(0,Math.min(1,cx/W)), v: Math.max(0,Math.min(1,1-cy/H))}; }

  function draw() {
    const ctx2 = canvas.getContext('2d');
    ctx2.clearRect(0,0,W,H);

    // Grid
    ctx2.strokeStyle = '#1c1c1c'; ctx2.lineWidth = 0.5;
    for (let i=1;i<4;i++) { ctx2.beginPath(); ctx2.moveTo(W*i/4,0); ctx2.lineTo(W*i/4,H); ctx2.stroke(); }
    for (let i=1;i<2;i++) { ctx2.beginPath(); ctx2.moveTo(0,H*i/2); ctx2.lineTo(W,H*i/2); ctx2.stroke(); }

    const pts = lfo.breakpoints;

    // Fill under curve
    ctx2.beginPath();
    if (lfo.bpSmooth) {
      const p0 = ptToPx(pts[0]);
      ctx2.moveTo(p0.x, H);
      ctx2.lineTo(p0.x, p0.y);
      for (let i=1;i<pts.length;i++) {
        const pr = ptToPx(pts[i-1]), pc = ptToPx(pts[i]);
        const cpx = (pr.x+pc.x)/2;
        ctx2.bezierCurveTo(cpx,pr.y,cpx,pc.y,pc.x,pc.y);
      }
      const pN = ptToPx(pts[pts.length-1]);
      ctx2.lineTo(pN.x, H);
    } else {
      const p0 = ptToPx(pts[0]);
      ctx2.moveTo(p0.x, H); ctx2.lineTo(p0.x, p0.y);
      pts.forEach(pt => { const p=ptToPx(pt); ctx2.lineTo(p.x,p.y); });
      const pN = ptToPx(pts[pts.length-1]);
      ctx2.lineTo(pN.x, H);
    }
    ctx2.closePath();
    ctx2.fillStyle = 'rgba(224,112,32,0.12)';
    ctx2.fill();

    // Line
    ctx2.beginPath();
    if (lfo.bpSmooth) {
      const p0 = ptToPx(pts[0]);
      ctx2.moveTo(p0.x, p0.y);
      for (let i=1;i<pts.length;i++) {
        const pr=ptToPx(pts[i-1]), pc=ptToPx(pts[i]);
        const cpx = (pr.x+pc.x)/2;
        ctx2.bezierCurveTo(cpx,pr.y,cpx,pc.y,pc.x,pc.y);
      }
    } else {
      pts.forEach((pt,i) => { const p=ptToPx(pt); i===0?ctx2.moveTo(p.x,p.y):ctx2.lineTo(p.x,p.y); });
    }
    ctx2.strokeStyle = '#e07020'; ctx2.lineWidth = 2;
    ctx2.stroke();

    // Points
    pts.forEach((pt,i) => {
      const {x,y} = ptToPx(pt);
      ctx2.beginPath(); ctx2.arc(x,y,i===dragging?8:5,0,Math.PI*2);
      ctx2.fillStyle   = (i===0||i===pts.length-1) ? '#2090e0' : '#e07020';
      ctx2.fill();
      ctx2.strokeStyle = '#fff'; ctx2.lineWidth=1.5; ctx2.stroke();
      // Value label
      ctx2.fillStyle='rgba(255,255,255,0.6)'; ctx2.font='9px monospace';
      ctx2.fillText(Math.round(pt.v*127), x+6, y-4);
    });
  }

  function hitTest(cx,cy) {
    return lfo.breakpoints.findIndex(pt => {
      const p=ptToPx(pt); return Math.hypot(p.x-cx,p.y-cy)<12;
    });
  }

  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    const r=canvas.getBoundingClientRect();
    const cx=(e.clientX-r.left)*(W/r.width), cy=(e.clientY-r.top)*(H/r.height);
    const hitIdx = hitTest(cx,cy);
    if (hitIdx>=0) {
      dragging = hitIdx;
    } else if (e.button===0) {
      const newPt = pxToPt(cx,cy);
      lfo.breakpoints.push(newPt);
      lfo.breakpoints.sort((a,b)=>a.t-b.t);
      dragging = lfo.breakpoints.indexOf(newPt);
    }
    draw();
    const onMove = e => {
      if (dragging===null) return;
      const r=canvas.getBoundingClientRect();
      const cx=(e.clientX-r.left)*(W/r.width), cy=(e.clientY-r.top)*(H/r.height);
      const pt = pxToPt(cx,cy);
      if (dragging===0) pt.t=0;
      else if (dragging===lfo.breakpoints.length-1) pt.t=1;
      lfo.breakpoints[dragging] = pt;
      draw();
    };
    const onUp = () => {
      dragging=null;
      lfo.breakpoints.sort((a,b)=>a.t-b.t);
      lfo.breakpoints[0].t=0;
      lfo.breakpoints[lfo.breakpoints.length-1].t=1;
      draw();
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
    };
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });

  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r=canvas.getBoundingClientRect();
    const cx=(e.clientX-r.left)*(W/r.width), cy=(e.clientY-r.top)*(H/r.height);
    const hitIdx=hitTest(cx,cy);
    if (hitIdx>0 && hitIdx<lfo.breakpoints.length-1) { lfo.breakpoints.splice(hitIdx,1); draw(); }
  });

  draw();
  canvas._redraw = draw;
  return canvas;
}

// ─── Step LFO editor ─────────────────────────────────────────────────────────

function buildStepLfoEditor(lfo) {
  const wrap = el('div','step-lfo-wrap');

  const topRow = el('div','step-lfo-top');
  const countLabel = el('span','slfo-label',{text:'Steps:'});
  topRow.appendChild(countLabel);

  [4,8,16].forEach(n => {
    const btn = el('button','step-count-btn'+(lfo.stepCount===n?' active':''),{text:n});
    btn.addEventListener('click', () => {
      lfo.stepCount=n;
      while (lfo.stepValues.length<n) lfo.stepValues.push(64);
      lfo.stepValues = lfo.stepValues.slice(0,n);
      topRow.querySelectorAll('.step-count-btn').forEach(b=>b.classList.toggle('active',+b.textContent===n));
      renderBars();
    });
    topRow.appendChild(btn);
  });

  // Preset shapes
  const presetLabel = el('span','slfo-label',{text:'Shape:'});
  topRow.appendChild(presetLabel);
  const presets = {
    'Ramp↑': n => Array.from({length:n},(_,i)=>Math.round(i/(n-1)*127)),
    'Ramp↓': n => Array.from({length:n},(_,i)=>Math.round((1-i/(n-1))*127)),
    'Pyramid': n => Array.from({length:n},(_,i)=>Math.round(Math.sin(i/(n-1)*Math.PI)*127)),
    'Random': n => Array.from({length:n},()=>Math.round(Math.random()*127)),
    'Gate 50': n => Array.from({length:n},(_,i)=>i%2===0?100:10),
    'Gate 25': n => Array.from({length:n},(_,i)=>i%4===0?120:10),
  };
  for (const [name, fn] of Object.entries(presets)) {
    const btn = el('button','preset-btn',{text:name});
    btn.addEventListener('click', () => { lfo.stepValues=fn(lfo.stepCount); renderBars(); });
    topRow.appendChild(btn);
  }

  wrap.appendChild(topRow);

  const barsEl = el('div','step-lfo-bars');

  function renderBars() {
    barsEl.innerHTML='';
    const n = lfo.stepCount||8;
    while (lfo.stepValues.length<n) lfo.stepValues.push(64);

    for (let i=0;i<n;i++) {
      const barWrap = el('div','slfo-bar-wrap');
      const fill = el('div','slfo-bar-fill');
      const valLbl = el('div','slfo-bar-val',{text:lfo.stepValues[i]});
      fill.style.height = ((lfo.stepValues[i]/127)*100)+'%';

      const updateVal = (clientY, rect) => {
        const pct = 1-(clientY-rect.top)/rect.height;
        lfo.stepValues[i] = Math.max(0, Math.min(127, Math.round(pct*127)));
        fill.style.height = ((lfo.stepValues[i]/127)*100)+'%';
        valLbl.textContent = lfo.stepValues[i];
      };

      barWrap.addEventListener('mousedown', e => {
        e.preventDefault();
        const rect=barWrap.getBoundingClientRect();
        updateVal(e.clientY,rect);
        const onMove = e => updateVal(e.clientY, rect);
        const onUp   = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
        document.addEventListener('mousemove',onMove);
        document.addEventListener('mouseup',onUp);
      });

      barWrap.append(fill,valLbl);
      barsEl.appendChild(barWrap);
    }
  }

  renderBars();
  wrap.appendChild(barsEl);
  return wrap;
}

// ─── LFO waveform preview ────────────────────────────────────────────────────

function drawLfoPreview(canvas, waveform) {
  const ctx = canvas.getContext('2d');
  const {width:w,height:h} = canvas;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(224,112,32,0.5)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
  const pts = lfoWaveformPoints(waveform,w,h);
  ctx.strokeStyle='#e07020'; ctx.lineWidth=1.5; ctx.beginPath();
  pts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
  ctx.stroke();
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderMidiSelect() {
  const sel=qs('#midi-select'); if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="-1">-- No Output --</option>'+
    state.midiOutputs.map(o=>`<option value="${o.i}">${o.name}</option>`).join('');
  sel.value=cur;
}

function renderStepHighlights() {
  const cs=state.currentStep;
  qsa('.step-btn').forEach(btn=>btn.classList.toggle('playing',+btn.dataset.step===cs&&cs!==-1));
}

// ─── Tracks ──────────────────────────────────────────────────────────────────

function buildTrackRow(trackIdx) {
  const track=state.tracks[trackIdx];
  const row=el('div','track-row');
  row.style.setProperty('--track-color',track.color);

  const header=el('div','track-header');
  const nameEl=el('span','track-name',{text:track.name});
  nameEl.contentEditable=true;
  nameEl.addEventListener('input',()=>{track.name=nameEl.textContent.trim();});
  const chInput=el('input','track-ch-input',{type:'number',min:1,max:16,value:track.channel});
  chInput.addEventListener('change',()=>{track.channel=Math.max(1,Math.min(16,+chInput.value));});
  header.append(nameEl,chInput);
  row.appendChild(header);

  const stepsEl=el('div','steps');
  for (let s=0;s<16;s++) {
    const step=track.steps[s];
    const btn=el('div','step-btn'+(step.active?' active':''));
    btn.dataset.track=trackIdx; btn.dataset.step=s;
    const noteLabel=el('span','step-note',{text:step.active?midiNoteToName(step.note):''});
    btn.appendChild(noteLabel);

    btn.addEventListener('click',()=>{
      step.active=!step.active;
      btn.classList.toggle('active',step.active);
      noteLabel.textContent=step.active?midiNoteToName(step.note):'';
      state.selectedTrack=trackIdx; state.selectedStep=s;
      renderBottomPanel();
    });
    btn.addEventListener('contextmenu',e=>{
      e.preventDefault();
      state.selectedTrack=trackIdx; state.selectedStep=s;
      openStepEditor(trackIdx,s,btn);
    });
    btn.addEventListener('dblclick',e=>{
      e.preventDefault();
      state.selectedTrack=trackIdx; state.selectedStep=s;
      openStepEditor(trackIdx,s,btn);
    });

    stepsEl.appendChild(btn);
  }

  const volParam={name:'Vol',cc:7,min:0,max:127,def:100};
  const volKnob=createKnob(volParam,()=>track.paramValues[7]??100,v=>{track.paramValues[7]=v;midi.cc(track.channel,7,v);});
  volKnob.classList.add('track-vol-knob');
  row.append(stepsEl,volKnob);

  header.addEventListener('click',()=>{
    state.selectedTrack=trackIdx; state.selectedStep=null;
    renderBottomPanel();
    qsa('.track-row').forEach((r,i)=>r.classList.toggle('selected',i===trackIdx));
  });

  return row;
}

// ─── Bottom panel ─────────────────────────────────────────────────────────────

function renderBottomPanel() {
  qsa('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.bottomTab));
  const content=qs('#panel-content');
  content.innerHTML='';
  switch(state.bottomTab) {
    case 'params':  renderParams(content); break;
    case 'plocks':  renderPlocks(content); break;
    case 'lfos':    renderLfos(content);   break;
    case 'fx':      renderFx(content);     break;
  }
}

function renderParams(container) {
  const track=state.tracks[state.selectedTrack];
  if(!track)return;
  const groupTabs=el('div','group-tabs');
  for (const [key,group] of Object.entries(TRACK_PARAMS)) {
    const btn=el('button','group-tab-btn'+(state.paramGroupTab===key?' active':''),{text:group.label});
    btn.addEventListener('click',()=>{state.paramGroupTab=key;renderBottomPanel();});
    groupTabs.appendChild(btn);
  }
  container.appendChild(groupTabs);
  const group=TRACK_PARAMS[state.paramGroupTab];
  const knobRow=el('div','knob-row');
  for (const param of group.params) {
    const knob=createKnob(param,()=>track.paramValues[param.cc]??param.def,v=>{
      track.paramValues[param.cc]=v; midi.cc(track.channel,param.cc,v);
      if(param.lsb) midi.cc(track.channel,param.lsb,v);
    });
    knobRow.appendChild(knob);
  }
  container.appendChild(knobRow);
  container.appendChild(el('div','panel-hint',{text:`Track ${state.selectedTrack+1} — CH ${track.channel}`}));
}

function renderPlocks(container) {
  const {selectedTrack:ti,selectedStep:si}=state;
  if(si===null){container.innerHTML='<p class="panel-hint">Double-click or right-click a step to select it, then add P-Locks here.</p>';return;}
  const track=state.tracks[ti], step=track.steps[si];
  container.appendChild(el('div','plocks-title',{text:`P-Locks — T${ti+1} Step ${si+1} (${midiNoteToName(step.note)})`}));
  container.appendChild(el('p','panel-hint',{text:'Override any CC value for this step only. Clear the field to remove.'}));
  const grid=el('div','plocks-grid');
  for (const group of Object.values(TRACK_PARAMS)) {
    for (const param of group.params) {
      const row=el('div','plock-row');
      const inp=el('input','plock-input',{type:'number',min:param.min,max:param.max,placeholder:`— (${param.min}–${param.max})`});
      if(step.plocks[param.cc]!=null) inp.value=step.plocks[param.cc];
      inp.addEventListener('change',()=>{
        const raw=inp.value.trim();
        if(raw==='') delete step.plocks[param.cc];
        else step.plocks[param.cc]=Math.max(param.min,Math.min(param.max,+raw));
      });
      row.append(el('label','plock-label',{text:param.name}),inp,el('span','plock-cc',{text:`CC${param.cc}`}));
      grid.appendChild(row);
    }
  }
  container.appendChild(grid);
}

// ─── LFO panel ───────────────────────────────────────────────────────────────

const LFO_WAVEFORMS = [
  {id:'sine',        label:'Sine'},
  {id:'triangle',    label:'Triangle'},
  {id:'sawtooth',    label:'Sawtooth'},
  {id:'rev-saw',     label:'Rev Saw'},
  {id:'square',      label:'Square'},
  {id:'pulse-25',    label:'Pulse 25%'},
  {id:'pulse-75',    label:'Pulse 75%'},
  {id:'exp-rise',    label:'Exp Rise'},
  {id:'exp-fall',    label:'Exp Fall'},
  {id:'random',      label:'S&H Random'},
  {id:'smooth-random',label:'Smooth Rand'},
  {id:'drunk',       label:'Drunk Walk'},
  {id:'stutter',     label:'Stutter'},
  {id:'steps',       label:'Step Seq'},
  {id:'breakpoint',  label:'Breakpoint'},
];

function renderLfos(container) {
  const toolbar=el('div','lfo-toolbar');
  const addBtn=el('button','btn-add-lfo',{text:'+ Add LFO'});
  addBtn.addEventListener('click',()=>{
    if(state.softLfos.length>=8)return;
    const lfo=makeLfo(++state.lfoIdCounter);
    state.softLfos.push(lfo);
    renderBottomPanel();
  });
  toolbar.appendChild(addBtn);
  if(state.softLfos.length===0){
    toolbar.appendChild(el('span','panel-hint',{text:' — Up to 8 software LFOs, each routing to any Digitone CC parameter.'}));
  }
  container.appendChild(toolbar);

  const allParams = getAllTrackParams();

  state.softLfos.forEach((lfo,lfoIdx)=>{
    const card=el('div','lfo-card'+(lfo.active?'':' inactive'));

    // ── Header
    const hdr=el('div','lfo-header');
    const nameEl=el('span','lfo-name',{text:`LFO ${lfoIdx+1}`});
    const activeBtn=el('button','lfo-active-btn'+(lfo.active?' on':''),{text:lfo.active?'ON':'OFF'});
    activeBtn.addEventListener('click',()=>{
      lfo.active=!lfo.active;
      activeBtn.textContent=lfo.active?'ON':'OFF';
      activeBtn.classList.toggle('on',lfo.active);
      card.classList.toggle('inactive',!lfo.active);
    });
    const oneShotBtn=el('button','lfo-oneshot-btn'+(lfo.oneShot?' on':''),{text:'One-Shot'});
    oneShotBtn.title='Play once then hold final value';
    oneShotBtn.addEventListener('click',()=>{
      lfo.oneShot=!lfo.oneShot;
      oneShotBtn.classList.toggle('on',lfo.oneShot);
      if(lfo.oneShot) lfo._shotDone=false;
    });
    const retrigBtn=el('button','lfo-retrig-btn',{text:'↺ Retrig'});
    retrigBtn.title='Reset LFO phase';
    retrigBtn.addEventListener('click',()=>{
      lfo._shotDone=false;
      lfo._shSlot=undefined; lfo._srSlot=undefined; lfo._drunkSlot=undefined; lfo._stutterSlot=undefined;
    });
    const delBtn=el('button','lfo-del-btn',{text:'✕'});
    delBtn.addEventListener('click',()=>{state.softLfos.splice(lfoIdx,1);renderBottomPanel();});
    hdr.append(nameEl,activeBtn,oneShotBtn,retrigBtn,delBtn);
    card.appendChild(hdr);

    // ── Waveform selector
    const wfRow=el('div','lfo-row');
    const wfLabel=el('label','lfo-label',{text:'Type'});

    const wfBtns=el('div','lfo-wf-grid');
    LFO_WAVEFORMS.forEach(wf=>{
      const btn=el('button','wf-btn'+(lfo.waveform===wf.id?' active':''),{text:wf.label});
      btn.addEventListener('click',()=>{
        lfo.waveform=wf.id;
        wfBtns.querySelectorAll('.wf-btn').forEach(b=>b.classList.toggle('active',b.textContent===wf.label));
        updateEditor();
        if(previewCanvas) drawLfoPreview(previewCanvas,wf.id);
      });
      wfBtns.appendChild(btn);
    });

    const previewCanvas=el('canvas','lfo-preview',{width:100,height:36});
    drawLfoPreview(previewCanvas,lfo.waveform);

    wfRow.append(wfLabel,wfBtns,previewCanvas);
    card.appendChild(wfRow);

    // ── Dynamic editor (breakpoint / steps / extra params)
    const editorEl=el('div','lfo-editor');
    card.appendChild(editorEl);

    function updateEditor() {
      editorEl.innerHTML='';
      if(lfo.waveform==='breakpoint'){
        const bpWrap=el('div','bp-wrap');
        const bpCanvas=buildBreakpointCanvas(lfo);
        const bpCtrl=el('div','bp-ctrl-row');

        const smoothBtn=el('button','bp-ctrl-btn'+(lfo.bpSmooth?' active':''),{text:'Smooth'});
        smoothBtn.addEventListener('click',()=>{
          lfo.bpSmooth=!lfo.bpSmooth;
          smoothBtn.classList.toggle('active',lfo.bpSmooth);
          bpCanvas._redraw();
        });
        const clearBtn=el('button','bp-ctrl-btn',{text:'Clear'});
        clearBtn.addEventListener('click',()=>{
          lfo.breakpoints=[{t:0,v:0.5},{t:1,v:0.5}];
          bpCanvas._redraw();
        });
        const randBtn=el('button','bp-ctrl-btn',{text:'Random'});
        randBtn.addEventListener('click',()=>{
          const n=Math.floor(Math.random()*6)+3;
          lfo.breakpoints=[{t:0,v:Math.random()},
            ...Array.from({length:n},(_,i)=>({t:(i+1)/(n+1),v:Math.random()})),
            {t:1,v:Math.random()}];
          bpCanvas._redraw();
        });
        const hint=el('span','bp-hint',{text:'Click to add  ·  Drag to move  ·  Right-click to delete'});
        bpCtrl.append(smoothBtn,clearBtn,randBtn,hint);
        bpWrap.append(bpCanvas,bpCtrl);
        editorEl.appendChild(bpWrap);
      } else if(lfo.waveform==='steps'){
        editorEl.appendChild(buildStepLfoEditor(lfo));
      } else if(lfo.waveform==='drunk'){
        const row=el('div','lfo-row');
        const stepParam={name:'Step Size',cc:-1,min:1,max:100,def:40};
        const stepKnob=createKnob(stepParam,()=>Math.round((lfo.drunkStep??0.4)*100),v=>{lfo.drunkStep=v/100;});
        row.append(el('label','lfo-label',{text:'Drunk'}),stepKnob);
        editorEl.appendChild(row);
      } else if(lfo.waveform==='stutter'){
        const row=el('div','lfo-row');
        const divParam={name:'Divs',cc:-1,min:2,max:32,def:16};
        const denParam={name:'Density',cc:-1,min:0,max:100,def:50};
        const divKnob=createKnob(divParam,()=>lfo.stutterDivs??16,v=>{lfo.stutterDivs=v;});
        const denKnob=createKnob(denParam,()=>Math.round((lfo.stutterDensity??0.5)*100),v=>{lfo.stutterDensity=v/100;});
        row.append(el('label','lfo-label',{text:'Stutter'}),divKnob,denKnob);
        editorEl.appendChild(row);
      }
    }
    updateEditor();

    // ── Rate
    const rateRow=el('div','lfo-row');
    rateRow.append(el('label','lfo-label',{text:'Rate'}));
    const rateSel=el('select','lfo-select');
    [{label:'1/16 bar',beats:0.25},{label:'1/8 bar',beats:0.5},{label:'1/4 bar',beats:1},
     {label:'1/2 bar',beats:2},{label:'1 bar',beats:4},{label:'2 bars',beats:8},
     {label:'4 bars',beats:16},{label:'8 bars',beats:32}].forEach(r=>{
      const o=el('option','',{value:r.beats,text:r.label});
      if(lfo.rateBeats===r.beats) o.selected=true;
      rateSel.appendChild(o);
    });
    rateSel.addEventListener('change',()=>{lfo.rateBeats=+rateSel.value;lfo.freeHz=0;freeInp.value='';});
    const freeInp=el('input','lfo-free-inp',{type:'number',min:0.01,max:20,step:0.01,placeholder:'Hz (free)'});
    if(lfo.freeHz>0) freeInp.value=lfo.freeHz;
    freeInp.addEventListener('input',()=>{lfo.freeHz=parseFloat(freeInp.value)||0;});
    rateRow.append(rateSel,el('span','lfo-sep',{text:'or'}),freeInp);
    card.appendChild(rateRow);

    // ── Knobs row
    const knobsRow=el('div','lfo-knobs-row');
    const depP  ={name:'Depth',  cc:-1,min:0,max:127,def:64};
    const offP  ={name:'Offset', cc:-1,min:0,max:127,def:64};
    const phaseP={name:'Phase',  cc:-1,min:0,max:100,def:0};
    const slewP ={name:'Slew',   cc:-1,min:0,max:127,def:0};
    knobsRow.append(
      createKnob(depP,  ()=>lfo.depth,            v=>{lfo.depth=v;}),
      createKnob(offP,  ()=>lfo.offset,           v=>{lfo.offset=v;}),
      createKnob(phaseP,()=>Math.round((lfo.phaseOffset??0)*100),v=>{lfo.phaseOffset=v/100;}),
      createKnob(slewP, ()=>lfo.slew??0,          v=>{lfo.slew=v;}),
    );
    card.appendChild(knobsRow);

    // ── Destination
    const destRow=el('div','lfo-row');
    destRow.append(el('label','lfo-label',{text:'→ Dest'}));
    const chSel=el('select','lfo-select');
    [1,2,3,4].forEach(ch=>{
      const o=el('option','',{value:ch,text:`Track ${ch}`});
      if(lfo.dest?.channel===ch) o.selected=true;
      chSel.appendChild(o);
    });
    const paramSel=el('select','lfo-select lfo-param-sel');
    paramSel.appendChild(el('option','',{value:'',text:'-- CC param --'}));
    for (const [,group] of Object.entries(TRACK_PARAMS)) {
      const og=el('optgroup','',{label:group.label});
      group.params.forEach(p=>{
        const o=el('option','',{value:p.cc,text:`${p.name} (CC${p.cc})`});
        if(lfo.dest?.cc===p.cc&&lfo.dest?.channel===+chSel.value) o.selected=true;
        og.appendChild(o);
      });
      paramSel.appendChild(og);
    }
    const updateDest=()=>{
      const cc=+paramSel.value;
      lfo.dest = cc ? {channel:+chSel.value,cc,paramName:allParams.find(p=>p.cc===cc)?.name??`CC${cc}`} : null;
    };
    chSel.addEventListener('change',updateDest);
    paramSel.addEventListener('change',updateDest);
    destRow.append(chSel,paramSel);
    card.appendChild(destRow);

    container.appendChild(card);
  });
}

function renderFx(container) {
  const groupTabs=el('div','group-tabs');
  for (const [key,group] of Object.entries(FX_PARAMS)) {
    const btn=el('button','group-tab-btn'+(state.fxGroupTab===key?' active':''),{text:group.label});
    btn.addEventListener('click',()=>{state.fxGroupTab=key;renderBottomPanel();});
    groupTabs.appendChild(btn);
  }
  container.appendChild(groupTabs);
  const group=FX_PARAMS[state.fxGroupTab];
  const knobRow=el('div','knob-row');
  for (const param of group.params) {
    const k=`fx_${param.cc}`;
    const knob=createKnob(param,()=>state.fxParamValues[k]??param.def,v=>{state.fxParamValues[k]=v;midi.cc(state.fxChannel,param.cc,v);});
    knobRow.appendChild(knob);
  }
  container.appendChild(knobRow);
  container.appendChild(el('div','panel-hint',{text:`FX — CH ${state.fxChannel}`}));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const tracksEl=qs('#tracks');
  state.tracks.forEach((_,i)=>tracksEl.appendChild(buildTrackRow(i)));
  qsa('.track-row')[0]?.classList.add('selected');

  const bpmInput=qs('#bpm');
  bpmInput.value=state.bpm;
  bpmInput.addEventListener('input',()=>{state.bpm=Math.max(20,Math.min(300,+bpmInput.value||120));engine.bpm=state.bpm;});

  qs('#btn-play').addEventListener('click',()=>{
    if(!state.playing){
      engine.bpm=state.bpm;
      engine.patternLength=state.patternLength??16;
      engine.start();
      state.playing=true;
      qs('#btn-play').classList.add('active');
      qs('#btn-stop').classList.remove('active');
    }
  });
  qs('#btn-stop').addEventListener('click',()=>{
    engine.stop();
    state.playing=false;
    qs('#btn-play').classList.remove('active');
    qs('#btn-stop').classList.add('active');
  });

  qs('#pat-len').addEventListener('change',e=>{engine.patternLength=+e.target.value;state.patternLength=+e.target.value;});
  qsa('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{state.bottomTab=btn.dataset.tab;renderBottomPanel();}));

  const midiOk=await midi.init();
  state.midiAvailable=midiOk;
  state.midiOutputs=midi.getOutputNames();
  qs('#midi-select').addEventListener('change',e=>{state.selectedMidiOut=+e.target.value;midi.selectOutput(+e.target.value);});
  if(!midiOk) { const s=qs('#midi-status'); s.textContent='Web MIDI unavailable — use Chrome/Edge'; s.className='midi-error'; }
  else renderMidiSelect();

  qs('#fx-channel').addEventListener('change',e=>{state.fxChannel=Math.max(1,Math.min(16,+e.target.value));});

  renderBottomPanel();
}

document.addEventListener('DOMContentLoaded', init);

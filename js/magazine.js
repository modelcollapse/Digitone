// ── Magazine interactions & animations ──────────────────────────────────────

// ── Nav scroll behaviour ─────────────────────────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── Reveal on scroll ─────────────────────────────────────────────────────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const delay = parseInt(el.dataset.delay || 0);
    setTimeout(() => el.classList.add('revealed'), delay);
    revealObserver.unobserve(el);
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal-up, .reveal-fade, .reveal-line, .reveal-left')
  .forEach(el => revealObserver.observe(el));

// Stagger siblings
document.querySelectorAll('.stat-card').forEach((el, i) => {
  el.classList.add('reveal-fade');
  el.dataset.delay = i * 80;
  revealObserver.observe(el);
});
document.querySelectorAll('.bento-card').forEach((el, i) => {
  if (!el.dataset.delay) el.dataset.delay = i * 60;
});
document.querySelectorAll('.ts-track').forEach((el, i) => {
  el.dataset.delay = i * 100;
});

// ── Hero canvas — animated FM waveform grid ──────────────────────────────────
(function initHeroCanvas() {
  const canvas = document.getElementById('hero-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, t = 0;

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Grid of dots that pulse like FM operators
  const COLS = 32, ROWS = 18;
  function draw() {
    ctx.clearRect(0, 0, W, H);

    const cellW = W / COLS;
    const cellH = H / ROWS;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) * cellW;
        const y = (r + 0.5) * cellH;

        // FM formula: carrier + modulator
        const carrier = Math.sin(t * 0.8 + c * 0.4);
        const mod = Math.sin(t * 2.1 + r * 0.6 + c * 0.2) * 3;
        const val = Math.sin(carrier + mod);

        const norm = (val + 1) / 2;
        const radius = 1 + norm * 3;
        const alpha = 0.06 + norm * 0.25;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(224, 112, 32, ${alpha})`;
        ctx.fill();
      }
    }

    // Overlay waveform line in center
    const midY = H / 2;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(224, 112, 32, 0.15)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x < W; x += 2) {
      const n = x / W;
      const carrier2 = Math.sin(t * 1.2 + n * Math.PI * 6);
      const mod2 = Math.sin(t * 3.5 + n * Math.PI * 14) * 2.5;
      const y = midY + Math.sin(carrier2 + mod2) * (H * 0.08);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    t += 0.012;
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── FM Algorithm definitions ──────────────────────────────────────────────────
const ALGORITHMS = [
  {
    name: 'Algorithm 1',
    desc: 'A modulates B, C modulates D. Two independent FM pairs stacked as carriers.',
    tags: ['Dual Carrier', 'Classic FM', 'Bell / Organ'],
    ops: [
      { id: 'A', label: 'A', x: 100, y: 40, carrier: true },
      { id: 'B', label: 'B', x: 100, y: 140, carrier: false },
      { id: 'C', label: 'C', x: 280, y: 40, carrier: true },
      { id: 'D', label: 'D', x: 280, y: 140, carrier: false },
    ],
    mods: [['B','A'], ['D','C']],
    outputs: ['A', 'C'],
  },
  {
    name: 'Algorithm 2',
    desc: 'B, C, D all modulate A. Single carrier with three modulators for rich, dense textures.',
    tags: ['Dense', 'Rich', 'Metallic / Brass'],
    ops: [
      { id: 'A', label: 'A', x: 200, y: 50, carrier: true },
      { id: 'B', label: 'B', x: 80, y: 160, carrier: false },
      { id: 'C', label: 'C', x: 200, y: 160, carrier: false },
      { id: 'D', label: 'D', x: 320, y: 160, carrier: false },
    ],
    mods: [['B','A'], ['C','A'], ['D','A']],
    outputs: ['A'],
  },
  {
    name: 'Algorithm 3',
    desc: 'D modulates C modulates B modulates A. Full serial chain — deepest modulation.',
    tags: ['Serial', 'Evolving', 'Complex Bass'],
    ops: [
      { id: 'A', label: 'A', x: 80, y: 130, carrier: true },
      { id: 'B', label: 'B', x: 170, y: 130, carrier: false },
      { id: 'C', label: 'C', x: 270, y: 130, carrier: false },
      { id: 'D', label: 'D', x: 370, y: 130, carrier: false },
    ],
    mods: [['B','A'], ['C','B'], ['D','C']],
    outputs: ['A'],
  },
  {
    name: 'Algorithm 4',
    desc: 'C modulates both A and B carriers. Shared modulator — linked harmonic content.',
    tags: ['Shared Mod', 'Chordal', 'Strings'],
    ops: [
      { id: 'A', label: 'A', x: 100, y: 80, carrier: true },
      { id: 'B', label: 'B', x: 280, y: 80, carrier: true },
      { id: 'C', label: 'C', x: 190, y: 200, carrier: false },
      { id: 'D', label: 'D', x: 190, y: 60, carrier: true },
    ],
    mods: [['C','A'], ['C','B']],
    outputs: ['A', 'B', 'D'],
  },
  {
    name: 'Algorithm 5',
    desc: 'D modulates C, both A and B are free carriers. Flexible — one FM pair plus two sine carriers.',
    tags: ['Additive + FM', 'Flexible', 'Pads'],
    ops: [
      { id: 'A', label: 'A', x: 80, y: 130, carrier: true },
      { id: 'B', label: 'B', x: 190, y: 130, carrier: true },
      { id: 'C', label: 'C', x: 320, y: 80, carrier: true },
      { id: 'D', label: 'D', x: 320, y: 200, carrier: false },
    ],
    mods: [['D','C']],
    outputs: ['A', 'B', 'C'],
  },
  {
    name: 'Algorithm 6',
    desc: 'All four operators are carriers with no modulation. Pure additive synthesis.',
    tags: ['Additive', 'Pure Tones', 'Organ'],
    ops: [
      { id: 'A', label: 'A', x: 60, y: 130, carrier: true },
      { id: 'B', label: 'B', x: 170, y: 130, carrier: true },
      { id: 'C', label: 'C', x: 280, y: 130, carrier: true },
      { id: 'D', label: 'D', x: 390, y: 130, carrier: true },
    ],
    mods: [],
    outputs: ['A', 'B', 'C', 'D'],
  },
  {
    name: 'Algorithm 7',
    desc: 'B modulates A, C and D are free carriers. Two carriers plus one FM pair.',
    tags: ['Hybrid', 'Balanced', 'Keys'],
    ops: [
      { id: 'A', label: 'A', x: 80, y: 80, carrier: true },
      { id: 'B', label: 'B', x: 80, y: 200, carrier: false },
      { id: 'C', label: 'C', x: 240, y: 130, carrier: true },
      { id: 'D', label: 'D', x: 380, y: 130, carrier: true },
    ],
    mods: [['B','A']],
    outputs: ['A', 'C', 'D'],
  },
  {
    name: 'Algorithm 8',
    desc: 'D modulates C, B modulates A — two pairs with A and C as carriers. Symmetric.',
    tags: ['Symmetric', 'Dual FM', 'Bells / Pads'],
    ops: [
      { id: 'A', label: 'A', x: 100, y: 80, carrier: true },
      { id: 'B', label: 'B', x: 100, y: 200, carrier: false },
      { id: 'C', label: 'C', x: 300, y: 80, carrier: true },
      { id: 'D', label: 'D', x: 300, y: 200, carrier: false },
    ],
    mods: [['B','A'], ['D','C']],
    outputs: ['A', 'C'],
  },
];

// ── Algorithm diagram canvas ──────────────────────────────────────────────────
(function initAlgoCanvas() {
  const canvas = document.getElementById('algo-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const descEl = document.getElementById('algo-desc');
  let currentAlgo = 0;
  const OP_R = 28;

  function drawAlgo(idx) {
    const algo = ALGORITHMS[idx];
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Draw mod arrows
    algo.mods.forEach(([from, to]) => {
      const f = algo.ops.find(o => o.id === from);
      const t = algo.ops.find(o => o.id === to);
      const dx = t.x - f.x, dy = t.y - f.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / len, ny = dy / len;
      const sx = f.x + nx * OP_R;
      const sy = f.y + ny * OP_R;
      const ex = t.x - nx * OP_R;
      const ey = t.y - ny * OP_R;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = 'rgba(224, 112, 32, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead
      const angle = Math.atan2(ey - sy, ex - sx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 10 * Math.cos(angle - 0.4), ey - 10 * Math.sin(angle - 0.4));
      ctx.lineTo(ex - 10 * Math.cos(angle + 0.4), ey - 10 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = 'rgba(224, 112, 32, 0.8)';
      ctx.fill();
    });

    // Output arrows (downward from carriers)
    algo.outputs.forEach(id => {
      const op = algo.ops.find(o => o.id === id);
      ctx.beginPath();
      ctx.moveTo(op.x, op.y + OP_R);
      ctx.lineTo(op.x, op.y + OP_R + 40);
      ctx.strokeStyle = 'rgba(48, 192, 96, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.stroke();

      // Arrowhead down
      ctx.beginPath();
      ctx.moveTo(op.x, op.y + OP_R + 40);
      ctx.lineTo(op.x - 7, op.y + OP_R + 28);
      ctx.lineTo(op.x + 7, op.y + OP_R + 28);
      ctx.closePath();
      ctx.fillStyle = 'rgba(48, 192, 96, 0.8)';
      ctx.fill();
    });

    // Draw operator nodes
    algo.ops.forEach(op => {
      const isCarrier = algo.outputs.includes(op.id);

      // Glow
      const grd = ctx.createRadialGradient(op.x, op.y, 0, op.x, op.y, OP_R * 2);
      grd.addColorStop(0, isCarrier ? 'rgba(48,192,96,0.15)' : 'rgba(224,112,32,0.12)');
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(op.x, op.y, OP_R * 2, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(op.x, op.y, OP_R, 0, Math.PI * 2);
      ctx.fillStyle = isCarrier ? 'rgba(48,192,96,0.15)' : 'rgba(224,112,32,0.12)';
      ctx.fill();
      ctx.strokeStyle = isCarrier ? 'rgba(48,192,96,0.8)' : 'rgba(224,112,32,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.fillStyle = isCarrier ? '#30c060' : '#e07020';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.id, op.x, op.y);
    });

    // Legend
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(48,192,96,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('● Carrier', 12, H - 28);
    ctx.fillStyle = 'rgba(224,112,32,0.7)';
    ctx.fillText('● Modulator', 100, H - 28);
  }

  function updateDesc(idx) {
    const a = ALGORITHMS[idx];
    descEl.innerHTML = `
      <h4>${a.name}</h4>
      <p>${a.desc}</p>
      <div>${a.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
    `;
  }

  drawAlgo(0);
  updateDesc(0);

  document.querySelectorAll('.algo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.algo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentAlgo = parseInt(btn.dataset.algo);
      drawAlgo(currentAlgo);
      updateDesc(currentAlgo);
    });
  });
})();

// ── Waveform canvas — animated FM wave ───────────────────────────────────────
(function initWaveCanvas() {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let t = 0, W, H;

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Multiple FM voices
  const voices = [
    { cFreq: 2.0, mFreq: 3.0, mDepth: 2.5, color: 'rgba(224,112,32,0.8)', phase: 0 },
    { cFreq: 1.0, mFreq: 5.0, mDepth: 1.5, color: 'rgba(48,192,96,0.4)', phase: 1.2 },
    { cFreq: 3.0, mFreq: 2.0, mDepth: 3.0, color: 'rgba(32,144,224,0.3)', phase: 2.5 },
  ];

  function draw() {
    ctx.clearRect(0, 0, W, H);

    voices.forEach(v => {
      ctx.beginPath();
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 1.5;
      for (let x = 0; x < W; x++) {
        const n = x / W;
        const mod = Math.sin(t * v.mFreq + n * Math.PI * 8 + v.phase) * v.mDepth;
        const car = Math.sin(t * v.cFreq + n * Math.PI * 4 + mod);
        const y = H / 2 + car * (H * 0.38);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    t += 0.015;
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── LFO mini canvas in bento ─────────────────────────────────────────────────
(function initLfoMini() {
  let t = 0;
  const canvases = document.querySelectorAll('.lfo-mini-canvas');
  canvases.forEach(canvas => {
    const ctx = canvas.getContext('2d');
    function draw() {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(224,112,32,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        const n = x / W;
        const y = H / 2 + Math.sin(n * Math.PI * 4 + t) * (H * 0.4);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      t += 0.02;
      requestAnimationFrame(draw);
    }
    draw();
  });
})();

// ── Mini step grid animation ──────────────────────────────────────────────────
(function initMiniGrid() {
  const grid = document.getElementById('mini-grid-1');
  if (!grid) return;

  const pattern = [1, 0, 1, 1, 0, 1, 0, 1];
  const plocks  = [0, 0, 1, 0, 0, 0, 0, 1];
  let step = 0;

  pattern.forEach((on, i) => {
    const el = document.createElement('div');
    el.className = 'mini-step' + (on ? ' on' : '') + (plocks[i] ? ' plock' : '');
    el.dataset.idx = i;
    grid.appendChild(el);
  });

  setInterval(() => {
    grid.querySelectorAll('.mini-step').forEach((el, i) => {
      el.style.outline = i === step ? '2px solid white' : '';
    });
    step = (step + 1) % pattern.length;
  }, 300);
})();

// ── Algo mini bento vis ───────────────────────────────────────────────────────
(function initAlgoMini() {
  const el = document.getElementById('algo-mini');
  if (!el) return;
  const heights = [50, 30, 45, 20];
  const colors = ['#e07020','#e07020','#e07020','rgba(224,112,32,0.3)'];
  heights.forEach((h, i) => {
    const op = document.createElement('div');
    op.className = 'algo-mini-op';
    op.style.height = h + 'px';
    op.style.background = colors[i];
    op.title = `Op ${String.fromCharCode(65+i)}`;
    el.appendChild(op);
  });
})();

// ── Smooth active section highlighting in nav ────────────────────────────────
const sections = document.querySelectorAll('section[id], footer[id]');
const navLinks = document.querySelectorAll('.nav-links a');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinks.forEach(a => {
        a.style.color = a.getAttribute('href') === '#' + entry.target.id
          ? 'var(--text-hi)' : '';
      });
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => sectionObserver.observe(s));

// Confetti on a canvas and a short fanfare synthesized with Web Audio: no audio files, works offline.

let ctx = null;
const audio = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function note(ac, freq, at, dur, type = 'triangle', gain = 0.18) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** C–E–G–C arpeggio with a sparkle on top. */
export function fanfare() {
  try {
    const ac = audio();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime + 0.02;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(ac, f, t + i * 0.11, 0.35));
    note(ac, 1046.5, t + 0.45, 0.6, 'sine', 0.12);
    note(ac, 1567.98, t + 0.5, 0.5, 'sine', 0.06);
  } catch {
    /* no audio: still celebrate visually */
  }
}

/** Soft «try again» tone. */
export function softTone() {
  try {
    const ac = audio();
    const t = ac.currentTime + 0.02;
    note(ac, 392, t, 0.25, 'sine', 0.1);
    note(ac, 349.23, t + 0.18, 0.35, 'sine', 0.1);
  } catch {
    /* ignore */
  }
}

const COLORS = ['#ffb547', '#59c3c3', '#7f8cff', '#ff7aa8', '#6ccf6c', '#ffe066'];

export function confetti(canvas, ms = 1800) {
  const c = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  const W = canvas.width;
  const H = canvas.height;
  const parts = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.2,
    y: H * 0.45,
    vx: (Math.random() - 0.5) * 16 * dpr,
    vy: (-Math.random() * 18 - 6) * dpr,
    s: (6 + Math.random() * 8) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = now - start;
      c.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.55 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        c.save();
        c.globalAlpha = Math.max(0, 1 - t / ms);
        c.translate(p.x, p.y);
        c.rotate(p.r);
        c.fillStyle = p.color;
        c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        c.restore();
      }
      if (t < ms) requestAnimationFrame(frame);
      else {
        c.clearRect(0, 0, W, H);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

// ═══════════════════════════════════════════════
//  main.js — bootstrap immersive world + scroll journey
// ═══════════════════════════════════════════════
import { createWorld } from './world.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmtUAH = n => new Intl.NumberFormat('uk-UA').format(Math.round(n));

const canvas = $('#world-canvas');
const hideLoader = () => $('#loader')?.classList.add('gone');

let world;
try {
  world = createWorld(canvas, {
    onReady: () => setTimeout(hideLoader, 400),
    onStats: ({ area, logCount, volume, L, W }) => {
      $('#vp-dims').textContent = `${L.toFixed(1)} × ${W.toFixed(1)} м`;
      $('#est-area').textContent = `${area.toFixed(1)} м²`;
      $('#est-logs').textContent = logCount;
      $('#est-vol').textContent = `${volume.toFixed(1)} м³`;
      $('#est-price').textContent = `${fmtUAH(volume * 14500 + area * 5200)} ₴`;
    },
  });
} catch (err) {
  console.error('world init failed:', err);
}
// hard fallback so the loader never gets stuck
setTimeout(hideLoader, 2500);

// ── scroll → camera journey ──
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    world.setScroll(p);
    $('#pr-fill').style.height = `${p * 100}%`;
    // progress dots
    $$('.pr-dot').forEach(d => {
      d.classList.toggle('active', Math.abs(p - +d.dataset.to) < 0.12);
    });
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// progress dots → jump
$$('.pr-dot').forEach(d => {
  d.addEventListener('click', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: +d.dataset.to * max, behavior: 'smooth' });
  });
});

// ── panel reveal on view ──
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => e.target.classList.toggle('in', e.isIntersecting));
}, { threshold: 0.35 });
$$('.panel').forEach(p => io.observe(p));

// ── configurator wiring ──
const sliders = [
  { el: '#in-length',  out: '#out-length',  key: 'length',  fmt: v => `${(+v).toFixed(1)} м` },
  { el: '#in-width',   out: '#out-width',   key: 'width',   fmt: v => `${(+v).toFixed(1)} м` },
  { el: '#in-courses', out: '#out-courses', key: 'courses', fmt: v => `${v}` },
  { el: '#in-roof',    out: '#out-roof',    key: 'roofDeg', fmt: v => `${v}°` },
  { el: '#in-dia',     out: '#out-dia',     key: 'diaCm',   fmt: v => `${v} см` },
];

const cfg = { length: 8, width: 6, courses: 14, roofDeg: 42, diaCm: 26, wood: 'pine', roof: 'gable' };

sliders.forEach(s => {
  const input = $(s.el);
  $(s.out).textContent = s.fmt(input.value);
  input.addEventListener('input', () => {
    $(s.out).textContent = s.fmt(input.value);
    cfg[s.key] = +input.value;
    world.updateConfigCabin({ ...cfg });
  });
});

$$('#wood-swatches .swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#wood-swatches .swatch').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    cfg.wood = btn.dataset.wood;
    world.updateConfigCabin({ ...cfg });
  });
});

$$('#roof-type .seg').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#roof-type .seg').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    cfg.roof = btn.dataset.roof;
    world.updateConfigCabin({ ...cfg });
  });
});

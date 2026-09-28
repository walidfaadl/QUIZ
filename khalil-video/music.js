// Synthesizes the soundtrack (music.wav) for the Hebron News Network promo.
// 110 BPM, maqam Hijaz on D, oriental-cinematic: Karplus-Strong oud + qanun, darbuka (maqsum rhythm),
// riq jingles, taiko hits, string pads, swells and notification chimes. Aligned to index.html's timeline.
//   node music.js
const fs = require('fs');
const path = require('path');

const SR = 44100, BPM = 110, B = 60 / BPM, BAR = 4 * B;
const b = n => n * B;
const T = { hit: b(4), s2: b(8), w2: b(9), w3: b(10.5), tiles: b(12), fb: b(16), ig: b(20), tg: b(24),
  s4: b(28), handles: b(32), s5: b(36), miss: b(41), s6: b(44), end: b(54) };
const CUTS = [T.s2, T.fb, T.ig, T.tg, T.s4, T.s5, T.s6];
const DUR = T.end, N = Math.ceil(SR * DUR);

const L = new Float32Array(N), R = new Float32Array(N);
let seed = 7331;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const at = t => Math.round(t * SR);
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };

// ---- instruments -------------------------------------------------------
function pluck(t0, midi, dur, amp, bright = 0.5, pan = 0, decay = 0.996) {   // Karplus-Strong string
  const f = mtof(midi), n = Math.max(2, Math.round(SR / f)), buf = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) { lp += bright * (noise() - lp); buf[i] = lp; }
  const i0 = at(t0);
  for (let i = 0; i < SR * dur; i++) {
    const k = i % n, y = buf[k];
    buf[k] = decay * 0.5 * (y + buf[(k + 1) % n]);
    const env = Math.min(1, (SR * dur - i) / (SR * 0.03));
    add(i0 + i, y * amp * env, pan);
  }
}
const oud = (t0, m, amp = 0.32, pan = -0.1) => { pluck(t0, m, 0.9, amp, 0.45, pan, 0.994); pluck(t0 + 0.004, m + 12, 0.5, amp * 0.18, 0.3, pan + .2, 0.99); };
const qanun = (t0, m, amp = 0.12, pan = 0.3) => pluck(t0, m, 0.7, amp, 0.8, pan, 0.997);

function doum(t0, amp = 0.55) {
  let ph = 0;
  for (let n = 0; n < SR * 0.35; n++) {
    const t = n / SR; ph += 2 * Math.PI * (72 + 60 * Math.exp(-t * 30)) / SR;
    add(at(t0) + n, (Math.sin(ph) * Math.exp(-t * 9) + noise() * Math.exp(-t * 80) * .2) * amp);
  }
}
function tek(t0, amp = 0.28, pan = 0.15) {
  let lp = 0;
  for (let n = 0; n < SR * 0.12; n++) {
    const t = n / SR, x = noise(); lp += 0.45 * (x - lp);
    add(at(t0) + n, ((x - lp) * Math.exp(-t * 55) + Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 40) * .35) * amp, pan);
  }
}
function riq(t0, amp = 0.06, pan = -0.35) {
  let prev = 0;
  for (let n = 0; n < SR * 0.12; n++) {
    const t = n / SR, x = noise(), hp = x - prev; prev = x;
    const metal = Math.sin(2 * Math.PI * 5400 * t) + Math.sin(2 * Math.PI * 7300 * t) * .6;
    add(at(t0) + n, (hp * .8 + metal * .15) * Math.exp(-t * 30) * amp, pan);
  }
}
function taiko(t0, amp = 0.85) {
  let ph = 0, lp = 0;
  for (let n = 0; n < SR * 1.4; n++) {
    const t = n / SR; ph += 2 * Math.PI * (48 + 55 * Math.exp(-t * 18)) / SR;
    const x = noise(); lp += 0.06 * (x - lp);
    add(at(t0) + n, (Math.tanh(Math.sin(ph) * 1.8) * Math.exp(-t * 3.2) + lp * Math.exp(-t * 9) * 1.6) * amp);
  }
}
function crash(t0, amp = 0.16) {
  let prev = 0;
  for (let n = 0; n < SR * 2.2; n++) {
    const t = n / SR, x = noise(), hp = x - prev; prev = x;
    add(at(t0) + n, hp * Math.exp(-t * 1.8) * amp, Math.sin(t * 9) * .3);
  }
}
function strings(t0, len, notes, amp = 0.035, attack = 0.5) {
  const st = notes.map(m => ({f: mtof(m), lpL: 0, lpR: 0}));
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, env = Math.min(1, t / attack) * Math.min(1, (len - t) / 0.5);
    let l = 0, r = 0;
    for (const s of st) {
      const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 5.2 * t);
      const xl = 2 * ((s.f * 0.997 * vib * t) % 1) - 1, xr = 2 * ((s.f * 1.003 * vib * t) % 1) - 1;
      s.lpL += 0.05 * (xl - s.lpL); s.lpR += 0.05 * (xr - s.lpR); l += s.lpL; r += s.lpR;
    }
    const i = at(t0) + n; if (i < N) { L[i] += l * env * amp; R[i] += r * env * amp; }
  }
}
function swell(t0, t1, amp = 0.25) {   // reverse-cymbal style build
  let prev = 0, lp = 0;
  for (let n = 0; n < SR * (t1 - t0); n++) {
    const k = n / (SR * (t1 - t0)), x = noise(), hp = x - prev; prev = x; lp += (0.05 + .6 * k) * (hp - lp);
    add(at(t0) + n, lp * Math.pow(k, 2.5) * amp, Math.sin(k * 20) * .3);
  }
}
function whoosh(tc, amp = 0.25) {
  let lp = 0; const len = 0.5;
  for (let n = 0; n < SR * len; n++) {
    const k = n / (SR * len), x = noise(); lp += (0.03 + 0.3 * Math.sin(Math.PI * k)) * (x - lp);
    add(at(tc - .3) + n, lp * Math.pow(Math.sin(Math.PI * k), 2) * amp, (k - .5) * 1.4);
  }
}
function chime(t0, midi, amp = 0.12) {
  const f = mtof(midi);
  for (let n = 0; n < SR * 0.8; n++) {
    const t = n / SR;
    add(at(t0) + n, (Math.sin(2 * Math.PI * f * t) + .4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 8)) * Math.exp(-t * 5) * amp, 0.25);
  }
}

// ---- arrangement -------------------------------------------------------
// Hijaz on D: D Eb F# G A Bb C. Bars: D - Cm - Gm - D
const CH = [[50, 54, 57], [48, 51, 55], [43, 46, 50], [50, 54, 57]];
const ROOT = [38, 36, 31, 38];
const RIFF = [[62, 63, 66, 67, 69, 67, 66, 63], [60, 63, 67, 63, 60, 58, 60, 63], [67, 70, 74, 70, 67, 66, 67, 70], [69, 67, 66, 63, 62, 63, 66, 62]];
const bar = t => Math.floor(t / BAR + 1e-6) % 4;

// intro: drone + qanun shimmer, swell into the logo hit
strings(0, T.hit + 0.3, [38, 45, 50], 0.035, 1.5);
const QRUN = [62, 63, 66, 67, 69, 70, 72, 74, 75, 78, 79, 81];
for (let i = 0; i < 24; i++) qanun(b(0.5) + i * (T.hit - b(0.6)) / 24, QRUN[i % 12] + (i >= 12 ? 12 : 0), 0.05 + i * 0.004, i % 2 ? 0.35 : -0.2);
swell(b(1.5), T.hit, 0.3);
taiko(T.hit, 1.0); crash(T.hit, 0.18);
strings(T.hit, BAR, [50, 54, 57, 62], 0.04, 0.05);

// oud introduces the riff alone, riq joins
for (let i = 0; i < 8; i++) oud(T.hit + i * B / 2, RIFF[0][i] - 12, 0.3);
for (let t = T.hit + b(2); t < T.s2; t += B / 4) riq(t, 0.035);
tek(b(7.5)); tek(b(7.75)); doum(b(7.5), 0.4);

// main groove
const GEND = b(52);
for (let t = T.s2; t < GEND - 1e-6; t += B / 2) {
  const slot = Math.round((t - T.s2) / (B / 2)) % 8, br = bar(t);
  // maqsum: D T - T D - T -
  if (slot === 0 || slot === 4) doum(t);
  if (slot === 1 || slot === 3 || slot === 6) tek(t);
  if (slot === 7 || slot === 2) tek(t + B / 4, 0.12, -0.2);           // ka ghost notes
  riq(t, 0.05); riq(t + B / 4, 0.03, 0.35);
  if (slot === 0) taiko(t, 0.55);
  if (slot === 0 || slot === 3 || slot === 4) pluck(t, ROOT[br], 0.5, 0.42, 0.25, 0, 0.993);    // plucked bass
  oud(t, RIFF[br][slot] - 12, 0.26);
  // qanun answers in the platform + orbit sections
  if (t >= T.fb && t < T.s5 && slot % 2 === 1) qanun(t + B / 4, RIFF[br][(slot + 3) % 8] + 12, 0.07);
}
for (let t = T.s2; t < GEND - 1e-6; t += BAR) strings(t, BAR + 0.05, CH[bar(t)].map(m => m + 12), 0.025, 0.2);

// hits and transitions
CUTS.forEach(t => { whoosh(t); taiko(t, 0.6); });
[T.w2, T.tiles, T.s4, T.s6].forEach(t => crash(t, 0.12));
swell(b(14), T.fb, 0.2); swell(b(26), T.s4, 0.22); swell(b(42), T.s6, 0.25);
[0, 1, 2, 3].forEach(i => chime(T.tiles + b(.25) + i * B * .75, [74, 78, 81, 86][i], 0.09));
for (let i = 0; i < 7; i++) chime(T.s5 + b(1) + i * B * .6, [74, 75, 78, 79, 81, 82, 86][i], 0.1);   // notifications
chime(T.miss, 86, 0.14); chime(T.miss + B / 2, 90, 0.1);

// outro: final hit and a long Hijaz chord with a last oud phrase
taiko(GEND, 1.0); crash(GEND, 0.2);
strings(GEND, T.end - GEND, [38, 50, 54, 57, 62], 0.04, 0.05);
[62, 63, 66, 62].forEach((m, i) => oud(GEND + b(.5) + i * B / 2, m, 0.22));

// ---- master ------------------------------------------------------------
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (DUR - i / SR) / 1.0);
  L[i] = Math.tanh(L[i] * 1.15) * fade; R[i] = Math.tanh(R[i] * 1.15) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const g = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4);
}
fs.writeFileSync(path.join(__dirname, 'music.wav'), buf);
console.log('wrote music.wav');

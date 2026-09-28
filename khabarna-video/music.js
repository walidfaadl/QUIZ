// Synthesizes the soundtrack (music.wav) for the Khabarna Palestine promo.
// 124 BPM, B minor, "newsroom" feel: typewriter keys as percussion, carriage-return bell on cuts,
// marimba ostinato, finger snaps, bouncy plucked bass and a short brass-like news sting.
//   node music.js
const fs = require('fs');
const path = require('path');

const SR = 44100, BPM = 124, B = 60 / BPM, BAR = 4 * B;
const b = n => n * B;
const T = { logoText: b(4), s2: b(8), w: [8, 9, 10, 11].map(b), phrase: b(12), s3: b(18), s3b: b(24), s4: b(26),
  secDur: b(2), grid: b(50), s5: b(53), switches: [55, 57, 58, 59, 59.5, 60, 60.5, 61].map(b), dark: b(61.5),
  both: b(62), s6: b(64), end: b(70) };
const CUTS = [T.s2, T.s3, T.s3b, T.s4, T.grid, T.s5, T.s6];
const DUR = T.end, N = Math.ceil(SR * DUR);

const L = new Float32Array(N), R = new Float32Array(N);
let seed = 424242;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const rnd = () => (noise() + 1) / 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const at = t => Math.round(t * SR);
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };

// ---- instruments -------------------------------------------------------
function key(t0, amp = 0.16, pan = 0) {          // typewriter key: sharp click + short resonant clack
  const f = 1800 + rnd() * 900; let prev = 0;
  for (let n = 0; n < SR * 0.07; n++) {
    const t = n / SR, x = noise(), hp = x - prev; prev = x;
    const click = hp * Math.exp(-t * 400);
    const clack = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 90) * 0.5 + x * Math.exp(-t * 120) * 0.3;
    const thud = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 60) * 0.4;
    add(at(t0) + n, (click + clack + thud) * amp, pan);
  }
}
function bell(t0, amp = 0.2) {                    // carriage-return "ding"
  for (let n = 0; n < SR * 1.4; n++) {
    const t = n / SR;
    const v = Math.sin(2 * Math.PI * 2093 * t) * Math.exp(-t * 3) + 0.5 * Math.sin(2 * Math.PI * 5230 * t) * Math.exp(-t * 6)
            + 0.3 * Math.sin(2 * Math.PI * 3140 * t) * Math.exp(-t * 4.5);
    add(at(t0) + n, v * amp * Math.min(1, t / 0.001), 0.2);
  }
}
function ratchet(t0, len = 0.25, amp = 0.12) {    // carriage-return slide
  for (let i = 0; i < 9; i++) key(t0 + i * len / 9, amp * (0.5 + i / 18), -0.3 + i * 0.07);
}
function kick(t0, amp = 0.8) {
  let ph = 0;
  for (let n = 0; n < SR * 0.35; n++) {
    const t = n / SR; ph += 2 * Math.PI * (50 + 90 * Math.exp(-t * 35)) / SR;
    add(at(t0) + n, Math.sin(ph) * Math.exp(-t * 9) * amp);
  }
}
function snap(t0, amp = 0.3) {                    // finger snap / tight clap
  let lp = 0;
  for (let n = 0; n < SR * 0.12; n++) {
    const t = n / SR, x = noise(); lp += 0.6 * (x - lp);
    const env = Math.exp(-t * 45) + (t > 0.008 && t < 0.013 ? 0.5 : 0);
    add(at(t0) + n, (x - lp * .3) * env * amp + Math.sin(2 * Math.PI * 1600 * t) * Math.exp(-t * 80) * amp * .4, -0.1);
  }
}
function shaker(t0, amp = 0.05, pan = 0.35) {
  let prev = 0;
  for (let n = 0; n < SR * 0.06; n++) {
    const t = n / SR, x = noise(), hp = x - prev; prev = x;
    add(at(t0) + n, hp * Math.sin(Math.PI * t / 0.06) * amp, pan);
  }
}
function marimba(t0, midi, amp = 0.13, pan = 0) {
  const f = mtof(midi);
  for (let n = 0; n < SR * 0.6; n++) {
    const t = n / SR;
    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) + 0.35 * Math.sin(2 * Math.PI * f * 3.93 * t) * Math.exp(-t * 30)
            + 0.15 * Math.sin(2 * Math.PI * f * 9.2 * t) * Math.exp(-t * 60);
    add(at(t0) + n, v * amp * Math.min(1, t / 0.0015), pan);
  }
}
function pbass(t0, midi, len, amp = 0.34) {       // plucked, round bass
  const f = mtof(midi); let lp = 0;
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, ph = (f * t) % 1;
    const x = (ph < .5 ? 1 : -1) * 0.5 + Math.sin(2 * Math.PI * f * t);
    lp += (0.03 + 0.25 * Math.exp(-t * 25)) * (x - lp);
    add(at(t0) + n, lp * Math.exp(-t * 4) * Math.min(1, (len - t) / 0.02) * amp);
  }
}
function brass(t0, midi, len, amp = 0.08) {       // soft brass-ish sting (filtered saws with swell)
  const f = mtof(midi); let lp1 = 0, lp2 = 0;
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR;
    const x = (2 * ((f * t) % 1) - 1) + (2 * ((f * 1.006 * t) % 1) - 1);
    const env = Math.min(1, t / 0.03) * Math.min(1, (len - t) / 0.08);
    const cut = 0.03 + 0.12 * Math.min(1, t / 0.08);
    lp1 += cut * (x - lp1); lp2 += cut * (lp1 - lp2);
    add(at(t0) + n, lp2 * env * amp, (midi % 3 - 1) * 0.2);
  }
}
function pad(t0, len, notes, amp = 0.025) {
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, env = Math.min(1, t / 0.4) * Math.min(1, (len - t) / 0.4);
    let v = 0; notes.forEach((m, k) => { const f = mtof(m); v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t + k); });
    add(at(t0) + n, v * env * amp, Math.sin(t * 1.7) * 0.3);
  }
}
function swell(t0, t1, amp = 0.2) {
  let lp = 0;
  for (let n = 0; n < SR * (t1 - t0); n++) {
    const k = n / (SR * (t1 - t0)), x = noise(); lp += (0.02 + 0.4 * k * k) * (x - lp);
    add(at(t0) + n, lp * k * k * amp, Math.sin(k * 25) * 0.3);
  }
}
function thump(t0, amp = 0.6) {
  let ph = 0;
  for (let n = 0; n < SR * 0.9; n++) {
    const t = n / SR; ph += 2 * Math.PI * (40 + 50 * Math.exp(-t * 14)) / SR;
    add(at(t0) + n, Math.sin(ph) * Math.exp(-t * 4) * amp);
  }
}

// ---- arrangement -------------------------------------------------------
// B minor: Bm - G - D - A (one chord per bar)
const CH = [[59, 62, 66], [55, 59, 62], [62, 66, 69], [57, 61, 64]];
const ROOT = [35, 31, 38, 33];
const chord = t => Math.floor(t / BAR + 1e-6) % 4;

// intro: someone typing the name, bell + sting when the logo text lands
const typing = [0.05, 0.3, 0.45, 0.62, 0.9, 1.02, 1.2, 1.45, 1.53, 1.7, 1.9, 2.0, 2.15, 2.4, 2.48, 2.62, 2.8, 2.9, 3.05];
typing.forEach((t, i) => key(t * B * 1.25, 0.15, ((i * 7) % 5 - 2) * 0.12));
pad(0, T.logoText + 0.4, [47, 54, 59], 0.03);
ratchet(T.logoText - 0.3);
bell(T.logoText, 0.24); thump(T.logoText, 0.7);
[[71, 0], [78, .5], [74, 1], [83, 1.5]].forEach(([m, d]) => brass(T.logoText + b(d), m, b(.45), 0.07));
[47, 54].forEach(m => brass(T.logoText + b(2), m + 12, b(1.8), 0.05));

// main groove
const END = T.s6 + b(4);
const MAR = [0, 2, 1, 2, 0, 1, 2, 1];   // marimba pattern over the chord tones (8ths)
for (let t = T.s2; t < END - 1e-6; t += B / 4) {
  const step = Math.round((t - T.s2) / (B / 4)) % 16, ch = chord(t);
  const calm = t >= b(22) && t < T.s3b;          // short lift before the sections title
  if (step % 4 === 0 && !calm) kick(t, step === 0 ? 0.85 : 0.6);
  if (step === 4 || step === 12) snap(t);
  if (step % 2 === 1) shaker(t, 0.05);
  // typewriter keys on a syncopated 16th pattern
  if ([2, 3, 7, 10, 13, 15].includes(step)) key(t, 0.1, ((step * 5) % 7 - 3) * 0.1);
  // bass: 1, "and" of 2, 4
  if ([0, 6, 12].includes(step) && !calm) pbass(t, ROOT[ch] + (step === 6 ? 12 : 0), B * 0.9);
  // marimba 8ths
  if (step % 2 === 0) marimba(t, CH[ch][MAR[(step / 2) % 8]] + 12, 0.11, step % 4 ? 0.3 : -0.3);
  // extra top line during the sections run
  if (t >= T.s4 && t < T.s5 && step % 4 === 2) marimba(t, CH[ch][2] + 24, 0.06, 0.4);
}
for (let bar = 0; bar * BAR < END - T.s2; bar++) pad(T.s2 + bar * BAR, BAR, CH[chord(T.s2 + bar * BAR)].map(m => m - 12), 0.02);

// hits
T.w.forEach((t, i) => { thump(t, 0.4); key(t, 0.25); });
[T.s3, T.s4, T.s5, T.s6].forEach(t => thump(t, 0.6));
CUTS.forEach(t => { bell(t, 0.13); ratchet(t - 0.25, 0.22, 0.08); });
swell(b(22), T.s3b, 0.22); swell(b(61), T.s6, 0.2);
for (let i = 1; i < 12; i++) key(T.s4 + i * T.secDur, 0.22);           // each new section = a keystroke
T.switches.forEach(t => key(t, 0.2)); bell(T.dark, 0.1);

// outro sting
[[71, 0], [78, .5], [74, 1], [83, 1.5]].forEach(([m, d]) => brass(T.s6 + b(d), m, b(.45), 0.07));
pad(END - 0.2, T.end - END + 0.2, [47, 54, 59, 62], 0.03);
bell(END, 0.18);

// ---- master ------------------------------------------------------------
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (DUR - i / SR) / 0.8);
  L[i] = Math.tanh(L[i] * 1.2) * fade; R[i] = Math.tanh(R[i] * 1.2) * fade;
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

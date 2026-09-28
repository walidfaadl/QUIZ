// Synthesizes the soundtrack (music.wav): 120 BPM, hits aligned to the video timeline in index.html.
//   node music.js
const fs = require('fs');
const path = require('path');

const SR = 44100, DUR = 32, N = SR * DUR, BEAT = 0.5;
const T = { logoHit: 2.0, s2: 3.5, s3: 8.0, s4: 9.5, grid: 21.5, s5: 23.0, s6: 28.5,
  switches: [24.0, 25.0, 25.5, 26.0, 26.5, 26.75, 27.0, 27.25] };
const WIPES = [T.s2, T.s3, T.s4, T.grid, T.s5, T.s6];

const L = new Float32Array(N), R = new Float32Array(N);
let seed = 1234567;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan) ; R[i] += v * (1 + pan); } };

// ---- instruments -------------------------------------------------------
function kick(t0, amp = 0.9) {
  let ph = 0;
  for (let n = 0; n < SR * 0.4; n++) {
    const t = n / SR, f = 48 + 110 * Math.exp(-t * 32);
    ph += 2 * Math.PI * f / SR;
    add(Math.round(t0 * SR) + n, Math.sin(ph) * Math.exp(-t * 7) * amp);
  }
}
function clap(t0, amp = 0.35) {
  let lp = 0, prev = 0;
  for (let n = 0; n < SR * 0.25; n++) {
    const t = n / SR, x = noise();
    lp += 0.35 * (x - lp);
    const hp = x - lp; // crude band
    const env = Math.exp(-t * 16) * (t < 0.01 ? 0.6 : 1) + (t > 0.012 && t < 0.02 ? 0.4 : 0);
    const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.5;
    add(Math.round(t0 * SR) + n, (hp * env + body) * amp);
    prev = x;
  }
}
function hat(t0, amp = 0.12, len = 0.05, pan = 0.2) {
  let prev = 0;
  for (let n = 0; n < SR * len * 3; n++) {
    const t = n / SR, x = noise(), hp = x - prev; prev = x;
    add(Math.round(t0 * SR) + n, hp * Math.exp(-t / len * 4) * amp, pan);
  }
}
function bass(t0, midi, len, amp = 0.32) {
  const f = mtof(midi); let lp = 0;
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, ph = (f * t) % 1;
    const saw = 2 * ph - 1, sq = ph < .5 ? 1 : -1;
    const x = saw * .6 + sq * .3 + Math.sin(2 * Math.PI * f * t) * .8;
    const cut = 0.04 + 0.2 * Math.exp(-t * 18);
    lp += cut * (x - lp);
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 5) * (t > len - 0.02 ? (len - t) / 0.02 : 1);
    add(Math.round(t0 * SR) + n, lp * env * amp);
  }
}
function pluck(t0, midi, amp = 0.08, pan = 0) {
  const f = mtof(midi); let lp = 0;
  for (let n = 0; n < SR * 0.3; n++) {
    const t = n / SR, ph = (f * t) % 1;
    const x = (ph < .5 ? 1 : -1) * .7 + Math.sin(2 * Math.PI * f * 2 * t) * .3;
    lp += (0.08 + 0.5 * Math.exp(-t * 25)) * (x - lp);
    add(Math.round(t0 * SR) + n, lp * Math.exp(-t * 14) * amp, pan);
  }
}
function pad(t0, notes, len, amp = 0.05) {
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR;
    let v = 0;
    notes.forEach((m, k) => {
      const f = mtof(m);
      v += Math.sin(2 * Math.PI * f * t) + .5 * Math.sin(2 * Math.PI * f * 1.003 * t + k) + .25 * Math.sin(2 * Math.PI * f * 2 * t);
    });
    const env = Math.min(1, t / 0.3) * Math.min(1, (len - t) / 0.3);
    add(Math.round(t0 * SR) + n, v * env * amp, Math.sin(t * 2) * .2);
  }
}
function riser(t0, t1, amp = 0.25) {
  let lp = 0;
  for (let n = 0; n < SR * (t1 - t0); n++) {
    const k = n / (SR * (t1 - t0)), x = noise();
    lp += (0.02 + 0.5 * k * k) * (x - lp);
    const tone = Math.sin(2 * Math.PI * (200 + 1400 * k * k) * n / SR) * 0.2;
    add(Math.round(t0 * SR) + n, (lp + tone * k) * k * k * amp, Math.sin(k * 20) * .3);
  }
}
function impact(t0, amp = 0.8) {
  let ph = 0, lp = 0;
  for (let n = 0; n < SR * 1.6; n++) {
    const t = n / SR, f = 38 + 60 * Math.exp(-t * 10);
    ph += 2 * Math.PI * f / SR;
    const x = noise(); lp += 0.08 * (x - lp);
    add(Math.round(t0 * SR) + n, (Math.sin(ph) * Math.exp(-t * 2.5) + lp * Math.exp(-t * 6) * 1.5) * amp);
  }
}
function whoosh(tc, amp = 0.35) {
  let lp = 0; const len = 0.5;
  for (let n = 0; n < SR * len; n++) {
    const k = n / (SR * len), x = noise();
    const cut = 0.03 + 0.35 * Math.sin(Math.PI * k);
    lp += cut * (x - lp);
    add(Math.round((tc - .25) * SR) + n, lp * Math.pow(Math.sin(Math.PI * k), 2) * amp, (k - .5) * 1.6);
  }
}
function blip(t0, f = 1400, amp = 0.14) {
  for (let n = 0; n < SR * 0.08; n++) {
    const t = n / SR;
    add(Math.round(t0 * SR) + n, Math.sin(2 * Math.PI * (f + 900 * t / 0.08) * t) * Math.exp(-t * 45) * amp);
  }
}

// ---- arrangement -------------------------------------------------------
// A minor: Am - F - C - G, one chord per bar (2s)
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const ROOTS = [33, 29, 36, 31];
const chordAt = t => Math.floor(t / 2) % 4;

pad(0, CHORDS[0], 2.0, 0.035);
for (let bar = 1; bar < 16; bar++) pad(bar * 2, CHORDS[chordAt(bar * 2)], 2.0, bar >= 15 ? 0.05 : 0.03);
riser(0.4, T.logoHit, 0.3);
impact(T.logoHit, 0.9);

const DRUM_END = 30.0;
for (let t = T.logoHit; t < DRUM_END - 1e-6; t += BEAT) {
  const breakdown = t >= 7.5 && t < T.s3;          // short break before the sections title
  if (!breakdown) kick(t);
  const beatInBar = Math.round((t / BEAT)) % 4;
  if ((beatInBar === 1 || beatInBar === 3) && t >= 3.5) clap(t);
  hat(t + BEAT / 2, 0.14);
  if (t >= T.s4 && t < T.s5) { hat(t + BEAT / 4, 0.06, 0.03, -0.3); hat(t + 3 * BEAT / 4, 0.06, 0.03, -0.3); }
  // offbeat pumping bass
  if (t >= T.s2 && !breakdown) bass(t + BEAT / 2, ROOTS[chordAt(t)], BEAT / 2 - 0.01);
}
// arpeggio during the sections run
for (let t = T.s4; t < T.s5; t += BEAT / 4) {
  const ch = CHORDS[chordAt(t)], step = Math.round((t - T.s4) / (BEAT / 4));
  const seq = [0, 1, 2, 1, 0, 2, 1, 2];
  pluck(t, ch[seq[step % 8]] + 12, 0.06, step % 2 ? .3 : -.3);
}
riser(7.0, T.s3, 0.25);
riser(8.5, T.s4, 0.3);
riser(27.6, T.s6, 0.28);
[T.s3, T.s4, T.s5, T.s6].forEach(t => impact(t, 0.7));
WIPES.forEach(t => whoosh(t));
for (let i = 1; i < 12; i++) blip(T.s4 + i, 1500);
T.switches.forEach(t => blip(t, 2200, 0.12));
[3.5, 4.0, 4.5, 5.0].forEach(t => impact(t, 0.35));  // word slams

// ---- master ------------------------------------------------------------
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (DUR - i / SR) / 1.2);
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

// Synthesizes the soundtrack (music.wav) for the Nabd Palestine 24 promo.
// 128 BPM, E minor, "urgent news" feel: heartbeat + monitor beep intro, broken-beat drums,
// ticking 16th hats, sub bass and minor synth stabs. Hits align with the timeline in index.html.
//   node music.js
const fs = require('fs');
const path = require('path');

const SR = 44100, BPM = 128, B = 60 / BPM, BAR = 4 * B;
const DUR = 68 * B, N = Math.ceil(SR * DUR);
const b = n => n * B;
const T = { logoHit: b(4), s2: b(8), w: [8, 9, 10, 11].map(b), phrase: b(12), s3: b(18), s4: b(21), secDur: b(2),
  grid: b(45), s5: b(48), switches: [50, 52, 53, 54, 55, 55.5, 56, 56.5].map(b), both: b(57), s6: b(60), end: b(68) };
const WIPES = [T.s2, T.s3, T.s4, T.grid, T.s5, T.s6];

const L = new Float32Array(N), R = new Float32Array(N);
let seed = 987654321;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };
const at = t => Math.round(t * SR);

// ---- instruments -------------------------------------------------------
function heart(t0, amp = 0.9) {            // "lub-dub"
  for (const [dt, a, f] of [[0, 1, 62], [0.17, 0.7, 70]]) {
    let ph = 0;
    for (let n = 0; n < SR * 0.25; n++) {
      const t = n / SR; ph += 2 * Math.PI * (f + 40 * Math.exp(-t * 40)) / SR;
      add(at(t0 + dt) + n, Math.sin(ph) * Math.exp(-t * 14) * Math.min(1, t / 0.004) * a * amp);
    }
  }
}
function beep(t0, f = 1046.5, len = 0.12, amp = 0.16) {   // heart-monitor beep
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, env = Math.min(1, t / 0.003) * Math.min(1, (len - t) / 0.01);
    add(at(t0) + n, (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t)) * env * amp, 0.15);
  }
}
function kick(t0, amp = 0.95) {
  let ph = 0;
  for (let n = 0; n < SR * 0.45; n++) {
    const t = n / SR, f = 44 + 140 * Math.exp(-t * 38);
    ph += 2 * Math.PI * f / SR;
    const click = n < 60 ? noise() * 0.3 * (1 - n / 60) : 0;
    add(at(t0) + n, (Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t * 6) + click) * amp);
  }
}
function snare(t0, amp = 0.42) {
  let lp = 0;
  for (let n = 0; n < SR * 0.3; n++) {
    const t = n / SR, x = noise(); lp += 0.5 * (x - lp);
    const body = Math.sin(2 * Math.PI * (220 - 60 * t) * t) * Math.exp(-t * 28);
    add(at(t0) + n, ((x - lp * 0.6) * Math.exp(-t * 13) * 0.8 + body * 0.6) * amp);
  }
}
function tick(t0, amp = 0.1, pan = 0.25, len = 0.025) {  // clock-like hat
  let prev = 0;
  for (let n = 0; n < SR * len * 3; n++) {
    const t = n / SR, x = noise(), hp = x - prev; prev = x;
    add(at(t0) + n, (hp * 0.8 + Math.sin(2 * Math.PI * 5200 * t) * 0.3) * Math.exp(-t / len * 4) * amp, pan);
  }
}
function sub(t0, midi, len, amp = 0.42) {
  const f = mtof(midi);
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, env = Math.min(1, t / 0.005) * Math.min(1, (len - t) / 0.02) * (0.7 + 0.3 * Math.exp(-t * 6));
    const x = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t);
    add(at(t0) + n, Math.tanh(x * 1.4) * env * amp);
  }
}
function stab(t0, notes, len = 0.16, amp = 0.07) {  // detuned saw chord through a closing filter
  let lpL = 0, lpR = 0;
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR; let l = 0, r = 0;
    notes.forEach(m => { const f = mtof(m);
      l += 2 * ((f * 0.996 * t) % 1) - 1; r += 2 * ((f * 1.004 * t) % 1) - 1; });
    const cut = 0.03 + 0.4 * Math.exp(-t * 22);
    lpL += cut * (l - lpL); lpR += cut * (r - lpR);
    const env = Math.min(1, t / 0.003) * Math.exp(-t * 9);
    const i = at(t0) + n;
    if (i < N) { L[i] += lpL * env * amp; R[i] += lpR * env * amp; }
  }
}
function arp(t0, midi, amp = 0.055, pan = 0) {
  const f = mtof(midi); let lp = 0;
  for (let n = 0; n < SR * 0.18; n++) {
    const t = n / SR, x = Math.sin(2 * Math.PI * f * t + 2.5 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 20));
    lp += 0.5 * (x - lp);
    add(at(t0) + n, lp * Math.exp(-t * 18) * amp, pan);
  }
}
function drone(t0, len, notes, amp = 0.03) {
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, env = Math.min(1, t / 0.6) * Math.min(1, (len - t) / 0.6);
    let v = 0; notes.forEach((m, k) => { const f = mtof(m); v += Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 1.005 * t + k); });
    add(at(t0) + n, v * env * amp, Math.sin(t * 1.3) * 0.25);
  }
}
function riser(t0, t1, amp = 0.26) {
  let lp = 0;
  for (let n = 0; n < SR * (t1 - t0); n++) {
    const k = n / (SR * (t1 - t0)), x = noise(); lp += (0.02 + 0.55 * k * k) * (x - lp);
    add(at(t0) + n, (lp + Math.sin(2 * Math.PI * (300 + 2000 * k * k) * n / SR) * 0.15 * k) * k * k * amp, Math.sin(k * 30) * 0.3);
  }
}
function impact(t0, amp = 0.8) {
  let ph = 0, lp = 0;
  for (let n = 0; n < SR * 1.5; n++) {
    const t = n / SR, f = 34 + 70 * Math.exp(-t * 12); ph += 2 * Math.PI * f / SR;
    const x = noise(); lp += 0.12 * (x - lp);
    add(at(t0) + n, (Math.sin(ph) * Math.exp(-t * 2.8) + lp * Math.exp(-t * 7) * 1.4) * amp);
  }
}
function swish(tc, amp = 0.3) {  // short filtered-noise swipe for the slice wipes
  let lp = 0; const len = 0.4;
  for (let n = 0; n < SR * len; n++) {
    const k = n / (SR * len), x = noise(); lp += (0.05 + 0.5 * k) * (x - lp);
    add(at(tc - 0.3) + n, (x - lp) * Math.pow(Math.sin(Math.PI * k), 3) * amp, (0.5 - k) * 1.6);
  }
}

// ---- arrangement -------------------------------------------------------
// E minor: Em - C - Am - B  (one chord per bar)
const CH = [[64, 67, 71], [60, 64, 67], [57, 60, 64], [59, 63, 66]];
const ROOT = [28, 24, 33, 35];
const chord = t => Math.floor(t / BAR + 1e-6) % 4;

// intro: heartbeat + monitor beep, accelerating into the logo hit
drone(0, T.logoHit + 0.5, [40, 47], 0.035);
for (let i = 0; i < 4; i++) { heart(b(i)); beep(b(i) + 0.02); }
riser(b(1.5), T.logoHit, 0.3);
impact(T.logoHit, 1.0);
stab(T.logoHit, CH[0].map(m => m + 12), 0.5, 0.09);

// groove
const GROOVE_END = T.s6 + b(4);
const breakdown = t => t >= b(16) && t < T.s3;   // heartbeat break before the sections title
for (let t = T.logoHit; t < GROOVE_END - 1e-6; t += B / 4) {
  const step = Math.round((t - T.logoHit) / (B / 4)) % 16;   // 16 steps per bar
  if (breakdown(t)) { if (step % 4 === 0) { heart(t, 0.8); beep(t + 0.02, 1318.5, 0.08, 0.1); } continue; }
  const ch = chord(t);
  if ([0, 6, 10].includes(step)) { kick(t); sub(t, ROOT[ch], step === 6 ? B * 0.95 : B * 1.45); }
  if (step === 4 || step === 12) snare(t);
  tick(t, step % 4 === 2 ? 0.13 : 0.06, step % 2 ? -0.3 : 0.3);
  if (t >= T.s2 && [3, 11].includes(step)) stab(t, CH[ch]);
  if (t >= T.s4 && t < T.s5) arp(t, CH[ch][[0, 2, 1, 2][step % 4]] + 12 + (step >= 8 ? 12 : 0), 0.05, step % 2 ? 0.35 : -0.35);
}
// word slams
T.w.forEach((t, i) => { impact(t, 0.4); beep(t, [880, 1046.5, 1318.5, 1568][i], 0.09, 0.12); });
riser(b(15), T.s3, 0.25);
riser(b(19.5), T.s4, 0.3);
riser(b(58), T.s6, 0.28);
[T.s3, T.s4, T.s5, T.s6].forEach(t => impact(t, 0.75));
WIPES.forEach(t => swish(t));
for (let i = 1; i < 12; i++) beep(T.s4 + i * T.secDur, 1568, 0.05, 0.09);
T.switches.forEach(t => beep(t, 2093, 0.04, 0.1));

// outro: groove stops, heartbeat and final chord ring out
drone(GROOVE_END - 0.2, T.end - GROOVE_END + 0.2, [40, 47, 52, 55], 0.03);
heart(GROOVE_END); beep(GROOVE_END + 0.02);
heart(GROOVE_END + B * 2, 0.6); beep(GROOVE_END + B * 2 + 0.02, 1046.5, 0.3, 0.12);

// ---- master ------------------------------------------------------------
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (DUR - i / SR) / 0.9);
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

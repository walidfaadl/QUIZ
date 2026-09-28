// Synthesizes the soundtrack (music.wav) for the Nablus News promo.
// Modern trap, 140 BPM (half-time feel), F minor with a harmonic-minor lead: gliding 808s,
// hi-hat rolls, snappy claps, a plucky delayed lead, UI ticks for the counters and stripe whooshes.
//   node music.js
const fs = require('fs');
const path = require('path');

const SR = 44100, BPM = 140, B = 60 / BPM, BAR = 4 * B;
const b = n => n * B;
const T = { name: b(4), s2: b(8), w2: b(9), w3: b(10.5), cov: b(14), chips: [15, 16, 17].map(b), honest: b(18.5),
  s3: b(22), fb: b(32), tg: b(38), ig: b(44), s5: b(50), s6: b(58), end: b(70) };
const CUTS = [T.s2, T.s3, T.fb, T.tg, T.ig, T.s5, T.s6];
const DUR = T.end, N = Math.ceil(SR * DUR);

const L = new Float32Array(N), R = new Float32Array(N);
let seed = 140140;
const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const at = t => Math.round(t * SR);
const add = (i, v, pan = 0) => { if (i >= 0 && i < N) { L[i] += v * (1 - pan); R[i] += v * (1 + pan); } };

// ---- instruments -------------------------------------------------------
function kick(t0, amp = 0.9) {
  let ph = 0;
  for (let n = 0; n < SR * 0.3; n++) {
    const t = n / SR; ph += 2 * Math.PI * (52 + 180 * Math.exp(-t * 45)) / SR;
    add(at(t0) + n, (Math.sin(ph) * Math.exp(-t * 14) + (n < 50 ? noise() * .4 : 0)) * amp);
  }
}
function b808(t0, midi, len, amp = 0.55, glideTo = null) {   // long 808 with optional pitch glide, saturated
  let ph = 0; const f0 = mtof(midi), f1 = glideTo ? mtof(glideTo) : f0;
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, g = glideTo ? clamp01((t - len * .55) / (len * .25)) : 0;
    const f = (f0 + (f1 - f0) * g) * (1 + 1.2 * Math.exp(-t * 40));
    ph += 2 * Math.PI * f / SR;
    const env = Math.min(1, t / .004) * Math.exp(-t * 1.1) * Math.min(1, (len - t) / .03);
    add(at(t0) + n, Math.tanh(Math.sin(ph) * 2.2) * env * amp);
  }
}
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clap(t0, amp = 0.42) {
  let lp = 0;
  for (let n = 0; n < SR * 0.28; n++) {
    const t = n / SR, x = noise(); lp += 0.55 * (x - lp);
    const env = [0, .009, .018].reduce((s, d) => s + (t >= d ? Math.exp(-(t - d) * (d === .018 ? 16 : 90)) : 0), 0);
    add(at(t0) + n, (x - lp * .5) * env * amp);
  }
}
function hat(t0, amp = 0.09, len = 0.03, pan = 0.25) {
  let prev = 0, prev2 = 0;
  for (let n = 0; n < SR * len * 3; n++) {
    const t = n / SR, x = noise(), hp = x - 2 * prev + prev2; prev2 = prev; prev = x;
    add(at(t0) + n, hp * .5 * Math.exp(-t / len * 4) * amp, pan);
  }
}
function openHat(t0, amp = 0.07) { hat(t0, amp, 0.12, -0.25); }
function lead(t0, midi, len, amp = 0.07, pan = 0) {   // plucky square lead
  const f = mtof(midi); let lp = 0;
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, ph = (f * t) % 1;
    const x = (ph < .5 ? 1 : -1) * .6 + (2 * ((f * 1.005 * t) % 1) - 1) * .4;
    lp += (0.06 + 0.4 * Math.exp(-t * 18)) * (x - lp);
    add(at(t0) + n, lp * Math.exp(-t * 6) * Math.min(1, (len - t) / .01) * amp, pan);
  }
}
function leadEcho(t0, midi, len, amp) {                // lead with ping-pong dotted-8th delay
  lead(t0, midi, len, amp, 0);
  lead(t0 + B * .75, midi, len, amp * .4, .6);
  lead(t0 + B * 1.5, midi, len, amp * .18, -.6);
}
function pad(t0, len, notes, amp = 0.02) {
  const st = notes.map(m => ({f: mtof(m), l: 0, r: 0}));
  for (let n = 0; n < SR * len; n++) {
    const t = n / SR, env = Math.min(1, t / .3) * Math.min(1, (len - t) / .3);
    let l = 0, r = 0;
    for (const s of st) { s.l += .04 * ((2 * ((s.f * .996 * t) % 1) - 1) - s.l); s.r += .04 * ((2 * ((s.f * 1.004 * t) % 1) - 1) - s.r); l += s.l; r += s.r; }
    const i = at(t0) + n; if (i < N) { L[i] += l * env * amp; R[i] += r * env * amp; }
  }
}
function riser(t0, t1, amp = 0.22) {
  let lp = 0;
  for (let n = 0; n < SR * (t1 - t0); n++) {
    const k = n / (SR * (t1 - t0)), x = noise(); lp += (0.02 + .6 * k * k) * (x - lp);
    add(at(t0) + n, (lp + Math.sin(2 * Math.PI * (200 + 1800 * k * k) * n / SR) * .1 * k) * k * k * amp, Math.sin(k * 30) * .3);
  }
}
function whoosh(tc, amp = 0.28) {
  let lp = 0; const len = .56;
  for (let n = 0; n < SR * len; n++) {
    const k = n / (SR * len), x = noise(); lp += (.03 + .35 * Math.sin(Math.PI * k)) * (x - lp);
    add(at(tc - .28) + n, lp * Math.pow(Math.sin(Math.PI * k), 2) * amp, (.5 - k) * 1.6);
  }
}
function impact(t0, amp = 0.7) {
  let ph = 0, lp = 0;
  for (let n = 0; n < SR * 1.2; n++) {
    const t = n / SR; ph += 2 * Math.PI * (36 + 70 * Math.exp(-t * 16)) / SR;
    const x = noise(); lp += .1 * (x - lp);
    add(at(t0) + n, (Math.sin(ph) * Math.exp(-t * 3) + lp * Math.exp(-t * 8)) * amp);
  }
}
function tick(t0, amp = 0.05) {
  for (let n = 0; n < SR * 0.012; n++) { const t = n / SR; add(at(t0) + n, Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 400) * amp, .2); }
}
function counterTicks(t0, dur) {                      // decelerating ticks while a counter rolls up
  let t = 0, gap = 0.028;
  while (t < dur) { tick(t0 + t); t += gap; gap *= 1.07; }
}

// ---- arrangement -------------------------------------------------------
// F minor: Fm - Db - Eb - C (C major = harmonic-minor tension)
const ROOT = [41, 37, 39, 36];
const CH = [[65, 68, 72], [61, 65, 68], [63, 67, 70], [60, 64, 67]];
const MEL = [[77, 79, 80, 79, 77, 76, 77, 72], [80, 79, 77, 76, 77, 79, 80, 84], [82, 80, 79, 77, 79, 80, 79, 75], [76, 77, 79, 80, 79, 77, 76, 72]];
const bar = t => Math.floor(t / BAR + 1e-6) % 4;

// intro: filtered lead + riser into the logo slam
for (let i = 0; i < 8; i++) leadEcho(b(i * .5), MEL[0][i], B * .45, .04 + i * .004);
riser(b(1), T.name, .28);
impact(T.name, .9); b808(T.name, 41, b(3.5), .55);
pad(0, T.name, [53, 56, 60], .018);

const DROP_END = b(66);
const breakZone = t => t >= b(48) && t < T.s5;   // 2-beat break before the total-reach drop
for (let t = T.name; t < DROP_END - 1e-6; t += B / 4) {
  const s = Math.round((t - T.name) / (B / 4)) % 32;   // 32 sixteenths = 2 bars (half-time phrase)
  const br = bar(t);
  if (t < T.s2) { if (s % 2 === 0) hat(t, .06); continue; }
  if (breakZone(t)) { if (s % 2 === 0) hat(t, .05 + (s % 8) * .01); continue; }
  // kicks / 808s
  if ([0, 10, 19].includes(s)) kick(t);
  if (s === 0 || s === 16) b808(t, ROOT[br], b(2.4), .5, s === 16 && br === 3 ? ROOT[br] + 5 : null);
  if (s === 10 || s === 26) b808(t, ROOT[br] + (s === 26 ? 12 : 0), b(1.4), .42);
  // claps on the 3rd beat of each half-time bar
  if (s === 8 || s === 24) clap(t);
  // hats: 8ths with 16th/32nd rolls at phrase ends
  if (s % 2 === 0) hat(t, .08, .03, s % 4 ? -.25 : .25);
  if (s >= 28) { hat(t + B / 8, .06, .02); }
  if (s === 14 || s === 30) openHat(t);
  // lead motif on 8ths every other phrase
  if (s % 2 === 0 && (Math.floor((t - T.name) / (BAR * 2)) % 2 === 1 || (t >= T.fb && t < T.s5))) leadEcho(t, MEL[br][(s / 2) % 8], B * .42, .045);
}
for (let t = T.s2; t < DROP_END - 1e-6; t += BAR) pad(t, BAR + .02, CH[bar(t)], .014);

// hits & sound design
CUTS.forEach(t => { whoosh(t); impact(t, .45); });
[T.w2, ...T.chips].forEach(t => impact(t, .35));
[T.fb, T.tg, T.ig].forEach(t => counterTicks(t + .35, 1.2));
counterTicks(T.s5 + .2, 1.3);
riser(b(46), T.s5, .3);
impact(T.s5, .9);

// outro: final 808 + lead tail
impact(DROP_END, .8); b808(DROP_END, 41, T.end - DROP_END, .5);
[77, 80, 84, 89].forEach((m, i) => leadEcho(DROP_END + i * B / 2, m, B * .45, .05));
pad(DROP_END, T.end - DROP_END, [53, 56, 60, 65], .02);

// ---- master ------------------------------------------------------------
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (DUR - i / SR) / .7);
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

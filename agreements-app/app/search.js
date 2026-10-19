/* محرك البحث: تطبيع النص العربي، تحليل الاستعلام، المطابقة، واستخراج المقتطفات. */
(function (root) {
  const DIACRITICS = /[ً-ٰٟـۖ-ۭ]/;
  const LETTER = /[ء-يٱ-ۓa-z0-9]/;
  const PREFIXES = ['', 'و', 'ف', 'ب', 'ك', 'ل', 'ال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل', 'وب', 'ول', 'وك', 'فب', 'فل', 'س', 'وس'];
  const SUFFIXES = ['', 'ه', 'ها', 'هم', 'هما', 'هن', 'ي', 'نا', 'كم', 'ك', 'ات', 'ين', 'ون', 'ان', 'يه', 'يا', 'ا'];

  function normChar(c, full) {
    if (!full) return c.toLowerCase();
    switch (c) {
      case 'أ': case 'إ': case 'آ': case 'ٱ': return 'ا';
      case 'ى': return 'ي';
      case 'ة': return 'ه';
      case 'ؤ': return 'و';
      case 'ئ': return 'ي';
      default: return c.toLowerCase();
    }
  }

  // يعيد النص المطبّع مع خريطة من موقع كل حرف مطبّع إلى موقعه في الأصل
  function normalizeWithMap(text, full = true) {
    let norm = '';
    const map = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (full && DIACRITICS.test(c)) continue;
      norm += normChar(c, full);
      map.push(i);
    }
    return { norm, map };
  }

  function normalize(text, full = true) {
    return normalizeWithMap(text || '', full).norm;
  }

  /*
   * يحلل الاستعلام إلى مجموعات: كل مجموعة = بدائل (أو)، والمجموعات مترابطة بـ (و).
   * term: { text, phrase, negate, prefix }
   */
  function parseQuery(q, opts = {}) {
    const full = opts.normalize !== false;
    const mode = opts.mode || 'all';
    q = (q || '').trim();
    if (!q) return { groups: [], negs: [], terms: [] };
    if (mode === 'phrase') {
      const t = normalize(q.replace(/"/g, ''), full).trim().replace(/\s+/g, ' ');
      return t ? { groups: [[{ text: t, phrase: true }]], negs: [], terms: [t] } : { groups: [], negs: [], terms: [] };
    }
    const tokens = [];
    const re = /(-?)"([^"]+)"|(\S+)/g;
    let m;
    while ((m = re.exec(q))) {
      if (m[2] !== undefined) tokens.push({ raw: m[2], negate: m[1] === '-', phrase: true });
      else tokens.push({ raw: m[3] });
    }
    const groups = [];
    const negs = [];
    let joinNext = false;
    for (const tk of tokens) {
      if (!tk.phrase && (tk.raw === 'أو' || tk.raw === '|' || tk.raw.toUpperCase() === 'OR')) { joinNext = groups.length > 0; continue; }
      let raw = tk.raw;
      let negate = tk.negate || false;
      if (!tk.phrase && raw.length > 1 && raw[0] === '-') { negate = true; raw = raw.slice(1); }
      let prefix = false;
      if (!tk.phrase && raw.endsWith('*')) { prefix = true; raw = raw.replace(/\*+$/, ''); }
      const text = normalize(raw, full).trim().replace(/\s+/g, ' ');
      if (!text) continue;
      const term = { text, phrase: !!tk.phrase, prefix };
      if (negate) { negs.push(term); joinNext = false; continue; }
      if (mode === 'any' && groups.length) groups[0].push(term);
      else if (joinNext) groups[groups.length - 1].push(term);
      else groups.push([term]);
      joinNext = false;
    }
    const terms = groups.flat().map(t => t.text);
    return { groups, negs, terms };
  }

  // يجد كل مواقع term داخل نص مطبّع
  function findAll(norm, term, wholeWord) {
    const hits = [];
    if (!term.text) return hits;
    let from = 0;
    while (true) {
      const p = norm.indexOf(term.text, from);
      if (p < 0) break;
      from = p + 1;
      let end = p + term.text.length;
      if (wholeWord && !term.prefix) {
        let ws = p;
        while (ws > 0 && LETTER.test(norm[ws - 1])) ws--;
        if (!PREFIXES.includes(norm.slice(ws, p))) continue;
        let we = end;
        while (we < norm.length && LETTER.test(norm[we])) we++;
        if (!SUFFIXES.includes(norm.slice(end, we))) continue;
      } else if (wholeWord && term.prefix) {
        let ws = p;
        while (ws > 0 && LETTER.test(norm[ws - 1])) ws--;
        if (!PREFIXES.includes(norm.slice(ws, p))) continue;
      }
      hits.push([p, end]);
    }
    return hits;
  }

  /*
   * units: [{ field, label, text, ref }]
   * يعيد: { matched, score, unitHits: [{unit, ranges(original)}] }
   */
  function matchDocument(units, parsed, opts = {}) {
    const full = opts.normalize !== false;
    const wholeWord = !!opts.wholeWord;
    const scope = opts.scope || 'doc';
    const prepared = units.map(u => {
      const nm = normalizeWithMap(u.text || '', full);
      const groupHits = parsed.groups.map(g => g.flatMap(t => findAll(nm.norm, t, wholeWord)));
      const negHit = parsed.negs.some(t => findAll(nm.norm, t, wholeWord).length > 0);
      return { u, nm, groupHits, negHit };
    });

    if (!parsed.groups.length) return { matched: false, score: 0, unitHits: [] };

    let matched;
    let usable = prepared;
    if (scope === 'para') {
      usable = prepared.filter(p => !p.negHit && p.groupHits.every(h => h.length));
      matched = usable.length > 0;
    } else {
      const negAny = prepared.some(p => p.negHit);
      matched = !negAny && parsed.groups.every((_, gi) => prepared.some(p => p.groupHits[gi].length));
    }
    if (!matched) return { matched: false, score: 0, unitHits: [] };

    let score = 0;
    const unitHits = [];
    for (const p of usable) {
      const ranges = p.groupHits.flat();
      if (!ranges.length) continue;
      const weight = p.u.field === 'title' ? 10 : p.u.field === 'points' || p.u.field === 'summary' ? 3 : 1;
      score += ranges.length * weight;
      const orig = ranges.map(([s, e]) => [p.nm.map[s], p.nm.map[e - 1] + 1]).sort((a, b) => a[0] - b[0]);
      unitHits.push({ unit: p.u, ranges: mergeRanges(orig) });
    }
    return { matched: true, score, unitHits };
  }

  function mergeRanges(ranges) {
    const out = [];
    for (const r of ranges) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  }

  // يعيد مواقع التمييز في نص أصلي (للعرض داخل القارئ)
  function highlightRanges(text, parsed, opts = {}) {
    if (!parsed || !parsed.groups.length || !text) return [];
    const nm = normalizeWithMap(text, opts.normalize !== false);
    const ranges = parsed.groups.flat().flatMap(t => findAll(nm.norm, t, !!opts.wholeWord));
    return mergeRanges(ranges.map(([s, e]) => [nm.map[s], nm.map[e - 1] + 1]).sort((a, b) => a[0] - b[0]));
  }

  // يقتطع نافذة حول أول تطابق
  function snippet(text, ranges, radius = 90) {
    if (!ranges.length) return { text: text.slice(0, radius * 2), ranges: [], cutStart: false, cutEnd: text.length > radius * 2 };
    const first = ranges[0][0];
    let s = Math.max(0, first - radius);
    let e = Math.min(text.length, ranges[0][1] + radius * 1.5);
    if (s > 0) { const sp = text.indexOf(' ', s); if (sp > -1 && sp < first) s = sp + 1; }
    if (e < text.length) { const sp = text.lastIndexOf(' ', e); if (sp > ranges[0][1]) e = sp; }
    const inside = ranges.filter(r => r[0] >= s && r[1] <= e).map(r => [r[0] - s, r[1] - s]);
    return { text: text.slice(s, e), ranges: inside, cutStart: s > 0, cutEnd: e < text.length };
  }

  const api = { normalize, normalizeWithMap, parseQuery, findAll, matchDocument, highlightRanges, snippet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Search = api;
})(typeof window !== 'undefined' ? window : globalThis);

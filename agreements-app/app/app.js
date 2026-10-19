/* واجهة البرنامج */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const STORE_KEY = 'pal-agreements.user.v1';
  const TOPICS = window.TOPICS;

  // ---------- التخزين المحلي ----------
  function loadUser() {
    try {
      const u = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return { texts: u.texts || {}, notes: u.notes || {}, custom: u.custom || [] };
    } catch (e) { return { texts: {}, notes: {}, custom: [] }; }
  }
  function saveUser() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(user)); }
    catch (e) { toast('تعذّر الحفظ في التخزين المحلي'); }
  }
  function pref(key, val) {
    try {
      if (val === undefined) return localStorage.getItem('pal-agreements.' + key);
      localStorage.setItem('pal-agreements.' + key, val);
    } catch (e) { return null; }
  }

  let user = loadUser();
  const state = {
    selectedId: null,
    view: 'reader',
    query: '',
    parsed: null,
    results: null,
    compare: new Set(['mecca-2007', 'cairo-2011', 'algiers-2022', 'beijing-2024']),
    fontSize: Number(pref('font')) || 17
  };

  function all() {
    return window.AGREEMENTS.concat(user.custom).map(a => Object.assign({}, a, {
      fullText: user.texts[a.id] != null ? user.texts[a.id] : (a.fullText || ''),
      notes: user.notes[a.id] || '',
      custom: user.custom.some(c => c.id === a.id)
    }));
  }
  const byId = id => all().find(a => a.id === id);
  const year = a => Number((a.date || '').slice(0, 4)) || 0;

  // ---------- أدوات ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hl(text, ranges) {
    if (!ranges || !ranges.length) return esc(text);
    let out = '', last = 0;
    for (const [s, e] of ranges) { out += esc(text.slice(last, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>'; last = e; }
    return out + esc(text.slice(last));
  }
  function hlq(text) {
    if (!state.parsed) return esc(text);
    return hl(text, Search.highlightRanges(text || '', state.parsed, searchOpts()));
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const paragraphs = text => (text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

  // ---------- وحدات البحث ----------
  function units(a) {
    const u = [];
    u.push({ field: 'title', label: 'العنوان', text: [a.title].concat(a.aka || []).join(' • '), ref: 'top' });
    u.push({ field: 'summary', label: 'الملخص', text: a.summary || '', ref: 'summary' });
    (a.points || []).forEach((p, i) => u.push({ field: 'points', label: 'بند – ' + (TOPICS[p.topic] || ''), text: p.text, ref: 'p' + i }));
    paragraphs(a.fullText).forEach((t, i) => u.push({ field: 'fullText', label: 'النص الكامل – فقرة ' + (i + 1), text: t, ref: 'f' + i }));
    u.push({ field: 'context', label: 'السياق', text: a.context || '', ref: 'context' });
    u.push({ field: 'context', label: 'المآل', text: a.outcome || '', ref: 'outcome' });
    u.push({ field: 'people', label: 'الموقعون', text: a.signatories || '', ref: 'meta' });
    u.push({ field: 'people', label: 'الأطراف والراعي والمكان', text: [(a.parties || []).join('، '), a.sponsor, a.place].join(' • '), ref: 'meta' });
    if (a.notes) paragraphs(a.notes).forEach((t, i) => u.push({ field: 'notes', label: 'ملاحظاتي', text: t, ref: 'notes' }));
    return u;
  }

  function searchOpts() {
    return {
      mode: ($('input[name=mode]:checked') || {}).value || 'all',
      scope: ($('input[name=scope]:checked') || {}).value || 'doc',
      wholeWord: $('#opt-word').checked,
      normalize: $('#opt-norm').checked,
      fields: $$('input[name=field]:checked').map(i => i.value)
    };
  }

  function filters() {
    return {
      from: Number($('#f-from').value) || 0,
      to: Number($('#f-to').value) || 9999,
      cat: $('#f-cat').value, sponsor: $('#f-sponsor').value,
      party: $('#f-party').value, topic: $('#f-topic').value,
      hasFull: $('#f-hasfull').checked
    };
  }
  function passFilters(a, f) {
    const y = year(a);
    if (y && (y < f.from || y > f.to)) return false;
    if (f.cat && a.category !== f.cat) return false;
    if (f.sponsor && sponsorKey(a) !== f.sponsor) return false;
    if (f.party && !(a.parties || []).some(p => p.includes(f.party))) return false;
    if (f.topic && !(a.points || []).some(p => p.topic === f.topic)) return false;
    if (f.hasFull && !a.fullText.trim()) return false;
    return true;
  }
  const sponsorKey = a => (a.sponsor || '').split(/[(،]/)[0].trim();

  function sorted(list) {
    const s = $('#sort').value;
    const out = list.slice();
    if (s === 'title') out.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
    else out.sort((a, b) => (a.date || '').localeCompare(b.date || '') * (s === 'date-desc' ? -1 : 1));
    return out;
  }

  function runSearch() {
    state.query = $('#q').value.trim();
    const opts = searchOpts();
    const f = filters();
    const parsed = Search.parseQuery(state.query, opts);
    state.parsed = parsed.groups.length ? parsed : null;
    if (!state.parsed) {
      state.results = null;
      renderAll();
      if (state.view === 'results') renderResults();
      return;
    }
    const res = [];
    for (const a of all()) {
      if (!passFilters(a, f)) continue;
      const us = units(a).filter(u => opts.fields.includes(u.field) && u.text);
      const m = Search.matchDocument(us, parsed, opts);
      if (m.matched) res.push({ a, score: m.score, hits: m.unitHits });
    }
    res.sort((x, y) => y.score - x.score);
    state.results = res;
    renderAll();
    setView('results');
  }

  // ---------- القائمة الجانبية ----------
  function renderList() {
    const f = filters();
    const hitMap = new Map((state.results || []).map(r => [r.a.id, r]));
    let list = all().filter(a => passFilters(a, f));
    if (state.results) list = list.filter(a => hitMap.has(a.id));
    list = sorted(list);
    $('#list').innerHTML = list.map(a => {
      const r = hitMap.get(a.id);
      const n = r ? r.hits.reduce((s, h) => s + h.ranges.length, 0) : 0;
      return `<li><button data-id="${esc(a.id)}" class="${a.id === state.selectedId ? 'active' : ''}">
        <span class="li-title">${esc(a.title)}</span>
        <span class="li-meta">${esc(a.dateLabel || a.date)} • ${esc(a.place || '')}</span>
        <span class="li-tags"><span class="tag cat-${esc(a.category)}">${esc(a.category)}</span>${a.fullText.trim() ? '<span class="tag full">نص كامل</span>' : ''}${a.custom ? '<span class="tag">مضاف</span>' : ''}${n ? `<span class="tag hits">${n} تطابق</span>` : ''}</span>
      </button></li>`;
    }).join('') || '<li class="empty">لا توجد نتائج مطابقة</li>';
    const total = all().length;
    $('#count-label').textContent = `${total} وثيقة`;
  }

  // ---------- القارئ ----------
  function renderReader() {
    const a = byId(state.selectedId);
    const v = $('#view-reader');
    if (!a) { v.innerHTML = '<div class="empty-state">اختر اتفاقاً من القائمة</div>'; return; }
    const pts = (a.points || []).map((p, i) => `<li data-ref="p${i}"><span class="chip t-${esc(p.topic)}">${esc(TOPICS[p.topic] || p.topic)}</span> ${hlq(p.text)}</li>`).join('');
    const full = paragraphs(a.fullText);
    const fullHtml = full.length
      ? full.map((t, i) => `<p data-ref="f${i}">${hlq(t)}</p>`).join('')
      : `<div class="notice">لم يُضف النص الرسمي الكامل لهذه الوثيقة بعد. يمكنك نسخه من أحد المصادر أدناه ولصقه عبر زر «إضافة النص الكامل»، وسيصبح قابلاً للبحث فوراً.</div>`;
    const srcs = (a.sources || []).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('') || '<li class="muted">لا توجد مصادر مسجّلة.</li>';
    v.innerHTML = `
      <article class="doc" style="--fs:${state.fontSize}px">
        <div class="doc-tools">
          <button class="ghost" data-act="font-" title="تصغير الخط">ا−</button>
          <button class="ghost" data-act="font+" title="تكبير الخط">ا+</button>
          <button class="ghost" data-act="edit-full">${full.length ? '✎ تعديل النص الكامل' : '＋ إضافة النص الكامل'}</button>
          <button class="ghost" data-act="edit-notes">🗒 ملاحظاتي</button>
          <button class="ghost" data-act="copy">⧉ نسخ</button>
          <button class="ghost" data-act="print">🖶 طباعة</button>
          ${a.custom ? '<button class="ghost danger" data-act="delete">حذف</button>' : ''}
        </div>
        <header data-ref="top">
          <span class="tag cat-${esc(a.category)}">${esc(a.category)}</span>
          <h2>${hlq(a.title)}</h2>
          ${a.aka && a.aka.length ? `<p class="aka">يُعرف أيضاً بـ: ${hlq(a.aka.join('، '))}</p>` : ''}
        </header>
        <dl class="meta" data-ref="meta">
          <div><dt>التاريخ</dt><dd>${esc(a.dateLabel || a.date)}</dd></div>
          <div><dt>المكان</dt><dd>${hlq(a.place)}</dd></div>
          <div><dt>الراعي</dt><dd>${hlq(a.sponsor)}</dd></div>
          <div><dt>الأطراف</dt><dd>${hlq((a.parties || []).join('، '))}</dd></div>
          <div class="wide"><dt>الموقعون</dt><dd>${hlq(a.signatories)}</dd></div>
        </dl>
        <section data-ref="summary"><h3>الملخص</h3><p>${hlq(a.summary)}</p></section>
        ${a.context ? `<section data-ref="context"><h3>السياق</h3><p>${hlq(a.context)}</p></section>` : ''}
        ${pts ? `<section><h3>أبرز البنود <small>(تلخيص تحريري — ليس النص الحرفي)</small></h3><ol class="points">${pts}</ol></section>` : ''}
        ${a.outcome ? `<section data-ref="outcome"><h3>المآل والتنفيذ</h3><p>${hlq(a.outcome)}</p></section>` : ''}
        <section class="fulltext"><h3>النص الكامل ${full.length ? `<small>(${full.length} فقرة)</small>` : ''}</h3>${fullHtml}</section>
        ${a.notes ? `<section data-ref="notes" class="notes"><h3>ملاحظاتي</h3>${paragraphs(a.notes).map(t => `<p>${hlq(t)}</p>`).join('')}</section>` : ''}
        <section><h3>المصادر</h3><ul class="sources">${srcs}</ul></section>
      </article>`;
  }

  function openDoc(id, ref) {
    state.selectedId = id;
    renderList();
    renderReader();
    setView('reader');
    const v = $('#view-reader');
    if (ref) {
      const el = v.querySelector(`[data-ref="${ref}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); return; }
    }
    v.scrollTop = 0;
    const firstMark = v.querySelector('mark');
    if (firstMark && state.parsed) firstMark.scrollIntoView({ block: 'center' });
  }

  // ---------- النتائج ----------
  function renderResults() {
    const v = $('#view-results');
    const badge = $('#res-badge');
    if (!state.results) {
      badge.hidden = true;
      v.innerHTML = '<div class="empty-state">اكتب كلمات البحث في الأعلى ثم اضغط Enter.<br><small>جرّب: <code>انتخابات</code>، <code>"حكومة وحدة"</code>، <code>منظمة أو الإطار القيادي</code>، <code>المعابر -الشاطئ</code></small></div>';
      return;
    }
    const r = state.results;
    const total = r.reduce((s, x) => s + x.hits.reduce((t, h) => t + h.ranges.length, 0), 0);
    badge.hidden = false; badge.textContent = r.length;
    v.innerHTML = `<div class="res-head"><strong>${r.length}</strong> وثيقة • <strong>${total}</strong> موضعاً لـ «${esc(state.query)}»
      ${r.length ? '<button class="ghost" data-act="export-results">⬇️ حفظ النتائج نصاً</button>' : ''}</div>` +
      (r.length ? r.map(x => `
        <div class="res-card">
          <button class="res-title" data-open="${esc(x.a.id)}">${esc(x.a.title)} <span class="muted">• ${esc(x.a.dateLabel || x.a.date)}</span></button>
          <ul>${x.hits.slice(0, 8).map(h => {
            const sn = Search.snippet(h.unit.text, h.ranges);
            return `<li><button data-open="${esc(x.a.id)}" data-ref="${esc(h.unit.ref)}"><span class="lbl">${esc(h.unit.label)}</span>${sn.cutStart ? '… ' : ''}${hl(sn.text, sn.ranges)}${sn.cutEnd ? ' …' : ''}</button></li>`;
          }).join('')}</ul>
          ${x.hits.length > 8 ? `<div class="muted more">و${x.hits.length - 8} مواضع أخرى — افتح الوثيقة لرؤيتها مميزة</div>` : ''}
        </div>`).join('') : '<div class="empty-state">لا نتائج. جرّب «أيّ كلمة» من البحث المتقدم أو أزل بعض عوامل التصفية.</div>');
  }

  // ---------- المقارنة ----------
  function renderCompare() {
    const v = $('#view-compare');
    const list = sorted(all()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const sel = list.filter(a => state.compare.has(a.id));
    const chips = list.map(a => `<label class="pick"><input type="checkbox" data-cmp="${esc(a.id)}" ${state.compare.has(a.id) ? 'checked' : ''}> ${esc(a.title)} <small>${year(a) || ''}</small></label>`).join('');
    const rows = Object.keys(TOPICS).map(k => {
      const cells = sel.map(a => {
        const ps = (a.points || []).filter(p => p.topic === k);
        return `<td>${ps.length ? ps.map(p => `<p>${hlq(p.text)}</p>`).join('') : '<span class="muted">—</span>'}</td>`;
      }).join('');
      return `<tr><th scope="row">${esc(TOPICS[k])}</th>${cells}</tr>`;
    }).join('');
    v.innerHTML = `<div class="cmp-picks">${chips}</div>
      ${sel.length ? `<div class="table-wrap"><table class="cmp"><thead><tr><th>المحور</th>${sel.map(a => `<th><button data-open="${esc(a.id)}">${esc(a.title)}</button><small>${esc(a.dateLabel || '')}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="empty-state">اختر وثيقتين أو أكثر للمقارنة</div>'}`;
  }

  // ---------- الخط الزمني ----------
  function renderTimeline() {
    const v = $('#view-timeline');
    const f = filters();
    const list = all().filter(a => passFilters(a, f)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let lastY = 0;
    v.innerHTML = '<ol class="timeline">' + list.map(a => {
      const y = year(a);
      const yh = y !== lastY ? `<li class="year">${y}</li>` : '';
      lastY = y;
      return yh + `<li class="ev"><button data-open="${esc(a.id)}"><span class="ev-date">${esc(a.dateLabel || a.date)} • ${esc(a.place || '')}</span>
        <strong>${esc(a.title)}</strong> <span class="tag cat-${esc(a.category)}">${esc(a.category)}</span>
        <span class="ev-sum">${esc(a.summary)}</span>
        ${a.outcome ? `<span class="ev-out">المآل: ${esc(a.outcome)}</span>` : ''}</button></li>`;
    }).join('') + '</ol>';
  }

  // ---------- العرض ----------
  function setView(view) {
    state.view = view;
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    ['reader', 'results', 'compare', 'timeline'].forEach(n => { $('#view-' + n).hidden = n !== view; });
    if (view === 'results') renderResults();
    if (view === 'compare') renderCompare();
    if (view === 'timeline') renderTimeline();
  }
  function renderAll() {
    renderList();
    renderReader();
    renderResults();
    if (state.view === 'compare') renderCompare();
    if (state.view === 'timeline') renderTimeline();
  }

  function fillFilters() {
    const A = all();
    const opt = (vals, label) => `<option value="">${label}</option>` + vals.map(v => `<option>${esc(v)}</option>`).join('');
    const uniq = arr => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    $('#f-cat').innerHTML = opt(uniq(A.map(a => a.category)), 'الكل');
    $('#f-sponsor').innerHTML = opt(uniq(A.map(sponsorKey)), 'الكل');
    $('#f-party').innerHTML = opt(['فتح', 'حماس', 'الجهاد الإسلامي', 'الجبهة الشعبية', 'الجبهة الديمقراطية'], 'الكل');
    $('#f-topic').innerHTML = '<option value="">الكل</option>' + Object.entries(TOPICS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  }

  // ---------- الحوارات ----------
  function dialog(title, bodyHtml, onOk, okLabel = 'حفظ') {
    const d = $('#dlg');
    $('#dlg-title').textContent = title;
    $('#dlg-body').innerHTML = bodyHtml;
    $('#dlg-ok').textContent = okLabel;
    $('#dlg-ok').hidden = !onOk;
    d.onclose = () => { if (d.returnValue === 'ok' && onOk) onOk($('#dlg-body')); };
    d.showModal();
  }

  function readTextFile(cb) {
    const fi = $('#file-in');
    fi.accept = '.txt,.md,.text';
    fi.value = '';
    fi.onchange = () => {
      const f = fi.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => cb(String(r.result));
      r.readAsText(f, 'utf-8');
    };
    fi.click();
  }

  function editFullText(a) {
    dialog(`النص الكامل – ${a.title}`, `
      <p class="muted">الصق النص الرسمي للوثيقة هنا (كل فقرة/بند في سطر). يُحفظ على هذا الجهاز ويصبح قابلاً للبحث.</p>
      <textarea id="ta" rows="18">${esc(a.fullText)}</textarea>
      <div class="row-btns"><button type="button" class="ghost" id="load-txt">📂 تحميل من ملف نصي</button>
      ${a.sources && a.sources[0] ? `<a href="${esc(a.sources[0].url)}" target="_blank" rel="noopener">فتح المصدر ↗</a>` : ''}</div>`,
      body => {
        const t = $('#ta', body).value.trim();
        if (t) user.texts[a.id] = t; else delete user.texts[a.id];
        if (a.custom) { const c = user.custom.find(x => x.id === a.id); if (c) c.fullText = t; }
        saveUser(); renderAll(); toast('تم حفظ النص');
      });
    $('#load-txt').onclick = () => readTextFile(t => { $('#ta').value = t; });
  }

  function editNotes(a) {
    dialog(`ملاحظاتي – ${a.title}`, `<textarea id="ta" rows="10" placeholder="ملاحظات شخصية، تعليقات، اقتباسات…">${esc(a.notes)}</textarea>`, body => {
      const t = $('#ta', body).value.trim();
      if (t) user.notes[a.id] = t; else delete user.notes[a.id];
      saveUser(); renderAll(); toast('تم حفظ الملاحظات');
    });
  }

  function addAgreement() {
    const topicOpts = Object.entries(TOPICS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    dialog('إضافة اتفاق أو وثيقة', `
      <div class="form">
        <label>العنوان* <input id="n-title" required></label>
        <label>أسماء بديلة (مفصولة بفواصل) <input id="n-aka"></label>
        <div class="row2"><label>التاريخ <input id="n-date" type="date"></label><label>النوع
          <select id="n-cat"><option>اتفاق</option><option>إعلان</option><option>وثيقة</option><option>بيان</option><option>مبادرة</option></select></label></div>
        <div class="row2"><label>المكان <input id="n-place"></label><label>الراعي <input id="n-sponsor"></label></div>
        <label>الأطراف (مفصولة بفواصل) <input id="n-parties" placeholder="فتح، حماس"></label>
        <label>الموقعون <input id="n-sign"></label>
        <label>الملخص <textarea id="n-sum" rows="3"></textarea></label>
        <label>أبرز البنود (كل بند في سطر، ويمكن بدء السطر برمز المحور ثم «:»)
          <textarea id="n-points" rows="4" placeholder="elections: إجراء الانتخابات خلال عام"></textarea></label>
        <p class="muted">رموز المحاور: ${Object.entries(TOPICS).map(([k, v]) => `<code>${k}</code>=${esc(v)}`).join(' • ')}</p>
        <label>النص الكامل <textarea id="n-full" rows="6"></textarea></label>
      </div>`, body => {
        const g = id => $(id, body).value.trim();
        const title = g('#n-title');
        if (!title) { toast('العنوان مطلوب'); return; }
        const split = s => s.split(/[،,]/).map(x => x.trim()).filter(Boolean);
        const points = g('#n-points').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const m = l.match(/^([a-z]+)\s*:\s*(.+)$/);
          return m && TOPICS[m[1]] ? { topic: m[1], text: m[2] } : { topic: 'political', text: l };
        });
        const date = g('#n-date');
        const a = {
          id: 'custom-' + Date.now(), title, aka: split(g('#n-aka')), date, dateLabel: date,
          place: g('#n-place'), sponsor: g('#n-sponsor'), category: g('#n-cat'), parties: split(g('#n-parties')),
          signatories: g('#n-sign'), summary: g('#n-sum'), context: '', points, outcome: '', sources: [], fullText: g('#n-full')
        };
        user.custom.push(a); saveUser(); fillFilters(); openDoc(a.id); toast('تمت الإضافة');
      }, 'إضافة');
  }

  function download(name, text, type) {
    const b = new Blob([text], { type });
    const u = URL.createObjectURL(b);
    const l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click();
    setTimeout(() => { URL.revokeObjectURL(u); l.remove(); }, 500);
  }

  function exportBackup() {
    download('agreements-backup.json', JSON.stringify({ app: 'pal-agreements', version: 1, ...user }, null, 2), 'application/json');
  }
  function importBackup() {
    const fi = $('#file-in');
    fi.accept = '.json'; fi.value = '';
    fi.onchange = () => {
      const f = fi.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(String(r.result));
          user.texts = Object.assign(user.texts, d.texts || {});
          user.notes = Object.assign(user.notes, d.notes || {});
          const ids = new Set(user.custom.map(c => c.id));
          (d.custom || []).forEach(c => { if (!ids.has(c.id)) user.custom.push(c); });
          saveUser(); fillFilters(); renderAll(); toast('تم الاستيراد');
        } catch (e) { toast('ملف غير صالح'); }
      };
      r.readAsText(f, 'utf-8');
    };
    fi.click();
  }

  function exportResults() {
    const lines = [`نتائج البحث عن: ${state.query}`, ''];
    for (const x of state.results) {
      lines.push(`■ ${x.a.title} (${x.a.dateLabel || x.a.date})`);
      for (const h of x.hits) lines.push(`  - [${h.unit.label}] ${h.unit.text}`);
      lines.push('');
    }
    download('search-results.txt', lines.join('\n'), 'text/plain;charset=utf-8');
  }

  function showHelp() {
    dialog('دليل البحث المتقدم', `
      <ul class="help">
        <li><code>انتخابات حكومة</code> — الوثائق التي تحتوي الكلمتين معاً.</li>
        <li><code>"حكومة وحدة وطنية"</code> — العبارة كما هي.</li>
        <li><code>الدوحة أو القاهرة</code> أو <code>الدوحة | القاهرة</code> — أيٌّ منهما.</li>
        <li><code>المقاومة -بكين</code> — استبعاد الوثائق التي تذكر «بكين».</li>
        <li><code>انتخ*</code> — كلمة تبدأ بـ«انتخ» (مع خيار «كلمة كاملة»).</li>
        <li>البحث يتجاهل التشكيل ويوحّد (أ إ آ ← ا) و(ة ← ه) و(ى ← ي) افتراضياً، فـ«الأسرى» تطابق «الاسري».</li>
        <li>«في الفقرة/البند نفسه» يشترط وجود كل الكلمات داخل البند أو الفقرة ذاتها.</li>
        <li>اختصارات: <kbd>Ctrl</kbd>+<kbd>F</kbd> للبحث، <kbd>Esc</kbd> لمسح البحث.</li>
      </ul>`, null);
  }

  // ---------- الأحداث ----------
  function bind() {
    $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); if (e.key === 'Escape') { $('#q').value = ''; runSearch(); } });
    $('#q').addEventListener('search', () => { if (!$('#q').value) runSearch(); });
    $('#btn-search').onclick = runSearch;
    $('#btn-adv-go').onclick = runSearch;
    $('#btn-adv').onclick = () => {
      const p = $('#adv'); p.hidden = !p.hidden;
      $('#btn-adv').setAttribute('aria-expanded', String(!p.hidden));
    };
    $('#btn-reset').onclick = () => {
      $('#adv').querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = i.name === 'field' || i.id === 'opt-norm'; });
      $('input[name=mode][value=all]').checked = true;
      $('input[name=scope][value=doc]').checked = true;
      ['#f-from', '#f-to'].forEach(s => { $(s).value = ''; });
      ['#f-cat', '#f-sponsor', '#f-party', '#f-topic'].forEach(s => { $(s).value = ''; });
      runSearch();
    };
    ['#f-cat', '#f-sponsor', '#f-party', '#f-topic', '#f-from', '#f-to', '#f-hasfull'].forEach(s => $(s).addEventListener('change', runSearch));
    $('#sort').onchange = renderList;

    $('#list').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) openDoc(b.dataset.id); });
    $$('.tabs button').forEach(b => { b.onclick = () => setView(b.dataset.view); });

    document.addEventListener('click', e => {
      const o = e.target.closest('[data-open]');
      if (o) { openDoc(o.dataset.open, o.dataset.ref); return; }
      const act = e.target.closest('[data-act]');
      if (!act) {
        if (!e.target.closest('#btn-menu')) $('#menu').hidden = true;
        return;
      }
      const a = byId(state.selectedId);
      $('#menu').hidden = true;
      switch (act.dataset.act) {
        case 'font+': state.fontSize = Math.min(28, state.fontSize + 1); pref('font', state.fontSize); renderReader(); break;
        case 'font-': state.fontSize = Math.max(13, state.fontSize - 1); pref('font', state.fontSize); renderReader(); break;
        case 'edit-full': if (a) editFullText(a); break;
        case 'edit-notes': if (a) editNotes(a); break;
        case 'copy': if (a) { navigator.clipboard.writeText($('.doc').innerText).then(() => toast('تم النسخ')); } break;
        case 'print': window.print(); break;
        case 'delete':
          if (a && a.custom && confirm('حذف هذه الوثيقة المضافة نهائياً؟')) {
            user.custom = user.custom.filter(c => c.id !== a.id); delete user.texts[a.id]; delete user.notes[a.id];
            saveUser(); state.selectedId = window.AGREEMENTS[0].id; fillFilters(); renderAll();
          }
          break;
        case 'add': addAgreement(); break;
        case 'export': exportBackup(); break;
        case 'import': importBackup(); break;
        case 'help': showHelp(); break;
        case 'export-results': exportResults(); break;
      }
    });
    $('#btn-menu').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
    $('#view-compare').addEventListener('change', e => {
      const c = e.target.closest('[data-cmp]'); if (!c) return;
      if (c.checked) state.compare.add(c.dataset.cmp); else state.compare.delete(c.dataset.cmp);
      renderCompare();
    });
    $('#btn-theme').onclick = () => {
      const cur = document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = cur ? 'light' : 'dark';
      pref('theme', document.documentElement.dataset.theme);
    };
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
    });
  }

  // ---------- البدء ----------
  const th = pref('theme'); if (th) document.documentElement.dataset.theme = th;
  fillFilters();
  bind();
  state.selectedId = window.AGREEMENTS[0].id;
  renderAll();
})();

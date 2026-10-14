/* appbuilder guide: interactions. Plain JavaScript, no outside calls. Browser storage is only a convenience
   (theme, progress) and every read and write is guarded, so the pages work without it. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const root = document.body.dataset.root || './';
  const memory = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? (k in memory ? memory[k] : d) : JSON.parse(v); } catch (e) { return k in memory ? memory[k] : d; } },
    set(k, v) { memory[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: keep it for this page */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg) => { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600); };

  /* ---------- Theme ---------- */
  const themeBtn = $('.theme-toggle');
  const setThemeIcon = () => { if (themeBtn) themeBtn.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? 'Switch to light' : 'Switch to dark'); };
  setThemeIcon();
  if (themeBtn) themeBtn.addEventListener('click', () => { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; store.set('ab.theme', next); setThemeIcon(); });

  /* ---------- Menus (disclosure pattern) ---------- */
  const wraps = $$('.tabwrap');
  const setOpen = (w, open) => { $('.mega', w).classList.toggle('open', open); $('.tab', w).setAttribute('aria-expanded', String(open)); };
  const closeAll = (except) => wraps.forEach((w) => { if (w !== except) setOpen(w, false); });
  wraps.forEach((w) => {
    const btn = $('.tab', w); let timer = null; let hoverOpened = 0;
    w.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(() => { closeAll(w); setOpen(w, true); hoverOpened = Date.now(); }, 120); });
    w.addEventListener('mouseleave', () => { clearTimeout(timer); timer = setTimeout(() => setOpen(w, false), 160); });
    btn.addEventListener('click', () => { const open = btn.getAttribute('aria-expanded') === 'true'; if (open && Date.now() - hoverOpened < 400) return; closeAll(w); setOpen(w, !open); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); closeAll(w); setOpen(w, true); const a = $('.mega a', w); if (a) a.focus(); } });
    w.addEventListener('keydown', (e) => {
      const links = $$('.mega a', w); const i = links.indexOf(document.activeElement);
      if (e.key === 'Escape') { setOpen(w, false); btn.focus(); }
      else if (e.key === 'ArrowDown' && i >= 0) { e.preventDefault(); links[Math.min(i + 1, links.length - 1)].focus(); }
      else if (e.key === 'ArrowUp' && i >= 0) { e.preventDefault(); if (i === 0) btn.focus(); else links[i - 1].focus(); }
    });
    w.addEventListener('focusout', (e) => { if (!w.contains(e.relatedTarget)) setOpen(w, false); });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.tabwrap')) closeAll(); });

  /* ---------- Search ---------- */
  const dialog = $('.search-dialog'); const input = dialog && $('input', dialog); const results = dialog && $('.results', dialog);
  let lastFocus = null; let active = -1; let items = [];
  const ORDER = ['Sections', 'Guides', 'Fields', 'Messages', 'Analytics', 'Words', 'Pages', 'Help'];
  const highlight = (text, words) => {
    let out = ''; let i = 0; const lower = text.toLowerCase(); const marks = [];
    for (const w of words) { let p = lower.indexOf(w); while (p >= 0) { marks.push([p, p + w.length]); p = lower.indexOf(w, p + w.length); } }
    marks.sort((a, b) => a[0] - b[0]);
    for (const [a, b] of marks) { if (a < i) continue; out += esc(text.slice(i, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; i = b; }
    return out + esc(text.slice(i));
  };
  const run = (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { results.innerHTML = '<div class="no-res">Type a few words: a section, a field, a button, a message.</div>'; items = []; return; }
    const scored = [];
    for (const e of (window.AB_SEARCH || [])) {
      const t = e.t.toLowerCase(); const hay = (t + ' ' + (e.d || '') + ' ' + (e.k || '')).toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      let s = 0; if (t === words.join(' ')) s += 100; if (t.startsWith(words[0])) s += 30; if (words.every((w) => t.includes(w))) s += 20; s -= Math.min(t.length, 120) / 60;
      scored.push([s, e]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const groups = {}; for (const [, e] of scored.slice(0, 80)) (groups[e.g] ||= []).push(e);
    let html = ''; items = []; let n = 0;
    for (const g of ORDER) { if (!groups[g]) continue; html += `<div class="res-group" role="presentation">${esc(g)}</div>`; for (const e of groups[g].slice(0, 12)) { const id = `res-${n++}`; items.push({ id, url: root + e.u }); html += `<a class="res" id="${id}" role="option" aria-selected="false" href="${esc(root + e.u)}"><span class="ic" aria-hidden="true"></span><span><span class="t">${highlight(e.t, words)}</span>${e.d ? `<span class="d">${highlight(e.d, words)}</span>` : ''}</span></a>`; } }
    results.innerHTML = html || '<div class="no-res">Nothing found. Try fewer or other words.</div>';
    active = items.length ? 0 : -1; mark();
  };
  const mark = () => { $$('.res', results).forEach((r, i) => r.setAttribute('aria-selected', String(i === active))); if (active >= 0) { input.setAttribute('aria-activedescendant', items[active].id); const el = document.getElementById(items[active].id); if (el) el.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant'); };
  const openSearch = () => { if (!dialog) return; lastFocus = document.activeElement; dialog.hidden = false; dialog.classList.add('open'); input.value = ''; run(''); input.focus(); };
  const closeSearch = () => { dialog.classList.remove('open'); dialog.hidden = true; if (lastFocus) lastFocus.focus(); };
  if (dialog) {
    $$('.search-trigger').forEach((b) => b.addEventListener('click', openSearch));
    $('.search-close', dialog).addEventListener('click', closeSearch);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) closeSearch(); });
    input.addEventListener('input', () => run(input.value));
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { active = (active + 1) % items.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { active = (active - 1 + items.length) % items.length; mark(); } }
      else if (e.key === 'Enter' && active >= 0 && document.activeElement === input) { e.preventDefault(); location.href = items[active].url; }
      else if (e.key === 'Tab') { const f = $$('input, a.res, button', dialog).filter((x) => x.offsetParent !== null); if (!f.length) return; const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    });
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); if (dialog.hidden) openSearch(); }
    });
  }

  /* ---------- Glossary words ---------- */
  let pop = null;
  const hidePop = () => { if (pop) { pop.remove(); pop = null; } };
  const showPop = (el) => {
    const t = (window.AB_TERMS || {})[el.dataset.term]; if (!t) return;
    hidePop(); pop = document.createElement('div'); pop.className = 'pop'; pop.id = 'term-pop'; pop.setAttribute('role', 'tooltip');
    pop.innerHTML = `<b>${esc(t.t)}</b>${esc(t.d)}`; document.body.appendChild(pop);
    const r = el.getBoundingClientRect(); pop.style.left = Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 16) + 'px'; pop.style.top = (window.scrollY + r.bottom + 8) + 'px';
    el.setAttribute('aria-describedby', 'term-pop');
  };
  $$('.term').forEach((el) => { el.addEventListener('mouseenter', () => showPop(el)); el.addEventListener('focus', () => showPop(el)); el.addEventListener('mouseleave', () => setTimeout(() => { if (pop && !pop.matches(':hover')) hidePop(); }, 120)); el.addEventListener('blur', hidePop); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePop(); });

  /* ---------- Screenshot markers and legend ---------- */
  $$('.shot-fig').forEach((fig) => {
    const pair = (field, on) => $$(`[data-field="${CSS.escape(field)}"]`, fig).forEach((x) => x.classList.toggle('on', on));
    $$('.marker, .lg', fig).forEach((m) => { m.addEventListener('mouseenter', () => pair(m.dataset.field, true)); m.addEventListener('mouseleave', () => pair(m.dataset.field, false)); m.addEventListener('focus', () => pair(m.dataset.field, true)); m.addEventListener('blur', () => pair(m.dataset.field, false)); });
    $$('.marker', fig).forEach((m) => m.addEventListener('click', () => { const lg = $(`.lg[data-field="${CSS.escape(m.dataset.field)}"]`, fig); if (lg && lg.tagName === 'A') location.href = lg.href; }));
    const en = $('.enlarge', fig);
    if (en) en.addEventListener('click', () => {
      const box = document.createElement('div'); box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Enlarged screenshot');
      const shot = $('.shot', fig).cloneNode(true); $('.enlarge', shot)?.remove();
      box.innerHTML = '<div class="lightbox-panel"><button class="icon-btn lightbox-close" type="button" aria-label="Close">×</button></div>'; $('.lightbox-panel', box).appendChild(shot);
      document.body.appendChild(box); const close = () => { box.remove(); en.focus(); };
      $('.lightbox-close', box).addEventListener('click', close); box.addEventListener('click', (e) => { if (e.target === box) close(); }); box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }); $('.lightbox-close', box).focus();
    });
  });

  /* ---------- Copy a link ---------- */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => { const url = location.href.split('#')[0] + b.dataset.copy; const done = () => toast('Link copied'); if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => toast(url)); else toast(url); }));

  /* ---------- On this page ---------- */
  const tocLinks = $$('.toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const targets = tocLinks.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    const io = new IntersectionObserver((ents) => { ents.forEach((en) => { if (en.isIntersecting) { tocLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id)); } }); }, { rootMargin: '-80px 0px -70% 0px' });
    targets.forEach((t) => io.observe(t));
  }

  /* ---------- Left list: filter and groups ---------- */
  const nav = $('.sidenav');
  if (nav) {
    const f = $('.filter input', nav);
    if (f) f.addEventListener('input', () => { const q = f.value.trim().toLowerCase(); $$('.nav-link', nav).forEach((a) => { a.style.display = !q || a.textContent.toLowerCase().includes(q) ? '' : 'none'; }); $$('.nav-group', nav).forEach((g) => { if (q) g.dataset.open = 'true'; }); });
    $$('.nav-group > button', nav).forEach((b) => b.addEventListener('click', () => { const g = b.parentElement; const open = g.dataset.open !== 'true'; g.dataset.open = String(open); b.setAttribute('aria-expanded', String(open)); }));
  }

  /* ---------- Field filter ---------- */
  $$('.fx-filter input').forEach((inp) => {
    const table = inp.closest('.card').querySelector('table.fx'); const count = inp.closest('.fx-tools').querySelector('.fx-count'); const total = $$('tbody tr', table).length;
    inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); let n = 0; $$('tbody tr', table).forEach((tr) => { const show = !q || tr.textContent.toLowerCase().includes(q); tr.style.display = show ? '' : 'none'; if (show) n++; }); count.textContent = q ? `${n} of ${total} fields` : `${total} fields`; });
  });
  const focusRow = () => { const id = location.hash.slice(1); const tr = id && document.getElementById(id); if (tr && tr.tagName === 'TR') { $$('tr.on').forEach((x) => x.classList.remove('on')); tr.classList.add('on'); tr.focus({ preventScroll: true }); } };
  window.addEventListener('hashchange', focusRow); focusRow();

  /* ---------- Progress: "Mark as done" and the goal paths ---------- */
  const done = () => new Set(store.get('ab.done', []));
  const paint = () => {
    const d = done();
    $$('.mark-done').forEach((b) => { const on = d.has(b.dataset.page); b.setAttribute('aria-pressed', String(on)); $('span', b).textContent = on ? 'Done' : 'Mark as done'; });
    $$('.nav-link[data-page]').forEach((a) => a.classList.toggle('is-done', d.has(a.dataset.page)));
    $$('.goal').forEach((g) => {
      const steps = $$('[data-page]', g).map((x) => x.dataset.page);
      const pathSteps = steps.length ? steps : ((window.AB_PATHS || {})[g.dataset.path] || []);
      $$('li[data-page]', g).forEach((li) => li.classList.toggle('is-done', d.has(li.dataset.page)));
      const n = pathSteps.filter((p) => d.has(p)).length; const t = pathSteps.length;
      const bar = $('.meter i', g); if (bar && t) bar.style.width = Math.round((100 * n) / t) + '%';
      const txt = $('.progress-text', g); if (txt && t) txt.textContent = `${n} of ${t} done`;
    });
  };
  $$('.mark-done').forEach((b) => b.addEventListener('click', () => { const d = done(); if (d.has(b.dataset.page)) d.delete(b.dataset.page); else d.add(b.dataset.page); store.set('ab.done', [...d]); paint(); b.focus(); }));
  paint();
})();

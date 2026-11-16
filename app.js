/* Mu'tamad Hub — MKAC Local Mu'tamad dashboard
 * Plain JS. Works in local-only mode (localStorage) or synced with Supabase.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */
  const DEPARTMENTS = [
    "Mu'tamad (A'itemad)",
    "Atfal",
    "Tarbiyat",
    "Ta'lim",
    "Tabligh",
    "Umur Talaba (Student Affairs)",
    "'Umumi",
    "Waqar 'Amal",
    "Khidmat Khalq",
    "Sehat Jismani",
    "Isha'at",
    "Mal",
    "Additional Mal",
    "Muhasib",
    "Tajnid",
    "Tarbiyat Nau Mubayi'in",
    "San'at-o-Tijarat",
    "Tahrik-i-Jadid",
    "Waqf Nau Coordinator"
  ];

  const DEFAULT_LINKS = [
    { title: 'Tajneed List',          subtitle: 'Member records',        badge: 'Excel Sheet', url: '', sort_order: 1 },
    { title: 'Office Register Sheet', subtitle: 'Daily office register', badge: 'Google Sheet', url: '', sort_order: 2 },
    { title: 'Monthly Report Portal', subtitle: 'Submit your monthly report', badge: 'MKAC Markaz', url: '', sort_order: 3 }
  ];

  // No keys are stored in the code. Enter your Supabase URL and key once per device in the ⚙ Settings screen.
  const DEFAULT_SUPABASE_URL = '';
  const DEFAULT_SUPABASE_KEY = '';

  const LS = {
    url: 'mk_supabase_url',
    key: 'mk_supabase_key',
    forceLocal: 'mk_force_local',
    links: 'mk_links',
    notes: 'mk_notes',
    linksSeededLocal: 'mk_links_seeded_local',
    linksSeededRemote: 'mk_links_seeded_remote'
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    // RFC4122-style fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function dateStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; } // m is 0-11
  function todayStr() {
    const n = new Date();
    return dateStr(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function nowTime() {
    const n = new Date();
    return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  }
  function parseDate(str) {
    const [y, m, d] = String(str).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function fmtDateLong(str) {
    return parseDate(str).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function fmtDateShort(str) {
    return parseDate(str).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = String(t).split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:${pad(m || 0)} ${suffix}`;
  }
  function monthLabel(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  function monthRange(ym) {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
  }
  function normalizeUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
  }
  function errMsg(err) {
    const raw = (err && (err.message || err.error_description || err.details)) || String(err || 'Unknown error');
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(raw)) {
      return 'Tables not found. Run the SQL file in Supabase → SQL Editor first.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(raw)) {
      return 'Network error. Check your connection and your Supabase URL.';
    }
    if (/Invalid API key|JWT|apikey/i.test(raw)) {
      return 'Invalid Supabase anon key. Re-check it in Settings.';
    }
    if (/row-level security|violates row-level/i.test(raw)) {
      return 'Blocked by Row Level Security. Re-run the policies from the SQL file.';
    }
    return raw;
  }

  /* ------------------------------------------------------------------ *
   * UI feedback: toast, loader, sheets
   * ------------------------------------------------------------------ */
  function toast(message, type = 'info', ms = 3200) {
    const wrap = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 300);
    }, type === 'error' ? Math.max(ms, 5000) : ms);
  }

  let busyCount = 0;
  function setBusy(on) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    $('#topLoader').classList.toggle('hidden', busyCount === 0);
  }

  async function withButton(btn, fn) {
    if (btn) btn.disabled = true;
    setBusy(true);
    try { return await fn(); }
    finally {
      setBusy(false);
      if (btn) btn.disabled = false;
    }
  }

  function spinnerBlock(label = 'Loading…') {
    return `<div class="py-10 text-center text-neutral-500 text-sm"><div class="spinner mb-3"></div>${esc(label)}</div>`;
  }

  function errorBlock(message) {
    return `<div class="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <p class="font-semibold mb-1">Couldn't load data</p>
      <p class="text-red-700/90">${esc(message)}</p>
    </div>`;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }

  function openSheet(id) {
    const el = $(`#sheet-${id}`);
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    refreshIcons();
  }
  function closeSheets() {
    $$('.sheet-wrap').forEach((el) => {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('no-scroll');
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  const now = new Date();
  const state = {
    tab: 'links',
    links: [],
    monthNotes: [],
    viewY: now.getFullYear(),
    viewM: now.getMonth(),
    selected: todayStr(),
    reportMonth: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
    reportNotes: [],
    client: null,
    clientSig: ''
  };

  /* ------------------------------------------------------------------ *
   * Data layer (Supabase when configured, otherwise localStorage)
   * ------------------------------------------------------------------ */
  function getClient() {
    const forceLocal = localStorage.getItem(LS.forceLocal) === '1';
    const url = (localStorage.getItem(LS.url) || DEFAULT_SUPABASE_URL || '').trim();
    const key = (localStorage.getItem(LS.key) || DEFAULT_SUPABASE_KEY || '').trim();
    if (forceLocal || !url || !key) { state.client = null; state.clientSig = ''; return null; }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return null;
    const sig = `${url}|${key}`;
    if (!state.client || state.clientSig !== sig) {
      state.client = window.supabase.createClient(url, key);
      state.clientSig = sig;
    }
    return state.client;
  }

  const isRemote = () => !!getClient();

  const readLocal = (k) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; }
    catch { return []; }
  };
  const writeLocal = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const byTimeThenCreated = (a, b) =>
    (a.date || '').localeCompare(b.date || '') ||
    (a.time || '').localeCompare(b.time || '') ||
    (a.created_at || '').localeCompare(b.created_at || '');

  const api = {
    /* ---------- links ---------- */
    async listLinks() {
      const c = getClient();
      if (c) {
        const { data, error } = await c.from('links').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
        if (error) throw error;
        if (!data.length && !localStorage.getItem(LS.linksSeededRemote)) {
          const seed = DEFAULT_LINKS.map((l) => ({ id: uid(), ...l }));
          const { error: seedErr } = await c.from('links').insert(seed);
          if (seedErr) throw seedErr;
          localStorage.setItem(LS.linksSeededRemote, '1');
          return seed;
        }
        if (data.length) localStorage.setItem(LS.linksSeededRemote, '1');
        return data;
      }
      let list = readLocal(LS.links);
      if (!list.length && !localStorage.getItem(LS.linksSeededLocal)) {
        list = DEFAULT_LINKS.map((l) => ({ id: uid(), created_at: new Date().toISOString(), ...l }));
        writeLocal(LS.links, list);
        localStorage.setItem(LS.linksSeededLocal, '1');
      }
      return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    },
    async saveLink(link) {
      const c = getClient();
      if (c) {
        const { error } = await c.from('links').upsert(link);
        if (error) throw error;
        return;
      }
      const list = readLocal(LS.links);
      const i = list.findIndex((x) => x.id === link.id);
      if (i >= 0) list[i] = { ...list[i], ...link };
      else list.push({ created_at: new Date().toISOString(), ...link });
      writeLocal(LS.links, list);
    },
    async deleteLink(id) {
      const c = getClient();
      if (c) {
        const { error } = await c.from('links').delete().eq('id', id);
        if (error) throw error;
        return;
      }
      writeLocal(LS.links, readLocal(LS.links).filter((x) => x.id !== id));
    },

    /* ---------- notes ---------- */
    async listNotes(from, to) {
      const c = getClient();
      if (c) {
        const { data, error } = await c.from('notes').select('*')
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }).order('time', { ascending: true, nullsFirst: true });
        if (error) throw error;
        return data.map(normalizeNote);
      }
      return readLocal(LS.notes).filter((n) => n.date >= from && n.date <= to).sort(byTimeThenCreated);
    },
    async listAllNotes() {
      const c = getClient();
      if (c) {
        const { data, error } = await c.from('notes').select('*').order('date', { ascending: true }).order('time', { ascending: true, nullsFirst: true });
        if (error) throw error;
        return data.map(normalizeNote);
      }
      return readLocal(LS.notes).sort(byTimeThenCreated);
    },
    async saveNote(note) {
      const c = getClient();
      if (c) {
        const { error } = await c.from('notes').upsert(note);
        if (error) throw error;
        return;
      }
      const list = readLocal(LS.notes);
      const i = list.findIndex((x) => x.id === note.id);
      if (i >= 0) list[i] = { ...list[i], ...note };
      else list.push({ created_at: new Date().toISOString(), ...note });
      writeLocal(LS.notes, list);
    },
    async deleteNote(id) {
      const c = getClient();
      if (c) {
        const { error } = await c.from('notes').delete().eq('id', id);
        if (error) throw error;
        return;
      }
      writeLocal(LS.notes, readLocal(LS.notes).filter((x) => x.id !== id));
    }
  };

  function normalizeNote(n) {
    return { ...n, time: n.time ? String(n.time).slice(0, 5) : '' };
  }

  /* ------------------------------------------------------------------ *
   * Sync status UI
   * ------------------------------------------------------------------ */
  function refreshSyncUI() {
    const remote = isRemote();
    const pill = $('#syncPill');
    pill.className = `sync-pill ${remote ? 'sync-synced' : 'sync-local'}`;
    pill.innerHTML = `<i data-lucide="${remote ? 'cloud' : 'cloud-off'}" class="w-3.5 h-3.5"></i><span>${remote ? 'Synced' : 'Local'}</span>`;
    $('#syncBanner').classList.toggle('hidden', remote);
    refreshIcons();
  }

  /* ------------------------------------------------------------------ *
   * Tabs
   * ------------------------------------------------------------------ */
  function switchTab(tab) {
    state.tab = tab;
    $$('.tab-panel').forEach((p) => p.classList.add('hidden'));
    $(`#tab-${tab}`).classList.remove('hidden');
    $$('.nav-btn').forEach((b) => b.classList.toggle('nav-active', b.dataset.tab === tab));
    window.scrollTo({ top: 0 });
    if (tab === 'links') loadLinks();
    if (tab === 'notes') loadMonth();
    if (tab === 'report') loadReport();
  }

  /* ------------------------------------------------------------------ *
   * TAB 1 — Quick links
   * ------------------------------------------------------------------ */
  function badgeStyle(badge) {
    const b = String(badge || '').toLowerCase();
    if (b.includes('excel')) return { cls: 'badge-green', icon: 'file-spreadsheet' };
    if (b.includes('google')) return { cls: 'badge-blue', icon: 'file-spreadsheet' };
    if (b.includes('portal') || b.includes('markaz') || b.includes('website')) return { cls: 'badge-amber', icon: 'globe' };
    if (b.includes('pdf') || b.includes('doc')) return { cls: 'badge-slate', icon: 'file-text' };
    return { cls: 'badge-slate', icon: 'link' };
  }

  async function loadLinks() {
    const el = $('#linksList');
    el.innerHTML = spinnerBlock('Loading links…');
    setBusy(true);
    try {
      state.links = await api.listLinks();
      renderLinks();
    } catch (err) {
      el.innerHTML = errorBlock(errMsg(err));
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderLinks() {
    const el = $('#linksList');
    if (!state.links.length) {
      el.innerHTML = `<div class="card p-6 text-center text-neutral-500 text-sm">No links yet. Tap <b class="text-neutral-800">Add New Link</b> to create one.</div>`;
      return;
    }
    el.innerHTML = state.links.map((l) => {
      const st = badgeStyle(l.badge);
      const hasUrl = !!l.url;
      const inner = `
        <div class="link-icon"><i data-lucide="${st.icon}" class="w-6 h-6"></i></div>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-neutral-900 truncate">${esc(l.title)}</p>
          ${l.subtitle ? `<p class="text-xs text-neutral-500 truncate mt-0.5">${esc(l.subtitle)}</p>` : ''}
          <div class="mt-1.5 flex items-center gap-2">
            ${l.badge ? `<span class="badge ${st.cls}">${esc(l.badge)}</span>` : ''}
            ${hasUrl ? '' : `<span class="text-[11px] text-red-700">Tap to add URL</span>`}
          </div>
        </div>
        ${hasUrl ? `<i data-lucide="external-link" class="w-4 h-4 text-neutral-500 shrink-0"></i>` : ''}`;
      const main = hasUrl
        ? `<a class="link-main" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : `<button type="button" class="link-main" data-action="edit-link" data-id="${esc(l.id)}">${inner}</button>`;
      return `
        <div class="card flex items-center pr-1">
          ${main}
          <div class="flex items-center shrink-0">
            <button class="icon-btn" data-action="edit-link" data-id="${esc(l.id)}" aria-label="Edit link"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button class="icon-btn danger" data-action="delete-link" data-id="${esc(l.id)}" aria-label="Delete link"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>`;
    }).join('');
    refreshIcons();
  }

  function openLinkSheet(id) {
    const link = id ? state.links.find((l) => l.id === id) : null;
    $('#linkSheetTitle').textContent = link ? 'Edit Link' : 'Add New Link';
    $('#linkId').value = link ? link.id : '';
    $('#linkTitle').value = link ? link.title : '';
    $('#linkSubtitle').value = link ? link.subtitle || '' : '';
    $('#linkBadge').value = link ? link.badge || '' : '';
    $('#linkUrl').value = link ? link.url || '' : '';
    openSheet('link');
    setTimeout(() => (link && !link.url ? $('#linkUrl') : $('#linkTitle')).focus(), 300);
  }

  async function submitLink(e) {
    e.preventDefault();
    const title = $('#linkTitle').value.trim();
    if (!title) { toast('Please enter a title.', 'error'); return; }
    const id = $('#linkId').value || uid();
    const existing = state.links.find((l) => l.id === id);
    const maxOrder = state.links.reduce((mx, l) => Math.max(mx, l.sort_order || 0), 0);
    const payload = {
      id,
      title,
      subtitle: $('#linkSubtitle').value.trim(),
      badge: $('#linkBadge').value.trim(),
      url: normalizeUrl($('#linkUrl').value),
      sort_order: existing ? existing.sort_order || 0 : maxOrder + 1
    };
    try {
      await withButton(e.submitter || $('#linkForm button[type="submit"]'), () => api.saveLink(payload));
      toast(existing ? 'Link updated' : 'Link added', 'success');
      closeSheets();
      await loadLinks();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  async function deleteLink(id) {
    const link = state.links.find((l) => l.id === id);
    if (!link || !confirm(`Delete "${link.title}"?`)) return;
    try {
      await withButton(null, () => api.deleteLink(id));
      toast('Link deleted', 'success');
      await loadLinks();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  /* ------------------------------------------------------------------ *
   * TAB 2 — Notes & calendar
   * ------------------------------------------------------------------ */
  async function loadMonth() {
    const { viewY: y, viewM: m } = state;
    renderCalendar();
    $('#dayNotes').innerHTML = spinnerBlock('Loading entries…');
    setBusy(true);
    try {
      const ym = `${y}-${pad(m + 1)}`;
      const { from, to } = monthRange(ym);
      state.monthNotes = await api.listNotes(from, to);
      renderCalendar();
      renderDay();
    } catch (err) {
      state.monthNotes = [];
      renderCalendar();
      $('#dayNotes').innerHTML = errorBlock(errMsg(err));
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderCalendar() {
    const { viewY: y, viewM: m } = state;
    $('#calTitle').textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const counts = {};
    state.monthNotes.forEach((n) => { counts[n.date] = (counts[n.date] || 0) + 1; });
    const today = todayStr();

    let html = '';
    for (let i = 0; i < firstDow; i++) html += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const ds = dateStr(y, m, d);
      const cls = ['cal-day', ds === state.selected ? 'is-selected' : '', ds === today ? 'is-today' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-action="select-day" data-date="${ds}" aria-label="${esc(fmtDateLong(ds))}${counts[ds] ? `, ${counts[ds]} entries` : ''}">
        <span>${d}</span>${counts[ds] ? '<i class="dot"></i>' : '<i class="dot-spacer"></i>'}
      </button>`;
    }
    $('#calGrid').innerHTML = html;
  }

  function renderDay() {
    const ds = state.selected;
    $('#dayTitle').textContent = fmtDateLong(ds);
    $('#addEntryLabel').textContent = `Add Entry for ${fmtDateShort(ds)}`;
    const notes = state.monthNotes.filter((n) => n.date === ds).sort(byTimeThenCreated);
    $('#dayCount').textContent = notes.length ? `${notes.length} ${notes.length === 1 ? 'entry' : 'entries'}` : '';

    const el = $('#dayNotes');
    if (!notes.length) {
      el.innerHTML = `<div class="card p-5 text-center text-sm text-neutral-500">No entries for this day yet.</div>`;
      refreshIcons();
      return;
    }
    el.innerHTML = notes.map((n) => `
      <article class="card p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-1">
              ${n.time ? `<span class="text-xs font-semibold text-red-700">${esc(fmtTime(n.time))}</span>` : ''}
              ${n.department ? `<span class="badge badge-green">${esc(n.department)}</span>` : ''}
            </div>
            <h4 class="font-semibold text-neutral-900">${esc(n.title)}</h4>
          </div>
          <div class="flex shrink-0 -mr-2 -mt-2">
            <button class="icon-btn" data-action="edit-note" data-id="${esc(n.id)}" aria-label="Edit entry"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button class="icon-btn danger" data-action="delete-note" data-id="${esc(n.id)}" aria-label="Delete entry"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>
        ${n.description ? `<p class="text-sm text-neutral-700 mt-2 pre-wrap">${esc(n.description)}</p>` : ''}
        ${n.extra_notes ? `<div class="mt-3 rounded-xl bg-red-50 border border-red-200 p-3">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-1">Extra notes</p>
            <p class="text-sm text-neutral-700 pre-wrap">${esc(n.extra_notes)}</p>
          </div>` : ''}
      </article>`).join('');
    refreshIcons();
  }

  function selectDay(ds) {
    state.selected = ds;
    renderCalendar();
    renderDay();
  }

  function changeMonth(delta) {
    let m = state.viewM + delta;
    let y = state.viewY;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    state.viewM = m;
    state.viewY = y;
    const t = new Date();
    state.selected = (y === t.getFullYear() && m === t.getMonth()) ? todayStr() : dateStr(y, m, 1);
    loadMonth();
  }

  function goToday() {
    const t = new Date();
    const sameMonth = state.viewY === t.getFullYear() && state.viewM === t.getMonth();
    state.viewY = t.getFullYear();
    state.viewM = t.getMonth();
    state.selected = todayStr();
    if (sameMonth) { renderCalendar(); renderDay(); } else { loadMonth(); }
  }

  function openNoteSheet(id) {
    const note = id ? state.monthNotes.find((n) => n.id === id) : null;
    const date = note ? note.date : state.selected;
    $('#noteSheetTitle').textContent = note ? 'Edit Entry' : 'New Entry';
    $('#noteSheetDate').textContent = fmtDateLong(date);
    $('#noteId').value = note ? note.id : '';
    $('#noteDate').value = date;
    $('#noteTitle').value = note ? note.title : '';
    $('#noteTime').value = note ? note.time || '' : nowTime();
    $('#noteDept').value = note && note.department ? note.department : DEPARTMENTS[0];
    $('#noteDesc').value = note ? note.description || '' : '';
    $('#noteExtra').value = note ? note.extra_notes || '' : '';
    openSheet('note');
    setTimeout(() => $('#noteTitle').focus(), 300);
  }

  async function submitNote(e) {
    e.preventDefault();
    const title = $('#noteTitle').value.trim();
    if (!title) { toast('Please enter a title.', 'error'); return; }
    const id = $('#noteId').value || uid();
    const isEdit = !!$('#noteId').value;
    const payload = {
      id,
      date: $('#noteDate').value,
      title,
      time: $('#noteTime').value || null,
      department: $('#noteDept').value,
      description: $('#noteDesc').value.trim(),
      extra_notes: $('#noteExtra').value.trim(),
      updated_at: new Date().toISOString()
    };
    try {
      await withButton(e.submitter || $('#noteForm button[type="submit"]'), () => api.saveNote(payload));
      toast(isEdit ? 'Entry updated' : 'Entry saved', 'success');
      closeSheets();
      await loadMonth();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  async function deleteNote(id) {
    const note = state.monthNotes.find((n) => n.id === id);
    if (!note || !confirm(`Delete "${note.title}"?`)) return;
    try {
      await withButton(null, () => api.deleteNote(id));
      toast('Entry deleted', 'success');
      await loadMonth();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  /* ------------------------------------------------------------------ *
   * TAB 3 — Monthly report helper
   * ------------------------------------------------------------------ */
  function buildMonthOptions() {
    const sel = $('#reportMonth');
    const t = new Date();
    let html = '';
    for (let i = -12; i <= 1; i++) {
      const d = new Date(t.getFullYear(), t.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      html = `<option value="${ym}">${esc(monthLabel(ym))}</option>` + html;
    }
    sel.innerHTML = html;
    sel.value = state.reportMonth;
  }

  function dueDateText(ym) {
    const [y, m] = ym.split('-').map(Number);
    const due = new Date(y, m, 5); // 5th of next month
    return `Report due by ${due.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }

  function groupByDepartment(notes) {
    const map = new Map(DEPARTMENTS.map((d) => [d, []]));
    const other = [];
    notes.forEach((n) => {
      if (map.has(n.department)) map.get(n.department).push(n);
      else other.push(n);
    });
    const groups = DEPARTMENTS.filter((d) => map.get(d).length).map((d) => ({ dept: d, items: map.get(d).sort(byTimeThenCreated) }));
    if (other.length) groups.push({ dept: 'Unassigned', items: other.sort(byTimeThenCreated) });
    return groups;
  }

  async function loadReport() {
    $('#reportDue').textContent = dueDateText(state.reportMonth);
    $('#reportSummary').innerHTML = '';
    $('#reportBody').innerHTML = spinnerBlock('Building report…');
    setBusy(true);
    try {
      const { from, to } = monthRange(state.reportMonth);
      state.reportNotes = await api.listNotes(from, to);
      renderReport();
    } catch (err) {
      state.reportNotes = [];
      $('#reportBody').innerHTML = errorBlock(errMsg(err));
      toast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderReport() {
    const notes = state.reportNotes;
    const groups = groupByDepartment(notes);
    const summary = $('#reportSummary');
    const body = $('#reportBody');

    if (!notes.length) {
      summary.innerHTML = '';
      body.innerHTML = `<div class="card p-6 text-center text-sm text-neutral-500">No entries logged for ${esc(monthLabel(state.reportMonth))}.</div>`;
      return;
    }

    const used = new Set(groups.map((g) => g.dept));
    const missing = DEPARTMENTS.filter((d) => !used.has(d));
    summary.innerHTML = `
      <div class="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
        <p class="text-red-700 font-semibold">${notes.length} ${notes.length === 1 ? 'entry' : 'entries'} across ${groups.length} ${groups.length === 1 ? 'department' : 'departments'}</p>
        ${missing.length ? `<p class="text-neutral-500 mt-1"><span class="text-neutral-700">No activity logged:</span> ${esc(missing.join(', '))}</p>` : ''}
      </div>`;

    body.innerHTML = groups.map((g) => `
      <section class="dept-block">
        <div class="dept-head">
          <h3 class="font-semibold text-red-700">${esc(g.dept)}</h3>
          <span class="text-xs text-neutral-500">${g.items.length}</span>
        </div>
        ${g.items.map((n) => `
          <div class="report-item">
            <div class="flex items-center gap-2 text-xs text-neutral-500 mb-1">
              <span>${esc(fmtDateShort(n.date))}</span>${n.time ? `<span>·</span><span>${esc(fmtTime(n.time))}</span>` : ''}
            </div>
            <p class="font-medium text-neutral-900">${esc(n.title)}</p>
            ${n.description ? `<p class="text-sm text-neutral-700 mt-1 pre-wrap">${esc(n.description)}</p>` : ''}
            ${n.extra_notes ? `<p class="text-sm text-neutral-700 mt-2 pre-wrap"><span class="font-semibold text-red-700">Notes:</span> ${esc(n.extra_notes)}</p>` : ''}
          </div>`).join('')}
      </section>`).join('');
  }

  function buildReportText() {
    const groups = groupByDepartment(state.reportNotes);
    const lines = [];
    lines.push(`MKAC MONTHLY MU'TAMAD REPORT — ${monthLabel(state.reportMonth)}`);
    lines.push(dueDateText(state.reportMonth));
    lines.push(`Total entries: ${state.reportNotes.length}`);
    lines.push('');
    groups.forEach((g) => {
      lines.push(`■ ${g.dept} (${g.items.length})`);
      g.items.forEach((n) => {
        const when = [fmtDateShort(n.date), n.time ? fmtTime(n.time) : ''].filter(Boolean).join(', ');
        lines.push(`• ${when} — ${n.title}`);
        if (n.description) lines.push(`  Details: ${n.description.replace(/\n/g, '\n           ')}`);
        if (n.extra_notes) lines.push(`  Notes: ${n.extra_notes.replace(/\n/g, '\n         ')}`);
      });
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('Copy not supported on this browser');
  }

  async function copyReport() {
    if (!state.reportNotes.length) { toast('Nothing to copy for this month.', 'error'); return; }
    try {
      await copyText(buildReportText());
      toast('Report copied to clipboard', 'success');
    } catch (err) {
      toast(`Couldn't copy: ${errMsg(err)}`, 'error');
    }
  }

  async function exportJson() {
    try {
      setBusy(true);
      const [links, notes] = await Promise.all([api.listLinks(), api.listAllNotes()]);
      const data = {
        app: "Mu'tamad Hub",
        exported_at: new Date().toISOString(),
        links,
        notes
      };
      const name = `mkac-backup-${todayStr()}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

      // iOS standalone apps often can't download blobs; use the share sheet when available.
      try {
        const file = new File([blob], name, { type: 'application/json' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          toast('Backup ready', 'success');
          return;
        }
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') return;
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Backup downloaded', 'success');
    } catch (err) {
      toast(`Export failed: ${errMsg(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ *
   * Settings
   * ------------------------------------------------------------------ */
  function openSettings() {
    $('#setUrl').value = localStorage.getItem(LS.url) || DEFAULT_SUPABASE_URL || '';
    $('#setKey').value = localStorage.getItem(LS.key) || DEFAULT_SUPABASE_KEY || '';
    $('#settingsStatus').textContent = isRemote() ? 'Status: connected to Supabase.' : 'Status: local-only mode.';
    openSheet('settings');
  }

  async function saveSettings(e) {
    e.preventDefault();
    const url = $('#setUrl').value.trim().replace(/\/+$/, '');
    const key = $('#setKey').value.trim();
    const status = $('#settingsStatus');

    if (!url && !key) { clearKeys(); return; }
    if (!/^https:\/\/.+\.supabase\.(co|in)$/i.test(url) && !/^https?:\/\/.+/i.test(url)) {
      status.textContent = 'That URL doesn\'t look right. It should look like https://xxxx.supabase.co';
      toast('Check your Supabase URL', 'error');
      return;
    }
    if (!key) { status.textContent = 'Please paste your anon key.'; toast('Anon key is missing', 'error'); return; }

    const prevUrl = localStorage.getItem(LS.url);
    const prevKey = localStorage.getItem(LS.key);
    const prevForce = localStorage.getItem(LS.forceLocal);
    localStorage.setItem(LS.url, url);
    localStorage.setItem(LS.key, key);
    localStorage.removeItem(LS.forceLocal);
    status.textContent = 'Testing connection…';

    try {
      await withButton(e.submitter || $('#settingsForm button[type="submit"]'), async () => {
        const c = getClient();
        if (!c) throw new Error('Supabase library failed to load. Check your internet connection and reload.');
        const [a, b] = await Promise.all([
          c.from('links').select('id', { head: true, count: 'exact' }),
          c.from('notes').select('id', { head: true, count: 'exact' })
        ]);
        if (a.error) throw a.error;
        if (b.error) throw b.error;
      });
      status.textContent = 'Connected to Supabase ✔';
      toast('Supabase connected', 'success');
      refreshSyncUI();
      closeSheets();
      refreshCurrentTab();
    } catch (err) {
      // roll back to previous settings so the app keeps working
      if (prevUrl) localStorage.setItem(LS.url, prevUrl); else localStorage.removeItem(LS.url);
      if (prevKey) localStorage.setItem(LS.key, prevKey); else localStorage.removeItem(LS.key);
      if (prevForce) localStorage.setItem(LS.forceLocal, prevForce); else localStorage.removeItem(LS.forceLocal);
      state.client = null; state.clientSig = '';
      status.textContent = `Connection failed: ${errMsg(err)}`;
      toast(errMsg(err), 'error');
      refreshSyncUI();
    }
  }

  function clearKeys() {
    localStorage.removeItem(LS.url);
    localStorage.removeItem(LS.key);
    localStorage.setItem(LS.forceLocal, '1'); // keeps the built-in defaults from reconnecting
    state.client = null;
    state.clientSig = '';
    $('#setUrl').value = '';
    $('#setKey').value = '';
    refreshSyncUI();
    closeSheets();
    toast('Switched to local-only mode', 'success');
    refreshCurrentTab();
  }

  async function uploadLocal() {
    const c = getClient();
    if (!c) { toast('Save your Supabase URL and key first.', 'error'); return; }
    const links = readLocal(LS.links).map(({ id, title, subtitle, badge, url, sort_order }) => ({ id, title, subtitle, badge, url, sort_order }));
    const notes = readLocal(LS.notes).map(({ id, date, title, time, department, description, extra_notes }) => ({ id, date, title, time: time || null, department, description, extra_notes }));
    if (!links.length && !notes.length) { toast('No local data to upload.', 'error'); return; }
    try {
      await withButton($('#uploadLocal'), async () => {
        if (links.length) { const { error } = await c.from('links').upsert(links); if (error) throw error; }
        if (notes.length) { const { error } = await c.from('notes').upsert(notes); if (error) throw error; }
      });
      localStorage.setItem(LS.linksSeededRemote, '1');
      toast(`Uploaded ${links.length} links and ${notes.length} entries`, 'success');
      refreshCurrentTab();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }

  function refreshCurrentTab() {
    if (state.tab === 'links') loadLinks();
    if (state.tab === 'notes') loadMonth();
    if (state.tab === 'report') loadReport();
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */
  function bindEvents() {
    // Delegated click handling
    document.addEventListener('click', (e) => {
      const closeEl = e.target.closest('[data-close-sheet]');
      if (closeEl) { closeSheets(); return; }

      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }

      const act = e.target.closest('[data-action]');
      if (!act) return;
      const id = act.dataset.id;

      switch (act.dataset.action) {
        case 'open-settings': openSettings(); break;
        case 'add-link': openLinkSheet(null); break;
        case 'edit-link': openLinkSheet(id); break;
        case 'delete-link': deleteLink(id); break;
        case 'cal-prev': changeMonth(-1); break;
        case 'cal-next': changeMonth(1); break;
        case 'cal-today': goToday(); break;
        case 'select-day': selectDay(act.dataset.date); break;
        case 'add-note': openNoteSheet(null); break;
        case 'edit-note': openNoteSheet(id); break;
        case 'delete-note': deleteNote(id); break;
        case 'copy-report': copyReport(); break;
        case 'export-json': exportJson(); break;
        default: break;
      }
    });

    $('#openSettings').addEventListener('click', openSettings);
    $('#settingsForm').addEventListener('submit', saveSettings);
    $('#clearKeys').addEventListener('click', clearKeys);
    $('#uploadLocal').addEventListener('click', uploadLocal);
    $('#linkForm').addEventListener('submit', submitLink);
    $('#noteForm').addEventListener('submit', submitNote);

    $('#reportMonth').addEventListener('change', (e) => {
      state.reportMonth = e.target.value;
      loadReport();
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });
  }

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */
  function init() {
    $('#noteDept').innerHTML = DEPARTMENTS.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    buildMonthOptions();
    bindEvents();
    refreshSyncUI();
    refreshIcons();
    loadLinks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
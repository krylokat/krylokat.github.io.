/* Общие элементы интерфейса: форматирование, метки статусов, иконки, модальные окна, сообщения. */
(function () {
  'use strict';
  const A = () => window.PozhApi;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
  function fmtDate(d, full) {
    if (!d) return '—';
    const x = new Date(d.length === 10 ? d + 'T12:00:00' : d);
    if (full) return String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0') + '.' + x.getFullYear();
    const sameYear = x.getFullYear() === new Date().getFullYear();
    return x.getDate() + ' ' + MONTHS[x.getMonth()] + (sameYear ? '' : ' ' + x.getFullYear());
  }
  function fmtDT(iso) {
    if (!iso) return '—';
    const x = new Date(iso);
    const hm = String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0');
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const dd = new Date(x); dd.setHours(0, 0, 0, 0);
    const diff = Math.round((t - dd) / 86400000);
    if (diff === 0) return 'сегодня, ' + hm;
    if (diff === 1) return 'вчера, ' + hm;
    return fmtDate(iso) + ', ' + hm;
  }
  function fmtSize(b) {
    if (b == null) return '—';
    if (b < 1024) return b + ' Б';
    if (b < 1048576) return Math.round(b / 1024) + ' КБ';
    return (b / 1048576).toFixed(1).replace('.', ',') + ' МБ';
  }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  function badge(pair, extraCls) { return pair ? '<span class="badge ' + pair[1] + ' ' + (extraCls || '') + '">' + esc(pair[0]) + '</span>' : ''; }
  function stageBadge(s) { return badge(A().STAGE_STATE[A().stageState(s)]); }
  function deadlineText(s) {
    if (!s.deadline) return '—';
    if (s.status === 'accepted') return '<span class="muted">' + fmtDate(s.deadline) + '</span>';
    const d = A().daysTo(s.deadline);
    if (d < 0 && A().projectOf(s).status !== 'draft') return '<span class="red"><b>' + fmtDate(s.deadline) + '</b><br><span class="xs">просрочен на ' + (-d) + ' ' + plural(-d, 'день', 'дня', 'дней') + '</span></span>';
    if (d === 0) return '<span class="amber"><b>' + fmtDate(s.deadline) + '</b><br><span class="xs">сегодня</span></span>';
    if (d <= 3) return '<span class="amber">' + fmtDate(s.deadline) + '<br><span class="xs">через ' + d + ' ' + plural(d, 'день', 'дня', 'дней') + '</span></span>';
    return fmtDate(s.deadline) + '<br><span class="xs muted">через ' + d + ' ' + plural(d, 'день', 'дня', 'дней') + '</span>';
  }
  function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }

  /* ---------- Иконки (единый стиль, линии 1.8px) ---------- */
  const P = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    chat: '<path d="M4 5h16v11H8l-4 4z"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    building: '<path d="M4 21V5l8-2v18M12 9h8v12M4 21h16M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.5 3 5.2"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
    log: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5.8 1.5 1.5 2 2.5 2.5C11.5 8 11 6 12 3z"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
  };
  function icon(name, size) {
    const s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }

  /* ---------- Сообщения ---------- */
  function alertBox(type, html) {
    const ic = { info: 'info', warn: 'warn', err: 'warn', ok: 'ok' }[type];
    return '<div class="alert ' + type + '" role="' + (type === 'err' ? 'alert' : 'status') + '">' + icon(ic) + '<div>' + html + '</div></div>';
  }
  function toast(msg, type) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.innerHTML = alertBox(type || 'ok', esc(msg));
    const a = el.firstChild; a.classList.add('toast');
    box.appendChild(a);
    setTimeout(() => a.remove(), type === 'err' ? 6500 : 4000);
  }

  /* ---------- Модальные окна ---------- */
  function modal(opts) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="modal-head"><div><h2>' + esc(opts.title) + '</h2>' + (opts.subtitle ? '<p>' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
      '<button class="icon-btn" data-close aria-label="Закрыть">' + icon('close') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.foot !== false ? '<div class="modal-foot">' + (opts.footNote ? '<div class="why">' + opts.footNote + '</div>' : '') +
        '<button class="btn" data-close>' + esc(opts.cancelLabel || 'Отмена') + '</button>' +
        (opts.okLabel ? '<button class="btn ' + (opts.okClass || 'primary') + '" data-ok>' + esc(opts.okLabel) + '</button>' : '') + '</div>' : '') +
      '</div>';
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    const ok = back.querySelector('[data-ok]');
    if (ok && opts.onOk) ok.addEventListener('click', async () => {
      try { const r = await opts.onOk(back.querySelector('.modal'), close); if (r !== false) close(); }
      catch (e) { handleError(e, back.querySelector('.modal')); }
    });
    const first = back.querySelector('input:not([type=hidden]), textarea, select');
    setTimeout(() => (first || ok || back.querySelector('[data-close]')).focus(), 30);
    if (opts.onMount) opts.onMount(back.querySelector('.modal'), close);
    return { el: back.querySelector('.modal'), close };
  }
  function confirmDlg(title, text, okLabel, okClass, extraBody) {
    return new Promise(resolve => {
      let done = false;
      modal({
        title, body: '<p style="margin-top:0">' + text + '</p>' + (extraBody || ''), okLabel: okLabel || 'Подтвердить', okClass: okClass || 'primary',
        onOk: (m) => { done = true; const inp = m.querySelector('[name=reason]'); resolve(inp ? { reason: inp.value } : true); },
        onClose: () => { if (!done) resolve(false); }
      });
    });
  }

  /* ---------- Формы ---------- */
  function readForm(root) {
    const o = {};
    root.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') {
        if (el.dataset.multi) { o[el.name] = o[el.name] || []; if (el.checked) o[el.name].push(el.value); }
        else o[el.name] = el.checked;
      } else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.type === 'file') o[el.name] = el.files && el.files[0] || null;
      else o[el.name] = el.value;
    });
    return o;
  }
  function clearErrors(root) {
    root.querySelectorAll('.ferr[data-gen]').forEach(e => e.remove());
    root.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
    const top = root.querySelector('.form-top-err'); if (top) top.innerHTML = '';
  }
  function showErrors(root, err) {
    clearErrors(root);
    const top = root.querySelector('.form-top-err');
    if (top) top.innerHTML = alertBox('err', esc(err.message));
    if (err.fields) {
      Object.keys(err.fields).forEach(k => {
        if (!err.fields[k]) return;
        const el = root.querySelector('[name="' + k + '"]') || root.querySelector('[data-field="' + k + '"]');
        if (!el) return;
        el.classList.add('invalid');
        const d = document.createElement('div'); d.className = 'ferr'; d.dataset.gen = '1'; d.textContent = err.fields[k];
        const host = el.closest('label.f') || el.parentElement;
        host.appendChild(d);
      });
    }
    if (!top) toast(err.message, 'err');
  }
  function handleError(e, root) {
    if (e && e.isApi) { if (root) showErrors(root, e); else toast(e.message, 'err'); }
    else { console.error(e); toast('Не удалось выполнить действие. Обновите страницу и повторите попытку.', 'err'); }
  }
  function field(label, inner, opts) {
    opts = opts || {};
    return '<label class="f ' + (opts.cls || '') + '"><span>' + esc(label) + (opts.req ? ' <span class="req" aria-label="обязательное">*</span>' : '') + '</span>' + inner +
      (opts.hint ? '<div class="hint">' + opts.hint + '</div>' : '') + '</label>';
  }
  function options(list, selected, emptyLabel) {
    return (emptyLabel != null ? '<option value="">' + esc(emptyLabel) + '</option>' : '') +
      list.map(o => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  }

  /* ---------- Таблица с сортировкой и пагинацией ---------- */
  function paginate(list, page, size) {
    const pages = Math.max(1, Math.ceil(list.length / size));
    const p = Math.min(Math.max(1, page || 1), pages);
    return { items: list.slice((p - 1) * size, p * size), page: p, pages, total: list.length };
  }
  function pagerHtml(pg, label) {
    if (pg.total === 0) return '';
    let btns = '';
    for (let i = 1; i <= pg.pages; i++) btns += '<button class="btn sm ' + (i === pg.page ? 'cur' : '') + '" data-page="' + i + '" aria-label="Страница ' + i + '">' + i + '</button>';
    return '<div class="pager"><span class="muted small">' + (label || 'Записей') + ': ' + pg.total + '</span><div class="pages">' + (pg.pages > 1 ? btns : '') + '</div></div>';
  }
  function emptyState(title, text, btn) {
    return '<div class="empty"><b>' + esc(title) + '</b>' + (text ? '<div>' + text + '</div>' : '') + (btn ? '<div style="margin-top:12px">' + btn + '</div>' : '') + '</div>';
  }

  /* ---------- Файлы ---------- */
  async function downloadVersion(versionId) {
    try {
      const f = await A().getVersionFile(versionId);
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (f.demo) toast('Скачан демонстрационный файл: реальный файл для демо-записи не загружался', 'ok');
    } catch (e) { handleError(e); }
  }
  async function openVersion(versionId) {
    try {
      const v = A().find('versions', versionId);
      if (v.ext !== 'pdf') {
        modal({
          title: v.fileName, body: alertBox('info', 'Встроенный просмотр поддерживается только для PDF. Файлы ' + v.ext.toUpperCase() + ' скачиваются и открываются во внешней программе' + (['dwg', 'dxf'].includes(v.ext) ? ' (CAD: AutoCAD, nanoCAD и т. п.)' : '') + '.'),
          okLabel: 'Скачать', onOk: () => downloadVersion(versionId)
        });
        return;
      }
      const f = await A().getVersionFile(versionId);
      const url = URL.createObjectURL(f.blob);
      modal({ title: v.fileName, subtitle: 'Версия ' + v.no + (f.demo ? ' · демонстрационный файл' : ''), wide: true, body: '<iframe class="pdf-view" src="' + url + '" title="Просмотр PDF"></iframe>', okLabel: 'Скачать', onOk: () => downloadVersion(versionId), onClose: () => URL.revokeObjectURL(url) });
    } catch (e) { handleError(e); }
  }

  window.UI = {
    esc, fmtDate, fmtDT, fmtSize, plural, badge, stageBadge, deadlineText, initials, icon, alertBox, toast, modal, confirmDlg,
    readForm, clearErrors, showErrors, handleError, field, options, paginate, pagerHtml, emptyState, downloadVersion, openVersion
  };
})();

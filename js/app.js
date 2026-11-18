/* Маршрутизация, каркас страниц (боковая панель, верхняя панель) и запуск приложения. */
(function () {
  'use strict';
  const A = window.PozhApi, S = window.PozhStore;
  const { esc, icon, badge } = window.UI;
  const Views = window.Views = window.Views || {};

  const ROUTES = [
    ['/login', 'login', true], ['/', 'dashboard'], ['/projects', 'projects'], ['/projects/new', 'projectForm'],
    ['/project/:id', 'project'], ['/project/:id/edit', 'projectForm'], ['/stage/:id', 'stage'], ['/tasks', 'tasks'],
    ['/reviews', 'reviews'], ['/remarks', 'remarks'], ['/remark/:id', 'remark'], ['/documents', 'documents'],
    ['/clients', 'clients'], ['/users', 'users'], ['/ai', 'ai'], ['/ai-archive', 'aiArchive'], ['/reports', 'reports'],
    ['/audit', 'auditLog'], ['/notifications', 'notifications'], ['/profile', 'profile'], ['/search', 'search']
  ];

  class Forbidden extends Error { constructor(msg) { super(msg || 'Доступ запрещён'); this.forbidden = true; } }
  class NotFound extends Error { constructor(msg) { super(msg || 'Страница не найдена'); this.notFound = true; } }

  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const query = {};
    (qs || '').split('&').filter(Boolean).forEach(p => { const [k, v] = p.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    for (const [pattern, view, pub] of ROUTES) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '(\\d+)'; }) + '$');
      const m = path.match(re);
      if (m) { const params = {}; keys.forEach((k, i) => { params[k] = Number(m[i + 1]); }); return { path, view, pub, params, query }; }
    }
    return { path, view: null, params: {}, query };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function setQuery(patch) {
    const r = parseHash();
    const q = Object.assign({}, r.query, patch);
    const qs = Object.keys(q).filter(k => q[k] !== '' && q[k] != null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&');
    go('#' + r.path + (qs ? '?' + qs : ''));
  }

  /* ---------- Меню по ролям (п. 3.3 ТЗ и таблица 4 дизайна) ---------- */
  function menuFor(u) {
    const role = u.role;
    const isReviewer = S.db.stages.some(s => s.reviewerId === u.id);
    const items = [['#/', 'home', 'Главная', 'dashboard'], ['#/projects', 'folder', 'Проекты', 'projects']];
    if (['gip', 'designer', 'calculator', 'estimator', 'manager'].includes(role)) items.push(['#/tasks', 'tasks', 'Задачи', 'tasks', countTasks(u)]);
    if (['director', 'gip', 'expert'].includes(role) || isReviewer) items.push(['#/reviews', 'check', 'Проверки', 'reviews', countReviews(u)]);
    items.push(['#/remarks', 'chat', 'Замечания', 'remarks', countRemarks(u)]);
    items.push(['#/documents', 'file', 'Документы', 'documents']);
    if (role === 'director' || role === 'gip' || u.canManageClients) items.push(['#/clients', 'building', 'Клиенты', 'clients']);
    if (A.canManageUsers(u)) items.push(['#/users', 'users', 'Сотрудники', 'users']);
    if (role !== 'director') items.push(['#/ai', 'spark', 'ИИ-помощник', 'ai']);
    if (A.canManageAiArchive(u)) items.push(['#/ai-archive', 'archive', 'Архив ИИ', 'aiArchive', S.db.aiArchive.filter(a => a.status === 'pending').length]);
    if (['director', 'gip'].includes(role)) items.push(['#/reports', 'chart', 'Отчёты', 'reports']);
    if (role === 'director') items.push(['#/audit', 'log', 'Журнал аудита', 'auditLog']);
    items.push(null);
    items.push(['#/notifications', 'bell', 'Уведомления', 'notifications', A.myNotifications().filter(n => !n.readAt).length]);
    items.push(['#/profile', 'user', 'Профиль', 'profile']);
    return items;
  }
  function countReviews(u) { return S.db.stages.filter(s => s.reviewerId === u.id && A.stageState(s) === 'review').length; }
  function countTasks(u) { return S.db.stages.filter(s => s.executorId === u.id && A.stageState(s) === 'rework').length; }
  function countRemarks(u) { return S.db.remarks.filter(r => r.executorId === u.id && ['open', 'rework'].includes(r.status)).length; }

  function layout(u, r, title, bodyHtml) {
    const menu = menuFor(u);
    const unread = A.myNotifications().filter(n => !n.readAt).length;
    const nav = menu.map(m => {
      if (!m) return '<div class="nav-sep"></div>';
      const active = m[3] === r.view || (m[3] === 'projects' && ['project', 'projectForm', 'stage'].includes(r.view)) || (m[3] === 'remarks' && r.view === 'remark');
      return '<a href="' + m[0] + '" class="' + (active ? 'active' : '') + '"' + (active ? ' aria-current="page"' : '') + '>' + icon(m[1]) + '<span>' + m[2] + '</span>' + (m[4] ? '<span class="count">' + m[4] + '</span>' : '') + '</a>';
    }).join('');
    return '<div class="layout">' +
      '<aside class="sidebar" id="sidebar"><a class="brand" href="#/"><span class="brand-logo">' + icon('flame', 20) + '</span>ПожЭксперт+</a>' +
      '<nav class="nav" aria-label="Основное меню">' + nav + '</nav>' +
      '<div class="side-user"><div class="avatar">' + esc(window.UI.initials(u.fullName)) + '</div><div><div class="name">' + esc(u.fullName) + '</div><div class="role">' + esc(A.ROLES[u.role]) + '</div></div></div></aside>' +
      '<div class="main"><header class="topbar">' +
      '<button class="icon-btn burger" id="burger" aria-label="Меню">' + icon('menu') + '</button>' +
      '<div class="crumbs">' + title + '</div>' +
      '<form class="top-search" id="topSearch" role="search">' + icon('search') + '<input name="q" placeholder="Поиск проектов, документов, замечаний" aria-label="Глобальный поиск" value="' + esc(r.view === 'search' ? (r.query.q || '') : '') + '"></form>' +
      '<div class="top-right">' + (S.db.meta.demo ? '<span class="demo-chip" title="Все записи — вымышленные демонстрационные данные учебного прототипа">Демо-данные</span>' : '') +
      '<button class="icon-btn" id="themeBtn" title="Светлая / тёмная тема" aria-label="Переключить тему">' + icon('moon') + '</button>' +
      '<a class="icon-btn" href="#/notifications" aria-label="Уведомления' + (unread ? ': ' + unread + ' новых' : '') + '">' + icon('bell') + (unread ? '<span class="dot"></span>' : '') + '</a>' +
      '<div style="position:relative"><button class="avatar" id="profileBtn" style="border:0;cursor:pointer" aria-label="Меню профиля" aria-haspopup="true">' + esc(window.UI.initials(u.fullName)) + '</button>' +
      '<div id="profileMenu" class="card hidden" style="position:absolute;right:0;top:46px;width:240px;padding:8px;z-index:40;box-shadow:0 10px 30px rgba(0,0,0,.15)">' +
      '<div style="padding:8px 10px"><b>' + esc(u.fullName) + '</b><div class="muted small">' + esc(u.email) + '</div></div>' +
      '<a class="btn link" style="display:block;padding:8px 10px" href="#/profile">Профиль и пароль</a>' +
      '<button class="btn link" style="display:block;padding:8px 10px;color:var(--red)" id="logoutBtn">Выйти</button></div></div>' +
      '</div></header><main class="content" id="content">' + bodyHtml + '</main></div></div>';
  }

  function errorPage(title, text) {
    return '<div class="card" style="max-width:640px">' + '<h1 style="margin-bottom:8px">' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p><a class="btn primary" href="#/">На главную</a></div>';
  }

  let afterFns = [];
  function render() {
    const r = parseHash();
    const root = document.getElementById('app');
    const u = A.me();
    if (!r.pub && !u) { if (r.path !== '/login') { sessionStorage.setItem('pozh_after_login', location.hash); } location.hash = '#/login'; return; }
    if (r.pub && u) { location.hash = '#/'; return; }
    afterFns = [];
    const ctx = { params: r.params, query: r.query, user: u, after: (fn) => afterFns.push(fn), title: '' };
    let html;
    try {
      if (!r.view || !Views[r.view]) throw new NotFound();
      html = Views[r.view](ctx);
    } catch (e) {
      afterFns = [];
      if (e.forbidden) { ctx.title = 'Доступ запрещён'; html = errorPage('Доступ запрещён', e.message === 'Доступ запрещён' ? 'У вашей роли нет прав на этот раздел или объект. Если доступ нужен для работы, обратитесь к ГИПу или директору.' : e.message); }
      else if (e.notFound) { ctx.title = 'Не найдено'; html = errorPage('Страница не найдена', e.message === 'Страница не найдена' ? 'Проверьте адрес или вернитесь на главную.' : e.message); }
      else { console.error(e); ctx.title = 'Ошибка'; html = errorPage('Что-то пошло не так', 'Страница не загрузилась. Обновите страницу; если ошибка повторяется — сбросьте демо-данные в профиле.'); }
    }
    if (r.pub) root.innerHTML = html;
    else root.innerHTML = layout(u, r, ctx.title, html);
    document.title = (ctx.docTitle || stripTags(ctx.title) || 'ПожЭксперт+') + ' — ПожЭксперт+';
    if (!r.pub) bindLayout();
    afterFns.forEach(fn => { try { fn(document.getElementById('content') || root); } catch (e) { console.error(e); } });
    window.scrollTo(0, 0);
  }
  function stripTags(s) { const d = document.createElement('div'); d.innerHTML = s || ''; return d.textContent; }
  function refresh() { const y = window.scrollY; render(); window.scrollTo(0, y); }

  function bindLayout() {
    const sb = document.getElementById('sidebar');
    document.getElementById('burger').onclick = () => sb.classList.toggle('open');
    document.getElementById('themeBtn').onclick = () => S.Theme.set(S.Theme.get() === 'dark' ? 'light' : 'dark');
    const pm = document.getElementById('profileMenu');
    document.getElementById('profileBtn').onclick = (e) => { e.stopPropagation(); pm.classList.toggle('hidden'); };
    document.addEventListener('click', () => pm.classList.add('hidden'), { once: true });
    document.getElementById('logoutBtn').onclick = () => { A.logout(); location.hash = '#/login'; };
    document.getElementById('topSearch').onsubmit = (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) go('#/search?q=' + encodeURIComponent(q)); };
  }

  /* ---------- Экран входа ---------- */
  Views.login = function (ctx) {
    ctx.title = 'Вход';
    const feat = (ic, t, d) => '<div class="feat"><div class="ic">' + icon(ic, 20) + '</div><div><b>' + t + '</b><span>' + d + '</span></div></div>';
    const demo = S.db.meta.demo ? '<details class="demo-accounts card" style="padding:12px 16px"><summary style="cursor:pointer;font-weight:600">Демо-учётные записи (только для проверки прототипа)</summary>' +
      '<p class="small muted" style="margin:8px 0">Пароль для всех: <b>' + esc(window.PozhSeed.DEMO_PASSWORD) + '</b>. Перед реальным использованием пароли заменяются. Нажмите на почту, чтобы подставить её.</p>' +
      '<table><tbody>' + S.db.users.map(u => '<tr><td><a href="#" data-email="' + esc(u.email) + '">' + esc(u.email) + '</a></td><td class="muted">' + esc(A.ROLES[u.role]) + (u.status !== 'active' ? ' · ' + A.USER_STATUS[u.status][0].toLowerCase() : '') + '</td></tr>').join('') + '</tbody></table></details>' : '';
    ctx.after(root => {
      const f = root.querySelector('#loginForm');
      root.querySelectorAll('[data-email]').forEach(a => a.onclick = (e) => { e.preventDefault(); f.email.value = a.dataset.email; f.password.focus(); });
      root.querySelector('#pwToggle').onclick = () => {
        const shown = f.password.type === 'text'; f.password.type = shown ? 'password' : 'text';
        root.querySelector('#pwToggle').textContent = shown ? 'Показать' : 'Скрыть';
      };
      root.querySelector('#forgot').onclick = (e) => {
        e.preventDefault();
        window.UI.modal({ title: 'Не удаётся войти?', body: '<p>Самостоятельное восстановление доступа в прототипе не реализовано. Обратитесь к директору: он сбросит доступ и выдаст временный пароль, который нужно сменить при первом входе.</p><p class="muted small">После 5 неудачных попыток вход по адресу блокируется на 15 минут.</p>', cancelLabel: 'Понятно' });
      };
      f.onsubmit = (e) => {
        e.preventDefault();
        try {
          const u = A.login(f.email.value, f.password.value);
          const back = sessionStorage.getItem('pozh_after_login'); sessionStorage.removeItem('pozh_after_login');
          if (u.mustChangePassword) { location.hash = '#/profile?first=1'; return; }
          location.hash = back && back !== '#/login' ? back : '#/';
        } catch (err) {
          f.password.value = '';
          window.UI.showErrors(f, err);
        }
      };
    });
    return '<div class="login"><section class="login-left"><div class="brand" style="padding:0"><span class="brand-logo" style="width:44px;height:44px">' + icon('flame', 22) + '</span>ПожЭксперт+</div>' +
      '<h1>Управление проектированием систем пожарной безопасности</h1><p class="lead">Единое рабочее пространство для проектов, документов, проверок и замечаний.</p>' +
      feat('folder', 'Этапы, задачи и сроки', 'Весь проект и ответственные в одном месте') + feat('file', 'Версии документов', 'Прежние файлы не перезаписываются') +
      feat('check', 'Поэтапная проверка', 'Замечания привязаны к версии и исполнителю') + feat('spark', 'ИИ-помощник', 'Поиск похожих замечаний в архиве компании') +
      '<div style="margin-top:auto;padding-top:32px;color:#AFC0D2;font-size:14px">ООО «ПожЭксперт+» · учебный прототип</div></section>' +
      '<section class="login-right"><div class="login-card"><div class="card" style="padding:32px"><h1>Вход в систему</h1><p class="muted" style="margin:6px 0 20px">Используйте рабочую электронную почту и пароль, выданные директором.</p>' +
      '<form id="loginForm" novalidate><div class="form-top-err"></div>' +
      window.UI.field('Рабочая электронная почта', '<input name="email" type="email" autocomplete="username" placeholder="Введите рабочую почту">') +
      window.UI.field('Пароль', '<div class="pw-wrap"><input name="password" type="password" autocomplete="current-password" placeholder="Введите пароль"><button type="button" id="pwToggle">Показать</button></div>') +
      '<button class="btn primary block" type="submit">Войти</button></form>' +
      '<p style="text-align:center;margin:14px 0"><a href="#" id="forgot">Не удаётся войти?</a></p>' +
      window.UI.alertBox('info', 'Самостоятельная регистрация недоступна. Учётную запись сотруднику создаёт директор.') + '</div>' + demo + '</div></section></div>';
  };

  /* ---------- Запуск ---------- */
  function start() {
    S.Theme.apply();
    S.load();
    if (A.me()) A.generateDeadlineNotifications();
    window.addEventListener('hashchange', render);
    render();
  }
  window.App = { go, setQuery, render, refresh, parseHash, Forbidden, NotFound };
  document.addEventListener('DOMContentLoaded', start);
})();

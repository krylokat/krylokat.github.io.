/* Экраны: главные страницы по ролям, проекты, карточка проекта, форма проекта, задачи, очередь проверок. */
(function () {
  'use strict';
  const A = window.PozhApi, S = window.PozhStore, U = window.UI;
  const { esc, icon, badge, fmtDate, fmtDT, field, options } = U;
  const Views = window.Views = window.Views || {};
  const db = () => S.db;
  const clientName = (id) => (A.find('clients', id) || {}).name || '—';
  const forbid = (m) => { throw new window.App.Forbidden(m); };
  const notFound = (m) => { throw new window.App.NotFound(m); };

  function statBox(num, label, cls, href) {
    const inner = '<div class="num">' + num + '</div><div class="lbl">' + esc(label) + '</div>';
    return href ? '<a class="stat ' + (cls || '') + '" href="' + href + '" style="text-decoration:none">' + inner + '</a>' : '<div class="stat ' + (cls || '') + '">' + inner + '</div>';
  }
  function loadBar(wl) {
    const cls = wl.overload ? 'red' : wl.pct >= 60 ? 'amber' : '';
    return '<div class="bar ' + cls + '"><i style="width:' + Math.min(100, wl.pct) + '%"></i></div>';
  }
  function loadLabel(wl) {
    return (wl.overload ? '<span class="red">' : '<span>') + wl.active + ' ' + U.plural(wl.active, 'задача', 'задачи', 'задач') + (wl.overload ? ', перегрузка' : '') + '</span>' +
      '<div class="xs muted">' + (wl.approx ? 'около ' : '') + wl.pct + '% на 2 недели' + (wl.approx ? ' (приблизительно)' : '') + '</div>';
  }
  function taskCard(s, u) {
    const p = A.projectOf(s);
    const src = db().documents.filter(d => d.projectId === p.id && !d.stageId).length;
    const myRem = db().remarks.filter(r => r.stageId === s.id && r.executorId === u.id && ['open', 'rework'].includes(r.status)).length;
    return '<div class="task-card"><div class="muted small">' + esc(p.name) + ' · ' + esc(p.number) + '</div><div class="t">Этап ' + s.seq + '. ' + esc(s.name) + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + U.stageBadge(s) + (A.isStageOverdue(s) ? badge(['Просрочен', 'red']) : '') + (myRem ? badge([myRem + ' ' + U.plural(myRem, 'замечание', 'замечания', 'замечаний'), 'red']) : '') + '</div>' +
      '<div class="small">Срок: ' + U.deadlineText(s).replace(/<br>/g, ' · ') + '</div>' +
      (A.stageState(s) === 'blocked' ? '<div class="small muted">' + esc(A.blockReason(s)) + '</div>' : '') +
      '<div class="small muted">Входные документы: ' + src + '</div>' +
      '<div><a class="btn sm" href="#/stage/' + s.id + '">Открыть</a></div></div>';
  }
  function urgency(s) {
    const st = A.stageState(s);
    const base = st === 'rework' ? 0 : st === 'in_work' ? 1 : st === 'review' ? 3 : st === 'blocked' ? 4 : 5;
    return base * 10000 + (A.daysTo(s.deadline) + 5000);
  }
  function sortTasks(list, how) {
    const l = list.slice();
    if (how === 'deadline') l.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
    else if (how === 'project') l.sort((a, b) => A.projectOf(a).name.localeCompare(A.projectOf(b).name) || a.seq - b.seq);
    else l.sort((a, b) => urgency(a) - urgency(b));
    return l;
  }
  function eventsList(items) {
    if (!items.length) return U.emptyState('Событий пока нет');
    return '<ul class="list">' + items.map(a => '<li><div><div>' + esc(a.description) + '</div><div class="xs muted">' + esc(A.userName(a.userId)) + ' · ' + fmtDT(a.date) + '</div></div></li>').join('') + '</ul>';
  }

  /* ================= Главная ================= */
  Views.dashboard = function (ctx) {
    const u = ctx.user;
    ctx.title = '<b>Главная</b>';
    if (u.role === 'director') return dashDirector(ctx, u);
    if (u.role === 'gip') return dashGip(ctx, u);
    if (u.role === 'expert') return dashExpert(ctx, u);
    return dashExecutor(ctx, u);
  };
  function dashDirector(ctx, u) {
    const ps = db().projects;
    const active = ps.filter(p => ['in_work', 'approval'].includes(p.status));
    const overdue = active.filter(A.isProjectOverdue);
    const waiting = ps.filter(p => A.stagesOf(p.id).some(s => A.stageState(s) === 'review'));
    const done = ps.filter(p => ['done', 'archived'].includes(p.status));
    const risk = active.filter(p => A.isProjectOverdue(p) || (A.nearestStageDeadline(p) && A.daysTo(A.nearestStageDeadline(p).deadline) <= 3))
      .sort((a, b) => (A.nearestStageDeadline(a) || {}).deadline > (A.nearestStageDeadline(b) || {}).deadline ? 1 : -1);
    const workers = db().users.filter(x => x.status === 'active' && A.EXECUTOR_ROLES.includes(x.role)).map(x => ({ x, wl: A.workload(x.id) })).sort((a, b) => b.wl.pct - a.wl.pct);
    const upcoming = db().stages.filter(s => s.status !== 'accepted' && A.projectOf(s).status === 'in_work' && A.daysTo(s.deadline) <= 14).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 7);
    const events = db().audit.filter(a => !['auth.login', 'auth.logout', 'file.download', 'ai.search'].includes(a.action)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    return '<div class="page-head"><div><h1>Главная</h1><p>Общая картина по проектам компании</p></div><div class="actions"><a class="btn" href="#/projects">Все проекты</a><a class="btn primary" href="#/reports">Открыть отчёты</a></div></div>' +
      '<div class="grid g5" style="margin-bottom:16px">' + statBox(ps.length, 'Всего проектов', '', '#/projects') + statBox(active.length, 'В работе', 'blue', '#/projects?status=in_work') +
      statBox(overdue.length, 'Просрочено', 'red', '#/projects?overdue=1') + statBox(waiting.length, 'Ожидают решения', 'amber', '#/reviews') + statBox(done.length, 'Завершено', 'green', '#/projects?status=done') + '</div>' +
      '<div class="grid g2"><div class="card"><div class="card-head"><h2>Проекты с риском срыва сроков</h2></div>' +
      (risk.length ? '<div class="table-wrap"><table><thead><tr><th>Проект</th><th>ГИП</th><th>Ближайший срок</th><th>Статус</th></tr></thead><tbody>' +
        risk.map(p => { const n = A.nearestStageDeadline(p); return '<tr class="click" data-href="#/project/' + p.id + '"><td><b>' + esc(p.name) + '</b><div class="sub">' + esc(p.number) + '</div></td><td>' + esc(A.userName(p.gipId)) + '</td><td>' + (n ? U.deadlineText(n) : '—') + '</td><td>' + (A.isProjectOverdue(p) ? badge(['Просрочен', 'red']) : badge(['Срок близко', 'amber'])) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : U.emptyState('Проектов с риском нет', 'Все сроки в пределах плана.')) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Загрузка сотрудников</h2><span class="xs muted">по плановой трудоёмкости, период 2 недели</span></div>' +
      workers.map(w => '<div class="load-row"><div><b>' + esc(w.x.fullName) + '</b><div class="xs muted">' + esc(A.ROLES[w.x.role]) + '</div></div>' + loadBar(w.wl) + '<div class="small">' + loadLabel(w.wl) + '</div></div>').join('') +
      '<div class="xs muted" style="margin-top:8px">Если трудоёмкость этапа не задана, используется оценка 16 ч — такая загрузка помечена как приблизительная. Перегрузка: от 85% или больше 5 активных задач.</div></div></div>' +
      '<div class="grid g2" style="margin-top:16px"><div class="card"><div class="card-head"><h2>Ближайшие сроки</h2></div>' +
      (upcoming.length ? '<ul class="list">' + upcoming.map(s => '<li><div><a href="#/stage/' + s.id + '"><b>' + esc(s.name) + '</b></a><div class="xs muted">' + esc(A.projectOf(s).name) + ' · ' + esc(A.userName(s.executorId)) + '</div></div><div class="small" style="text-align:right">' + U.deadlineText(s) + '</div></li>').join('') + '</ul>' : U.emptyState('Нет сроков в ближайшие 2 недели')) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Последние события</h2><a class="small" href="#/audit">Журнал аудита</a></div>' + eventsList(events) + '</div></div>' + bindRows(ctx);
  }
  function bindRows(ctx) {
    ctx.after(root => root.querySelectorAll('tr[data-href]').forEach(tr => {
      tr.tabIndex = 0;
      tr.onclick = (e) => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; };
      tr.onkeydown = (e) => { if (e.key === 'Enter') location.hash = tr.dataset.href; };
    }));
    return '';
  }
  function dashGip(ctx, u) {
    const ps = db().projects.filter(p => p.gipId === u.id);
    const st = db().stages.filter(s => ps.some(p => p.id === s.projectId));
    const noExec = st.filter(s => !s.executorId && s.status !== 'accepted');
    const soon = st.filter(s => s.status !== 'accepted' && A.projectOf(s).status === 'in_work' && A.daysTo(s.deadline) <= 7).sort((a, b) => a.deadline.localeCompare(b.deadline));
    const inReview = st.filter(s => A.stageState(s) === 'review');
    const returned = st.filter(s => A.stageState(s) === 'rework');
    const overloaded = db().users.filter(x => x.status === 'active' && A.EXECUTOR_ROLES.includes(x.role)).map(x => ({ x, wl: A.workload(x.id) })).filter(w => w.wl.overload);
    const stageLi = (s, right) => '<li><div><a href="#/stage/' + s.id + '"><b>Этап ' + s.seq + '. ' + esc(s.name) + '</b></a><div class="xs muted">' + esc(A.projectOf(s).name) + ' · ' + esc(A.userName(s.executorId)) + '</div></div><div class="small" style="text-align:right">' + right + '</div></li>';
    return '<div class="page-head"><div><h1>Главная</h1><p>Ваши проекты и контроль этапов</p></div><div class="actions"><a class="btn" href="#/reports?tab=deadlines">Посмотреть календарь сроков</a><a class="btn" href="#/reviews">Открыть очередь проверок</a><a class="btn primary" href="#/projects/new">' + icon('plus') + 'Создать проект</a></div></div>' +
      '<div class="grid g5" style="margin-bottom:16px">' + statBox(ps.length, 'Мои проекты', '', '#/projects') + statBox(noExec.length, 'Этапов без исполнителя', noExec.length ? 'amber' : '') +
      statBox(st.filter(A.isStageOverdue).length, 'Просроченных этапов', 'red') + statBox(inReview.length, 'На проверке', 'amber') + statBox(returned.length, 'Возвращено с замечаниями', 'blue') + '</div>' +
      '<div class="grid g2"><div class="card"><div class="card-head"><h2>Этапы без исполнителя</h2></div>' + (noExec.length ? '<ul class="list">' + noExec.map(s => '<li><div><b>Этап ' + s.seq + '. ' + esc(s.name) + '</b><div class="xs muted">' + esc(A.projectOf(s).name) + ' · срок ' + fmtDate(s.deadline) + '</div></div><a class="btn sm primary" href="#/project/' + s.projectId + '?tab=stages&assign=' + s.id + '">Назначить исполнителя</a></li>').join('') + '</ul>' : U.emptyState('Все этапы назначены')) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Приближающиеся и просроченные сроки</h2></div>' + (soon.length ? '<ul class="list">' + soon.map(s => stageLi(s, U.deadlineText(s))).join('') + '</ul>' : U.emptyState('Нет сроков на ближайшую неделю')) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Результаты на проверке</h2></div>' + (inReview.length ? '<ul class="list">' + inReview.map(s => stageLi(s, 'проверяющий: ' + esc(A.userName(s.reviewerId)))).join('') + '</ul>' : U.emptyState('Нет результатов на проверке')) + '</div>' +
      '<div class="card"><div class="card-head"><h2>Возвраты с замечаниями</h2></div>' + (returned.length ? '<ul class="list">' + returned.map(s => stageLi(s, db().remarks.filter(r => r.stageId === s.id && ['open', 'rework'].includes(r.status)).length + ' откр. замечаний')).join('') + '</ul>' : U.emptyState('Возвратов нет')) + '</div></div>' +
      '<div class="card" style="margin-top:16px"><div class="card-head"><h2>Предупреждения о перегрузке</h2></div>' + (overloaded.length ? overloaded.map(w => '<div class="load-row"><div><b>' + esc(w.x.fullName) + '</b><div class="xs muted">' + esc(A.ROLES[w.x.role]) + '</div></div>' + loadBar(w.wl) + '<div class="small">' + loadLabel(w.wl) + '</div></div>').join('') : U.emptyState('Перегруженных сотрудников нет')) + '</div>';
  }
  function dashExecutor(ctx, u) {
    const mine = db().stages.filter(s => s.executorId === u.id && s.status !== 'accepted' && ['in_work', 'approval'].includes(A.projectOf(s).status));
    const sort = ctx.query.sort || 'urgency';
    const week = mine.filter(s => A.daysTo(s.deadline) <= 7 && A.daysTo(s.deadline) >= 0);
    const returned = mine.filter(s => A.stageState(s) === 'rework');
    const myRemarks = db().remarks.filter(r => r.executorId === u.id && ['open', 'rework', 'fixed'].includes(r.status));
    const isManager = u.role === 'manager';
    const titles = { designer: 'Мои задачи', calculator: 'Расчётные задачи', estimator: 'Задачи по сметам', manager: 'Согласования' };
    ctx.after(root => { const s = root.querySelector('#taskSort'); if (s) s.onchange = () => window.App.setQuery({ sort: s.value }); });
    return '<div class="page-head"><div><h1>Главная</h1><p>' + esc(A.ROLES[u.role]) + ': назначенные вам задачи и замечания</p></div><div class="actions"><a class="btn" href="#/ai">' + icon('spark') + 'ИИ-помощник</a></div></div>' +
      '<div class="grid g4" style="margin-bottom:16px">' + statBox(mine.length, titles[u.role] || 'Мои задачи', '', '#/tasks') + statBox(week.length, 'Срок на этой неделе', 'amber') + statBox(returned.length, 'Возвращено на доработку', 'blue') + statBox(myRemarks.length, 'Мои замечания', 'red', '#/remarks?f=mine') + '</div>' +
      (returned.length ? U.alertBox('warn', '<b>Возвращено на доработку: ' + returned.length + '.</b> Исправьте замечания, загрузите новую версию и передайте её на проверку.') : '') +
      '<div class="card"><div class="card-head"><h2>' + esc(titles[u.role] || 'Мои задачи') + '</h2><label class="small" style="display:flex;gap:8px;align-items:center">Порядок: <select id="taskSort" style="width:auto">' + options([['urgency', 'По срочности'], ['deadline', 'По сроку'], ['project', 'По проекту']], sort) + '</select></label></div>' +
      (mine.length ? '<div class="grid g3">' + sortTasks(mine, sort).map(s => taskCard(s, u)).join('') + '</div>' : U.emptyState('Назначенных задач нет', 'Когда ГИП назначит вам этап, он появится здесь, а вы получите уведомление.')) + '</div>' +
      '<div class="grid g2" style="margin-top:16px"><div class="card"><div class="card-head"><h2>Срок на этой неделе</h2></div>' + (week.length ? '<ul class="list">' + week.map(s => '<li><a href="#/stage/' + s.id + '">' + esc(s.name) + '</a><span class="small">' + U.deadlineText(s) + '</span></li>').join('') + '</ul>' : U.emptyState('На этой неделе сроков нет')) + '</div>' +
      '<div class="card"><div class="card-head"><h2>' + (isManager ? 'Замечания согласующей стороны и мои' : 'Мои замечания') + '</h2><a class="small" href="#/remarks?f=mine">Все</a></div>' + (myRemarks.length ? '<ul class="list">' + myRemarks.map(r => '<li><div><a href="#/remark/' + r.id + '"><b>' + esc(r.number) + '</b></a> ' + badge(A.SEVERITY[r.severity]) + '<div class="small">' + esc(r.text) + '</div></div>' + badge(A.REMARK_STATUS[r.status]) + '</li>').join('') + '</ul>' : U.emptyState('Открытых замечаний нет')) + '</div></div>';
  }
  function dashExpert(ctx, u) {
    ctx.title = '<b>Главная</b>';
    const q = reviewQueue(u);
    return '<div class="page-head"><div><h1>Главная</h1><p>Очередь результатов на проверке</p></div><div class="actions"><a class="btn" href="#/ai">' + icon('spark') + 'ИИ-помощник</a><a class="btn primary" href="#/reviews">Открыть очередь проверок</a></div></div>' +
      '<div class="grid g4" style="margin-bottom:16px">' + statBox(q.length, 'Ожидают проверки', 'amber', '#/reviews') +
      statBox(q.filter(s => A.daysTo(s.deadline) <= 1).length, 'Срочные (срок ≤ 1 дня)', 'red') +
      statBox(db().remarks.filter(r => r.authorId === u.id && ['open', 'rework', 'fixed'].includes(r.status)).length, 'Мои открытые замечания', '', '#/remarks?f=open') +
      statBox(db().reviews.filter(r => r.reviewerId === u.id).length, 'Решений принято всего', 'green') + '</div>' + reviewTable(ctx, u, q);
  }

  /* ================= Очередь проверок ================= */
  function reviewQueue(u) {
    let list = db().stages.filter(s => A.stageState(s) === 'review');
    if (u.role === 'director' || u.role === 'gip') list = list.filter(s => A.canViewStage(u, s));
    else list = list.filter(s => s.reviewerId === u.id);
    return list;
  }
  function reviewTable(ctx, u, list) {
    const q = ctx.query;
    const projects = Array.from(new Set(list.map(s => s.projectId))).map(id => A.find('projects', id));
    let rows = list.slice();
    if (q.project) rows = rows.filter(s => s.projectId === Number(q.project));
    if (q.urgent === '1') rows = rows.filter(s => A.daysTo(s.deadline) <= 1);
    rows.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
    ctx.after(root => {
      const f = root.querySelector('#rvFilters');
      if (f) f.onchange = () => window.App.setQuery({ project: f.project.value, urgent: f.urgent.checked ? '1' : '' });
    });
    bindRows(ctx);
    const readOnly = u.role === 'gip' || (u.role === 'director');
    return '<div class="card"><div class="card-head"><h2>Результаты на проверке</h2>' + (readOnly ? '<span class="small muted">' + (u.role === 'gip' ? 'Контроль статусов: решение принимает назначенный проверяющий' : 'Просмотр; решение доступно, только если вы назначены проверяющим') + '</span>' : '') + '</div>' +
      '<form id="rvFilters" class="filters"><select name="project" aria-label="Проект">' + options(projects.map(p => [p.id, p.name]), q.project, 'Все проекты') + '</select>' +
      '<label class="small" style="display:flex;gap:6px;align-items:center;min-width:0"><input type="checkbox" name="urgent" ' + (q.urgent === '1' ? 'checked' : '') + '> Только срочные</label></form>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Проект</th><th>Этап</th><th>Исполнитель</th><th>Версия</th><th>Дата передачи</th><th>Срок этапа</th><th>Откр. замечаний</th><th></th></tr></thead><tbody>' +
        rows.map(s => {
          const v = A.stageVersions(s.id).filter(x => x.status === 'submitted');
          const open = db().remarks.filter(r => r.stageId === s.id && ['open', 'rework', 'fixed'].includes(r.status)).length;
          return '<tr class="click" data-href="#/stage/' + s.id + '"><td>' + esc(A.projectOf(s).name) + '<div class="sub">' + esc(A.projectOf(s).number) + '</div></td><td><b>' + s.seq + '. ' + esc(s.name) + '</b></td><td>' + esc(A.userName(s.executorId)) + '</td><td>' + (v.length ? v.map(x => 'v' + x.no).join(', ') : '<span class="muted">без файла</span>') + '</td><td>' + fmtDT(s.submittedAt || (v[0] || {}).submittedAt) + '</td><td>' + U.deadlineText(s) + '</td><td>' + open + '</td><td><a class="btn sm ' + (s.reviewerId === u.id ? 'primary' : '') + '" href="#/stage/' + s.id + '">' + (s.reviewerId === u.id ? 'Проверить' : 'Открыть') + '</a></td></tr>';
        }).join('') + '</tbody></table></div>' : U.emptyState('Очередь пуста', 'Результатов, ожидающих проверки, нет.')) + '</div>';
  }
  Views.reviews = function (ctx) {
    const u = ctx.user;
    const isReviewer = db().stages.some(s => s.reviewerId === u.id);
    if (!['director', 'gip', 'expert'].includes(u.role) && !isReviewer) forbid();
    ctx.title = '<b>Проверки</b>';
    const q = reviewQueue(u);
    const done = db().reviews.filter(r => u.role === 'director' || r.reviewerId === u.id || (u.role === 'gip' && A.canViewStage(u, A.find('stages', r.stageId)))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
    const stat = u.role === 'director' ? '<div class="grid g4" style="margin-bottom:16px">' + statBox(q.length, 'Ожидают проверки', 'amber') + statBox(db().reviews.filter(r => r.decision === 'accepted').length, 'Принято результатов', 'green') + statBox(db().reviews.filter(r => r.decision === 'returned').length, 'Возвратов на доработку', 'blue') + statBox(db().reviews.filter(r => r.decision === 'cancelled').length, 'Отмен приёмки', '') + '</div>' : '';
    return '<div class="page-head"><div><h1>Проверки</h1><p>Очередь результатов: проект, этап, исполнитель, версия и срок</p></div></div>' + stat + reviewTable(ctx, u, q) +
      '<div class="card"><div class="card-head"><h2>Последние решения</h2></div>' + (done.length ? '<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Этап</th><th>Версия</th><th>Проверяющий</th><th>Решение</th><th>Комментарий</th></tr></thead><tbody>' +
        done.map(r => { const s = A.find('stages', r.stageId); const v = r.versionId ? A.find('versions', r.versionId) : null; return '<tr><td class="nowrap">' + fmtDT(r.date) + '</td><td><a href="#/stage/' + s.id + '">' + esc(A.projectOf(s).name) + ' · ' + s.seq + '. ' + esc(s.name) + '</a></td><td>' + (v ? 'v' + v.no : '—') + '</td><td>' + esc(A.userName(r.reviewerId)) + '</td><td>' + badge(r.decision === 'accepted' ? ['Принято', 'green'] : r.decision === 'returned' ? ['Возврат', 'amber'] : ['Отмена приёмки', 'red']) + '</td><td class="small">' + esc(r.comment || '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : U.emptyState('Решений пока нет')) + '</div>';
  };

  /* ================= Задачи ================= */
  Views.tasks = function (ctx) {
    const u = ctx.user;
    if (!['gip', 'designer', 'calculator', 'estimator', 'manager'].includes(u.role)) forbid();
    ctx.title = '<b>Задачи</b>';
    const q = ctx.query;
    let list = u.role === 'gip' ? db().stages.filter(s => A.projectOf(s).gipId === u.id) : db().stages.filter(s => s.executorId === u.id);
    if (q.state) list = list.filter(s => A.stageState(s) === q.state);
    else if (q.all !== '1') list = list.filter(s => s.status !== 'accepted');
    if (q.q) list = list.filter(s => (s.name + ' ' + A.projectOf(s).name).toLowerCase().includes(q.q.toLowerCase()));
    list = sortTasks(list, q.sort || 'urgency');
    const pg = U.paginate(list, Number(q.page) || 1, 15);
    ctx.after(root => {
      const f = root.querySelector('#tFilters');
      f.onchange = () => window.App.setQuery({ state: f.state.value, sort: f.sort.value, all: f.all.checked ? '1' : '', page: '' });
      f.onsubmit = (e) => { e.preventDefault(); window.App.setQuery({ q: f.q.value, page: '' }); };
      root.querySelectorAll('[data-page]').forEach(b => b.onclick = () => window.App.setQuery({ page: b.dataset.page }));
    });
    bindRows(ctx);
    const states = Object.keys(A.STAGE_STATE).map(k => [k, A.STAGE_STATE[k][0]]);
    return '<div class="page-head"><div><h1>Задачи и этапы</h1><p>' + (u.role === 'gip' ? 'Этапы ваших проектов' : 'Назначенные вам этапы') + '</p></div></div>' +
      '<div class="card"><form id="tFilters" class="filters"><input class="grow" name="q" placeholder="Поиск по этапу или проекту" value="' + esc(q.q || '') + '" aria-label="Поиск">' +
      '<select name="state" aria-label="Статус">' + options(states, q.state, 'Все статусы') + '</select><select name="sort" aria-label="Сортировка">' + options([['urgency', 'По срочности'], ['deadline', 'По сроку'], ['project', 'По проекту']], q.sort || 'urgency') + '</select>' +
      '<label class="small" style="display:flex;gap:6px;align-items:center;min-width:0"><input type="checkbox" name="all" ' + (q.all === '1' ? 'checked' : '') + '> Показать принятые</label></form>' +
      (pg.total ? '<div class="table-wrap"><table><thead><tr><th>Проект</th><th>Этап</th>' + (u.role === 'gip' ? '<th>Исполнитель</th>' : '') + '<th>Проверяющий</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>' +
        pg.items.map(s => '<tr class="click" data-href="#/stage/' + s.id + '"><td>' + esc(A.projectOf(s).name) + '<div class="sub">' + esc(A.projectOf(s).number) + '</div></td><td><b>' + s.seq + '. ' + esc(s.name) + '</b>' + (A.stageState(s) === 'blocked' ? '<div class="sub">' + esc(A.blockReason(s)) + '</div>' : '') + '</td>' +
          (u.role === 'gip' ? '<td>' + (s.executorId ? esc(A.userName(s.executorId)) : '<span class="amber">Не назначен</span>') + '</td>' : '') + '<td>' + esc(A.userName(s.reviewerId)) + '</td><td>' + U.deadlineText(s) + '</td><td>' + U.stageBadge(s) + '</td><td><a class="btn sm" href="#/stage/' + s.id + '">Открыть</a></td></tr>').join('') +
        '</tbody></table></div>' + U.pagerHtml(pg, 'Этапов') : U.emptyState('Задачи не найдены', 'Измените условия поиска.', '<a class="btn" href="#/tasks">Очистить фильтры</a>')) + '</div>';
  };

  /* ================= Список проектов ================= */
  Views.projects = function (ctx) {
    const u = ctx.user;
    ctx.title = '<b>Проекты</b>';
    const q = ctx.query;
    const all = A.visibleProjects(u);
    let list = all.slice();
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(n) || p.number.toLowerCase().includes(n) || clientName(p.clientId).toLowerCase().includes(n)); }
    if (q.status) list = list.filter(p => p.status === q.status);
    if (q.client) list = list.filter(p => p.clientId === Number(q.client));
    if (q.gip) list = list.filter(p => p.gipId === Number(q.gip));
    if (q.from) list = list.filter(p => p.endDate >= q.from);
    if (q.to) list = list.filter(p => p.startDate <= q.to);
    if (q.overdue === '1') list = list.filter(A.isProjectOverdue);
    const sortKey = q.sort || 'number', dir = q.dir === 'desc' ? -1 : 1;
    const val = {
      number: p => p.number, name: p => p.name, client: p => clientName(p.clientId), status: p => p.status, gip: p => A.userName(p.gipId),
      start: p => p.startDate, progress: p => A.projectProgress(p).pct, next: p => (A.nearestStageDeadline(p) || {}).deadline || '9999'
    };
    list.sort((a, b) => { const x = val[sortKey](a), y = val[sortKey](b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    const pg = U.paginate(list, Number(q.page) || 1, 10);
    const filtered = ['q', 'status', 'client', 'gip', 'from', 'to', 'overdue'].some(k => q[k]);
    ctx.after(root => {
      const f = root.querySelector('#pFilters');
      const apply = () => window.App.setQuery({ q: f.q.value, status: f.status.value, client: f.client.value, gip: f.gip.value, from: f.from.value, to: f.to.value, overdue: f.overdue.checked ? '1' : '', page: '' });
      f.onsubmit = (e) => { e.preventDefault(); apply(); };
      f.querySelectorAll('select,input[type=checkbox],input[type=date]').forEach(el => el.onchange = apply);
      root.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => window.App.setQuery({ sort: th.dataset.sort, dir: sortKey === th.dataset.sort && dir === 1 ? 'desc' : 'asc' }));
      root.querySelectorAll('[data-page]').forEach(b => b.onclick = () => window.App.setQuery({ page: b.dataset.page }));
      const clr = root.querySelector('#clearF'); if (clr) clr.onclick = () => window.App.go('#/projects');
    });
    bindRows(ctx);
    const th = (k, l) => '<th class="sortable" data-sort="' + k + '" aria-sort="' + (sortKey === k ? (dir === 1 ? 'ascending' : 'descending') : 'none') + '">' + l + (sortKey === k ? (dir === 1 ? ' ↑' : ' ↓') : '') + '</th>';
    const clients = Array.from(new Set(all.map(p => p.clientId))).map(id => [id, clientName(id)]);
    const gips = Array.from(new Set(all.map(p => p.gipId))).map(id => [id, A.userName(id)]);
    return '<div class="page-head"><div><h1>Проекты</h1><p>' + (u.role === 'director' ? 'Все проекты компании' : u.role === 'gip' ? 'Проекты, где вы — главный инженер' : 'Проекты, в которых вы участвуете') + '</p></div>' +
      '<div class="actions">' + (A.canCreateProject(u) ? '<a class="btn primary" href="#/projects/new">' + icon('plus') + 'Создать проект</a>' : '') + '</div></div>' +
      '<div class="card"><form id="pFilters" class="filters"><input class="grow" name="q" placeholder="Поиск по названию, заказчику или номеру" value="' + esc(q.q || '') + '" aria-label="Поиск проектов">' +
      '<select name="status" aria-label="Статус">' + options(Object.keys(A.PROJECT_STATUS).map(k => [k, A.PROJECT_STATUS[k][0]]), q.status, 'Все статусы') + '</select>' +
      '<select name="client" aria-label="Заказчик">' + options(clients, q.client, 'Все заказчики') + '</select>' +
      '<select name="gip" aria-label="Ответственный">' + options(gips, q.gip, 'Все ГИПы') + '</select>' +
      '<input type="date" name="from" value="' + esc(q.from || '') + '" title="Сроки: с" aria-label="Сроки с" style="min-width:140px"><input type="date" name="to" value="' + esc(q.to || '') + '" title="Сроки: по" aria-label="Сроки по" style="min-width:140px">' +
      '<label class="small" style="display:flex;gap:6px;align-items:center;min-width:0"><input type="checkbox" name="overdue" ' + (q.overdue === '1' ? 'checked' : '') + '> Есть просрочка</label>' +
      '<button class="btn" type="submit">' + icon('search', 16) + 'Найти</button></form>' +
      (pg.total ? '<div class="table-wrap"><table><thead><tr>' + th('number', 'Номер') + th('name', 'Проект') + th('client', 'Заказчик') + th('status', 'Статус') + th('gip', 'ГИП') + th('start', 'Плановые сроки') + th('progress', 'Выполнение') + th('next', 'Ближайший срок этапа') + '</tr></thead><tbody>' +
        pg.items.map(p => {
          const pr = A.projectProgress(p), n = A.nearestStageDeadline(p);
          return '<tr class="click" data-href="#/project/' + p.id + '"><td class="nowrap">' + esc(p.number) + '</td><td><b>' + esc(p.name) + '</b>' + (A.isProjectOverdue(p) ? '<div style="margin-top:4px">' + badge(['Просрочка', 'red']) + '</div>' : '') + '</td><td>' + esc(clientName(p.clientId)) + '</td><td>' + badge(A.PROJECT_STATUS[p.status]) + '</td><td>' + esc(A.userName(p.gipId)) + '</td>' +
            '<td class="nowrap small">' + fmtDate(p.startDate, true) + ' –<br>' + fmtDate(p.endDate, true) + '</td><td style="min-width:120px"><div class="bar"><i style="width:' + pr.pct + '%"></i></div><div class="xs muted">' + pr.pct + '% · ' + pr.accepted + ' из ' + pr.total + '</div></td><td class="small">' + (n ? esc(n.name) + '<br>' + U.deadlineText(n) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + U.pagerHtml(pg, 'Проектов')
        : U.emptyState('По заданным условиям проекты не найдены', filtered ? 'Попробуйте изменить или очистить фильтры.' : 'Проектов пока нет.', filtered ? '<button class="btn" id="clearF">Очистить фильтры</button>' : '')) + '</div>';
  };

  /* ================= Форма проекта ================= */
  Views.projectForm = function (ctx) {
    const u = ctx.user;
    const editing = !!ctx.params.id;
    const p = editing ? A.find('projects', ctx.params.id) : null;
    if (editing && !p) notFound('Проект не найден');
    if (editing ? !A.canManageProject(u, p) : !A.canCreateProject(u)) forbid(editing ? 'Изменять проект может только его ГИП.' : 'Создавать проекты может ГИП.');
    ctx.title = editing ? '<a href="#/projects">Проекты</a> / <a href="#/project/' + p.id + '">' + esc(p.name) + '</a> / <b>Изменение</b>' : '<a href="#/projects">Проекты</a> / <b>Новый проект</b>';
    const d = p || { name: '', clientId: '', gipId: u.role === 'gip' ? u.id : '', startDate: A.today(), endDate: '', description: '', objectAddress: '' };
    const clients = db().clients.filter(c => c.status === 'active' || (p && c.id === p.clientId));
    const gips = db().users.filter(x => x.role === 'gip' && x.status === 'active');
    ctx.after(root => {
      const f = root.querySelector('#projForm');
      const addC = root.querySelector('#addClient');
      if (addC) addC.onclick = (e) => { e.preventDefault(); Views.clientDialog(null, (c) => { f.clientId.insertAdjacentHTML('beforeend', '<option value="' + c.id + '">' + esc(c.name) + '</option>'); f.clientId.value = c.id; }); };
      const save = async (andStart) => {
        const data = U.readForm(f);
        try {
          if (editing) {
            let reason = '';
            if (A.projectEditImpact(p, data)) {
              const r = await U.confirmDlg('Изменение затрагивает начатые этапы', 'Название, заказчик или сроки проекта меняются после начала работ. Изменение будет записано в историю проекта, исполнители увидят новые данные.', 'Сохранить изменения', 'primary', field('Причина изменения', '<textarea name="reason" rows="3"></textarea>', { req: true }));
              if (!r) return; reason = r.reason;
            }
            const n = A.updateProject(p.id, data, reason);
            U.toast(n ? 'Изменения сохранены и записаны в историю' : 'Изменений нет');
            window.App.go('#/project/' + p.id);
          } else {
            const np = A.createProject(data);
            U.toast('Проект создан в статусе «Черновик». Добавьте этапы и запустите проект.');
            window.App.go('#/project/' + np.id + '?tab=stages');
          }
        } catch (e) { U.handleError(e, f); window.scrollTo(0, 0); }
      };
      f.onsubmit = (e) => { e.preventDefault(); save(); };
    });
    const clientHint = A.canManageClients(u) ? '<a href="#" id="addClient">+ Добавить клиента в справочник</a>' : 'Нет нужного клиента? Обратитесь к директору — он добавит его в справочник.';
    return '<div class="page-head"><div><h1>' + (editing ? 'Изменение проекта' : 'Новый проект') + '</h1><p>' + (editing ? esc(p.number) + ' · изменения названия, заказчика и сроков фиксируются в истории' : 'После создания проект сохраняется как черновик, затем формируются этапы') + '</p></div></div>' +
      '<div class="card" style="max-width:900px"><form id="projForm" novalidate><div class="form-top-err"></div><div class="form-grid">' +
      field('Название проекта', '<input name="name" maxlength="200" value="' + esc(d.name) + '">', { req: true, cls: 'full', hint: 'От 3 до 200 символов' }) +
      field('Заказчик', '<select name="clientId">' + options(clients.map(c => [c.id, c.name]), d.clientId, '— выберите из справочника —') + '</select>', { req: true, hint: clientHint }) +
      field('ГИП / ответственный', (u.role === 'gip' ? '<input value="' + esc(u.fullName) + '" disabled><input type="hidden" name="gipId" value="' + (d.gipId || u.id) + '">' : '<select name="gipId">' + options(gips.map(g => [g.id, g.fullName]), d.gipId, '— выберите —') + '</select>'), { req: true }) +
      field('Дата начала', '<input type="date" name="startDate" value="' + esc(d.startDate) + '">', { req: true }) +
      field('Плановая дата окончания', '<input type="date" name="endDate" value="' + esc(d.endDate) + '">', { req: true, hint: 'Не раньше даты начала' }) +
      field('Адрес / объект', '<input name="objectAddress" value="' + esc(d.objectAddress) + '">', { cls: 'full' }) +
      field('Описание: цель, состав работ, особые условия', '<textarea name="description" rows="4">' + esc(d.description) + '</textarea>', { cls: 'full' }) +
      '</div>' + (!editing ? U.alertBox('info', 'Исходные документы (задание заказчика, планы) загружаются в карточке проекта после создания — на вкладке «Обзор». Этапы формируются там же.') : '') +
      '<div class="actions" style="justify-content:flex-end;margin-top:8px"><a class="btn" href="' + (editing ? '#/project/' + p.id : '#/projects') + '">' + (editing ? 'Отменить' : 'Отмена') + '</a>' +
      '<button class="btn primary" type="submit">' + (editing ? 'Сохранить изменения' : 'Создать проект') + '</button></div></form></div>';
  };

  /* ================= Карточка проекта ================= */
  Views.project = function (ctx) {
    const u = ctx.user;
    const p = A.find('projects', ctx.params.id);
    if (!p) notFound('Проект не найден');
    if (!A.canViewProject(u, p)) forbid('У вас нет доступа к этому проекту. Ссылка на закрытый проект не открывает данные.');
    ctx.title = '<a href="#/projects">Проекты</a> / <b>' + esc(p.name) + '</b>';
    ctx.docTitle = p.name;
    const tab = ctx.query.tab || 'stages';
    const manage = A.canManageProject(u, p);
    const pr = A.projectProgress(p), c = A.projectCounters(p);
    const tabs = [['overview', 'Обзор'], ['stages', 'Этапы и задачи'], ['docs', 'Документы'], ['reviews', 'Проверки и замечания'], ['history', 'История']];
    let body = '';
    if (tab === 'overview') body = projOverview(ctx, u, p, manage);
    else if (tab === 'docs') body = projDocs(ctx, u, p);
    else if (tab === 'reviews') body = projReviews(ctx, u, p);
    else if (tab === 'history') body = projHistory(p);
    else body = projStages(ctx, u, p, manage);
    const statusBtns = manage ? (
      (p.status === 'draft' ? '<button class="btn primary" id="startProj">Запустить проект</button>' : '') +
      (p.status === 'in_work' ? '<button class="btn" data-pstatus="approval">Передать на согласование</button>' : '') +
      (p.status === 'approval' ? '<button class="btn" data-pstatus="in_work">Вернуть в работу</button>' : '') +
      (['in_work', 'approval'].includes(p.status) && pr.total && pr.accepted === pr.total ? '<button class="btn success" data-pstatus="done">Завершить проект</button>' : '') +
      (p.status === 'done' ? '<button class="btn" data-pstatus="archived">Перевести в архив</button>' : '')) : '';
    ctx.after(root => {
      const sb = root.querySelector('#startProj');
      if (sb) sb.onclick = async () => {
        const ok = await U.confirmDlg('Запустить проект?', 'Проект перейдёт в статус «В работе». Исполнители этапов без зависимостей получат уведомления и смогут начать работу.', 'Запустить проект');
        if (!ok) return;
        try { A.startProject(p.id); U.toast('Проект запущен'); window.App.refresh(); } catch (e) { U.handleError(e); }
      };
      root.querySelectorAll('[data-pstatus]').forEach(b => b.onclick = async () => {
        const st = b.dataset.pstatus;
        const txt = { approval: 'Проект перейдёт в статус «На согласовании».', in_work: 'Проект вернётся в статус «В работе».', done: 'Проект будет завершён. Документы, замечания и история сохраняются.', archived: 'Проект будет перемещён в архив. Данные сохраняются и доступны для просмотра.' }[st];
        if (!(await U.confirmDlg('Изменить статус проекта?', txt, b.textContent))) return;
        try { A.setProjectStatus(p.id, st); U.toast('Статус проекта изменён'); window.App.refresh(); } catch (e) { U.handleError(e); }
      });
      const addSt = root.querySelector('#addStage');
      if (addSt) addSt.onclick = () => Views.stageDialog(p, null);
    });
    return '<div class="card"><div class="page-head" style="margin-bottom:0"><div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><h1>' + esc(p.name) + '</h1>' + badge(A.PROJECT_STATUS[p.status]) + (A.isProjectOverdue(p) ? badge(['Есть просрочка', 'red']) : '') + '</div><p>Проект ' + esc(p.number) + (p.objectAddress ? ' · ' + esc(p.objectAddress) : '') + '</p></div>' +
      '<div class="actions">' + statusBtns + (manage ? '<a class="btn" href="#/project/' + p.id + '/edit">Изменить проект</a><button class="btn primary" id="addStage">' + icon('plus') + 'Добавить этап</button>' : '') + '</div></div>' +
      '<div class="info-row"><div><div class="k">Заказчик</div><div class="v">' + esc(clientName(p.clientId)) + '</div></div><div><div class="k">Главный инженер проекта</div><div class="v">' + esc(A.userName(p.gipId)) + '</div></div>' +
      '<div><div class="k">Плановые сроки</div><div class="v">' + fmtDate(p.startDate, true) + ' – ' + fmtDate(p.endDate, true) + '</div></div>' +
      '<div><div class="k">Выполнение (принято ' + pr.accepted + ' из ' + pr.total + ' этапов)</div><div style="display:flex;gap:10px;align-items:center"><div class="bar" style="flex:1"><i style="width:' + pr.pct + '%"></i></div><b>' + pr.pct + '%</b></div></div></div></div>' +
      '<div class="grid g4" style="margin:16px 0">' + statBox(c.review, 'Ожидает проверки', 'amber') + statBox(c.rework, 'На доработке', 'blue') + statBox(c.accepted, 'Принято', 'green') + statBox(c.blocked, 'Заблокировано зависимостью', '') + '</div>' +
      '<div class="card"><nav class="tabs" aria-label="Разделы проекта">' + tabs.map(t => '<a href="#/project/' + p.id + '?tab=' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</a>').join('') + '</nav>' + body + '</div>';
  };

  function projStages(ctx, u, p, manage) {
    const st = A.stagesOf(p.id);
    ctx.after(root => {
      root.querySelectorAll('[data-assign]').forEach(b => b.onclick = () => Views.assignDialog(A.find('stages', b.dataset.assign)));
      if (ctx.query.assign) { const s = A.find('stages', ctx.query.assign); if (s && manage) Views.assignDialog(s); }
    });
    bindRows(ctx);
    if (!st.length) return U.emptyState('Этапов пока нет', manage ? 'Добавьте этапы: сроки, исполнители, проверяющие, ожидаемый результат и зависимости.' : 'ГИП ещё не сформировал этапы.', manage ? '<button class="btn primary" onclick="document.getElementById(\'addStage\').click()">Добавить этап</button>' : '');
    return '<div class="table-wrap"><table><thead><tr><th>№</th><th>Этап</th><th>Исполнитель</th><th>Проверяющий</th><th>Срок</th><th>Зависит от</th><th>Статус</th><th>Действие</th></tr></thead><tbody>' +
      st.map(s => {
        const state = A.stageState(s);
        const deps = s.dependsOn && s.dependsOn.length ? 'Этап' + (s.dependsOn.length > 1 ? 'ы ' : ' ') + s.dependsOn.map(id => (A.find('stages', id) || {}).seq).join(', ') : 'Нет';
        const lastSub = state === 'review' ? A.stageVersions(s.id).find(v => v.status === 'submitted') : null;
        const canOpen = A.canViewStage(u, s);
        const action = !s.executorId && manage && s.status !== 'accepted' ? '<button class="btn sm primary" data-assign="' + s.id + '">Назначить</button>' : canOpen ? '<a href="#/stage/' + s.id + '">Открыть</a>' : '<span class="xs muted">нет доступа</span>';
        return '<tr' + (canOpen ? ' class="click" data-href="#/stage/' + s.id + '"' : '') + '><td>' + s.seq + '</td><td><b>' + esc(s.name) + '</b>' + (s.effortHours ? '<div class="sub">' + s.effortHours + ' ч' + (s.fileRequired ? '' : ' · без обязательного файла') + '</div>' : '') + '</td>' +
          '<td>' + (s.executorId ? esc(A.userName(s.executorId)) : '<span class="amber">Не назначен</span>') + '</td><td>' + esc(A.userName(s.reviewerId)) + '</td><td class="small">' + U.deadlineText(s) + '</td><td class="small muted">' + deps + '</td>' +
          '<td>' + U.stageBadge(s) + (state === 'blocked' ? '<div class="sub" style="margin-top:4px">' + esc(A.blockReason(s)) + '</div>' : '') + (lastSub ? '<div class="sub" style="margin-top:4px">Версия ' + lastSub.no + ' передана ' + fmtDT(lastSub.submittedAt).split(',')[0] + '</div>' : '') + '</td><td>' + action + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function projOverview(ctx, u, p, manage) {
    const src = db().documents.filter(d => d.projectId === p.id && !d.stageId);
    const team = {};
    A.stagesOf(p.id).forEach(s => { [s.executorId, s.reviewerId].filter(Boolean).forEach(id => { team[id] = team[id] || []; team[id].push(s.seq); }); });
    ctx.after(root => {
      const b = root.querySelector('#uploadSrc');
      if (b) b.onclick = () => Views.uploadDialog({ project: p, source: true, documents: src });
      root.querySelectorAll('[data-open-v]').forEach(x => x.onclick = () => U.openVersion(Number(x.dataset.openV)));
      root.querySelectorAll('[data-dl-v]').forEach(x => x.onclick = () => U.downloadVersion(Number(x.dataset.dlV)));
    });
    return '<div class="grid g2"><div><h3>Описание и объект</h3><p>' + (p.description ? esc(p.description) : '<span class="muted">Описание не заполнено</span>') + '</p>' +
      '<p class="small muted">Адрес / объект: ' + esc(p.objectAddress || '—') + '<br>Создан: ' + fmtDT(p.createdAt) + ', ' + esc(A.userName(p.createdBy)) + '</p>' +
      '<h3 style="margin-top:20px">Команда проекта</h3><ul class="list">' + Object.keys(team).map(id => { const x = A.userById(id); return '<li><span>' + esc(x.fullName) + ' <span class="muted small">· ' + esc(A.ROLES[x.role]) + '</span></span><span class="small muted">этапы ' + team[id].join(', ') + '</span></li>'; }).join('') + '</ul></div>' +
      '<div><div class="card-head"><h3>Исходные документы</h3>' + (manage ? '<button class="btn sm" id="uploadSrc">' + icon('upload', 16) + 'Загрузить документ</button>' : '') + '</div>' +
      (src.length ? '<ul class="list">' + src.map(d => { const v = A.docVersions(d.id)[0]; return '<li><div><b>' + esc(d.title) + '</b><div class="xs muted">' + esc(d.type) + ' · ' + esc(v.fileName) + ' · v' + v.no + ' · ' + U.fmtSize(v.size) + '</div></div><div class="actions"><button class="btn sm" data-open-v="' + v.id + '">Открыть</button><button class="btn sm" data-dl-v="' + v.id + '">' + icon('download', 15) + '</button></div></li>'; }).join('') + '</ul>' : U.emptyState('Исходных документов нет', manage ? 'Загрузите задание заказчика, планы и исходные данные.' : '')) + '</div></div>';
  }
  function projDocs(ctx, u, p) {
    const docs = db().documents.filter(d => d.projectId === p.id && A.canViewDocument(u, d));
    return Views.docTable(ctx, docs, { hideProject: true });
  }
  function projReviews(ctx, u, p) {
    const rv = db().reviews.filter(r => { const s = A.find('stages', r.stageId); return s && s.projectId === p.id && A.canViewStage(u, s); }).sort((a, b) => b.date.localeCompare(a.date));
    const rem = db().remarks.filter(r => r.projectId === p.id && A.canViewRemark(u, r));
    bindRows(ctx);
    return '<h3>Решения проверяющих</h3>' + (rv.length ? '<div class="table-wrap" style="margin:10px 0 24px"><table><thead><tr><th>Дата</th><th>Этап</th><th>Версия</th><th>Проверяющий</th><th>Решение</th><th>Комментарий</th></tr></thead><tbody>' +
      rv.map(r => { const s = A.find('stages', r.stageId); const v = r.versionId ? A.find('versions', r.versionId) : null; return '<tr><td class="nowrap">' + fmtDT(r.date) + '</td><td>' + s.seq + '. ' + esc(s.name) + '</td><td>' + (v ? 'v' + v.no : '—') + '</td><td>' + esc(A.userName(r.reviewerId)) + '</td><td>' + badge(r.decision === 'accepted' ? ['Принято', 'green'] : r.decision === 'returned' ? ['Возврат', 'amber'] : ['Отмена приёмки', 'red']) + '</td><td class="small">' + esc(r.comment) + '</td></tr>'; }).join('') + '</tbody></table></div>' : U.emptyState('Решений пока нет')) +
      '<h3>Замечания</h3>' + Views.remarkTable(rem, { hideProject: true });
  }
  function projHistory(p) {
    const items = db().audit.filter(a => a.projectId === p.id && !['file.download'].includes(a.action)).sort((a, b) => b.date.localeCompare(a.date));
    if (!items.length) return U.emptyState('История пуста');
    return '<ul class="timeline">' + items.map(a => '<li><div>' + esc(a.description) + (a.oldValue || a.newValue ? '<div class="small muted">было: ' + esc(a.oldValue || '—') + ' → стало: ' + esc(a.newValue || '—') + '</div>' : '') + '</div><div class="xs muted">' + fmtDT(a.date) + ' · ' + esc(A.userName(a.userId)) + '</div></li>').join('') + '</ul>' +
      '<p class="xs muted">История не редактируется. Ошибочное действие исправляется новым действием с пояснением.</p>';
  }

  /* ================= Диалоги этапа ================= */
  Views.assignDialog = function (s) {
    const p = A.projectOf(s);
    const role = s.executorRole || (s.executorId ? A.userById(s.executorId).role : null);
    let cands = db().users.filter(x => x.status === 'active' && A.EXECUTOR_ROLES.includes(x.role) && (!role || x.role === role));
    const showAll = !role;
    const list = cands.map(x => ({ x, wl: A.workload(x.id) })).sort((a, b) => a.wl.pct - b.wl.pct || a.wl.active - b.wl.active);
    const anyApprox = list.some(w => w.wl.approx);
    const reviewers = db().users.filter(x => x.status === 'active' && ['expert', 'gip', 'director'].includes(x.role));
    const body = '<div class="card" style="background:var(--bg);display:flex;gap:32px;flex-wrap:wrap;margin-bottom:16px"><div><div class="xs muted">Роль</div><b>' + (role ? A.ROLES[role] : 'Любая исполнительская') + '</b></div><div><div class="xs muted">Срок этапа</div><b>' + fmtDate(s.deadline) + '</b></div><div><div class="xs muted">Плановая трудоёмкость</div><b>' + (s.effortHours ? s.effortHours + ' ч' : 'не задана') + '</b></div></div>' +
      '<div class="card-head" style="margin-bottom:8px"><h3>Подходящие сотрудники</h3><span class="small muted">Сначала с наименьшей загрузкой</span></div><div data-field="executorId">' +
      list.map((w, i) => '<label class="pick ' + (s.executorId === w.x.id ? 'on' : '') + '"><input type="radio" name="executorId" value="' + w.x.id + '" ' + (s.executorId === w.x.id || (!s.executorId && i === 0 && !w.wl.overload) ? 'checked' : '') + '>' +
        '<div><b>' + esc(w.x.fullName) + '</b>' + (showAll ? ' <span class="small muted">· ' + esc(A.ROLES[w.x.role]) + '</span>' : '') + '<div class="small muted">' + w.wl.active + ' ' + U.plural(w.wl.active, 'активная задача', 'активные задачи', 'активных задач') + (w.wl.overdue ? ' · есть просроченный этап' : w.wl.nearest ? ' · ближайший срок ' + fmtDate(w.wl.nearest) : '') + '</div>' +
        '<div style="margin-top:6px"><span class="bar ' + (w.wl.overload ? 'red' : '') + '"><i style="width:' + Math.min(100, w.wl.pct) + '%"></i></span><span class="small ' + (w.wl.overload ? 'red' : '') + '">Загрузка на период: ' + (w.wl.approx ? 'около ' : '') + w.wl.pct + '%</span></div></div>' +
        badge(w.wl.overload ? ['Перегрузка', 'red'] : ['Свободен', 'green']) + '</label>').join('') + '</div>' +
      U.alertBox('warn', (anyApprox ? 'Оценка приблизительная: плановая трудоёмкость задана не для всех задач. ' : 'Оценка по плановой трудоёмкости на 2 недели. ') + 'При выборе сотрудника с перегрузкой потребуется указать причину.') +
      '<div id="reasonBox" class="hidden">' + field('Причина выбора перегруженного сотрудника', '<textarea name="reason" rows="2"></textarea>', { req: true }) + '</div>' +
      field('Проверяющий', '<select name="reviewerId">' + options(reviewers.map(x => [x.id, x.fullName + ', ' + A.ROLES[x.role].toLowerCase()]), s.reviewerId) + '</select>', { req: true }) +
      '<div class="form-top-err"></div>';
    U.modal({
      title: 'Назначение исполнителя', subtitle: 'Этап ' + s.seq + ': ' + s.name + ' · ' + p.name, body, okLabel: 'Назначить', footNote: 'Исполнитель получит уведомление, назначение запишется в историю проекта.',
      onMount: (m) => {
        const upd = () => {
          m.querySelectorAll('.pick').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
          const sel = m.querySelector('[name=executorId]:checked');
          const over = sel && A.workload(Number(sel.value)).overload;
          m.querySelector('#reasonBox').classList.toggle('hidden', !over);
        };
        m.querySelectorAll('[name=executorId]').forEach(r => r.onchange = upd); upd();
      },
      onOk: (m) => {
        const d = U.readForm(m);
        A.assignStage(s.id, Number(d.executorId), Number(d.reviewerId), d.reason);
        U.toast('Исполнитель назначен, уведомление отправлено');
        window.App.go('#/project/' + p.id + '?tab=stages');
      }
    });
  };
  Views.stageDialog = function (p, s) {
    const others = A.stagesOf(p.id).filter(x => !s || x.id !== s.id);
    const execs = db().users.filter(x => x.status === 'active' && A.EXECUTOR_ROLES.includes(x.role));
    const reviewers = db().users.filter(x => x.status === 'active' && ['expert', 'gip', 'director'].includes(x.role));
    const d = s || { name: '', description: '', stageType: 'Схема', startDate: p.startDate, deadline: '', executorId: '', reviewerId: '', dependsOn: [], fileRequired: true, effortHours: '', expectedResult: '' };
    const started = s && p.status !== 'draft' && ['in_work', 'review', 'rework', 'accepted'].includes(A.stageState(s));
    const body = '<div class="form-top-err"></div><div class="form-grid">' +
      field('Название этапа', '<input name="name" value="' + esc(d.name) + '">', { req: true, cls: 'full' }) +
      field('Тип этапа', '<select name="stageType">' + options(A.STAGE_TYPES, d.stageType) + '</select>') +
      field('Требуемая роль исполнителя', '<select name="executorRole">' + options(A.EXECUTOR_ROLES.map(k => [k, A.ROLES[k]]), d.executorRole || '', 'Любая исполнительская') + '</select>', { hint: 'По ней подбираются сотрудники в диалоге назначения' }) +
      field('Плановая трудоёмкость, ч', '<input type="number" min="1" name="effortHours" value="' + esc(d.effortHours || '') + '">', { hint: 'Используется для оценки загрузки' }) +
      field('Плановая дата начала', '<input type="date" name="startDate" value="' + esc(d.startDate) + '">', { req: true }) +
      field('Плановая дата завершения', '<input type="date" name="deadline" value="' + esc(d.deadline) + '">', { req: true }) +
      field('Исполнитель', '<select name="executorId">' + options(execs.map(x => [x.id, x.fullName + ' — ' + A.ROLES[x.role]]), d.executorId, '— назначить позже —') + '</select>', { hint: 'Подбор с учётом загрузки — кнопка «Назначить» в таблице этапов' }) +
      field('Проверяющий', '<select name="reviewerId">' + options(reviewers.map(x => [x.id, x.fullName + ' — ' + A.ROLES[x.role]]), d.reviewerId, '— выберите —') + '</select>', { req: true }) +
      field('Ожидаемый результат', '<input name="expectedResult" value="' + esc(d.expectedResult) + '">', { cls: 'full' }) +
      field('Описание', '<textarea name="description" rows="2">' + esc(d.description) + '</textarea>', { cls: 'full' }) +
      '<div class="full" data-field="dependsOn" style="margin-bottom:14px"><b class="small">Зависит от этапов</b><div class="hint" style="margin-bottom:6px">Этап откроется только после принятия выбранных этапов. Независимые этапы выполняются параллельно.</div><div class="checks">' +
      (others.length ? others.map(o => '<label><input type="checkbox" data-multi="1" name="dependsOn" value="' + o.id + '" ' + ((d.dependsOn || []).includes(o.id) ? 'checked' : '') + '> ' + o.seq + '. ' + esc(o.name) + '</label>').join('') : '<span class="muted small">Других этапов нет</span>') + '</div></div>' +
      '<label class="full" style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" name="fileRequired" ' + (d.fileRequired ? 'checked' : '') + '> Загрузка файла результата обязательна</label>' +
      (started ? '<div class="full">' + U.alertBox('warn', 'Этап уже начат или принят. Изменение будет записано в историю — укажите причину.') + field('Причина изменения', '<textarea name="reason" rows="2"></textarea>', { req: true }) + '</div>' : '') + '</div>';
    U.modal({
      title: s ? 'Изменение этапа ' + s.seq : 'Новый этап', subtitle: p.name, body, wide: true, okLabel: s ? 'Сохранить этап' : 'Добавить этап',
      onOk: (m) => {
        const data = U.readForm(m);
        A.saveStage(p.id, data, s ? s.id : null, data.reason);
        U.toast(s ? 'Этап сохранён' : 'Этап добавлен');
        window.App.refresh();
      }
    });
  };

  /* ================= Общая таблица документов ================= */
  Views.docTable = function (ctx, docs, opts) {
    opts = opts || {};
    ctx.after(root => {
      root.querySelectorAll('[data-open-v]').forEach(x => x.onclick = (e) => { e.stopPropagation(); U.openVersion(Number(x.dataset.openV)); });
      root.querySelectorAll('[data-dl-v]').forEach(x => x.onclick = (e) => { e.stopPropagation(); U.downloadVersion(Number(x.dataset.dlV)); });
      root.querySelectorAll('[data-hist]').forEach(x => x.onclick = () => Views.versionHistory(A.find('documents', x.dataset.hist)));
    });
    if (!docs.length) return U.emptyState('Документы не найдены', opts.emptyText || '');
    return '<div class="table-wrap"><table><thead><tr><th>Документ</th>' + (opts.hideProject ? '' : '<th>Проект</th>') + '<th>Этап</th><th>Тип</th><th>Актуальная версия</th><th>Статус проверки</th><th>Загружена</th><th></th></tr></thead><tbody>' +
      docs.map(d => {
        const vs = A.docVersions(d.id), v = vs[0]; if (!v) return '';
        const s = d.stageId ? A.find('stages', d.stageId) : null, p = A.find('projects', d.projectId);
        return '<tr><td><b>' + esc(d.title) + '</b><div class="sub">' + esc(v.fileName) + ' · ' + U.fmtSize(v.size) + (d.kind === 'source' ? ' · исходный' : '') + '</div></td>' + (opts.hideProject ? '' : '<td><a href="#/project/' + p.id + '">' + esc(p.name) + '</a></td>') +
          '<td class="small">' + (s ? (A.canViewStage(window.PozhApi.me(), s) ? '<a href="#/stage/' + s.id + '">' + s.seq + '. ' + esc(s.name) + '</a>' : s.seq + '. ' + esc(s.name)) : '<span class="muted">исходные материалы</span>') + '</td><td>' + esc(d.type) + '</td><td>v' + v.no + ' <button class="btn link small" data-hist="' + d.id + '">история (' + vs.length + ')</button></td>' +
          '<td>' + (d.kind === 'source' ? '<span class="muted small">—</span>' : badge(A.VERSION_STATUS[v.status])) + '</td><td class="small nowrap">' + fmtDT(v.date) + '<div class="sub">' + esc(A.userName(v.authorId)) + '</div></td>' +
          '<td class="nowrap"><button class="btn sm" data-open-v="' + v.id + '">Открыть</button> <button class="btn sm" data-dl-v="' + v.id + '" aria-label="Скачать">' + icon('download', 15) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  };
  Views.versionHistory = function (d) {
    const vs = A.docVersions(d.id);
    U.modal({
      title: 'История версий', subtitle: d.title, wide: true, cancelLabel: 'Закрыть',
      body: '<div class="table-wrap"><table><thead><tr><th>Версия</th><th>Файл</th><th>Автор</th><th>Дата</th><th>Комментарий</th><th>Статус</th><th></th></tr></thead><tbody>' +
        vs.map(v => '<tr><td>v' + v.no + '</td><td>' + esc(v.fileName) + '<div class="sub">' + U.fmtSize(v.size) + '</div></td><td>' + esc(A.userName(v.authorId)) + '</td><td class="nowrap">' + fmtDT(v.date) + '</td><td class="small">' + esc(v.comment || '—') + '</td><td>' + (d.kind === 'source' ? '—' : badge(A.VERSION_STATUS[v.status])) + '</td><td class="nowrap"><button class="btn sm" data-ov="' + v.id + '">Открыть</button> <button class="btn sm" data-dv="' + v.id + '">' + icon('download', 15) + '</button></td></tr>').join('') +
        '</tbody></table></div><p class="xs muted">Предыдущие версии не перезаписываются. Принятую или историческую версию удалить нельзя.</p>',
      onMount: (m) => {
        m.querySelectorAll('[data-ov]').forEach(b => b.onclick = () => U.openVersion(Number(b.dataset.ov)));
        m.querySelectorAll('[data-dv]').forEach(b => b.onclick = () => U.downloadVersion(Number(b.dataset.dv)));
      }
    });
  };

  /* ================= Таблица замечаний ================= */
  Views.remarkTable = function (list, opts) {
    opts = opts || {};
    if (!list.length) return U.emptyState(opts.emptyTitle || 'Замечаний нет', opts.emptyText || '', opts.emptyBtn || '');
    return '<div class="table-wrap"><table><thead><tr><th>№</th>' + (opts.hideProject ? '' : '<th>Проект</th>') + '<th>Этап</th><th>Документ / версия</th><th>Раздел</th><th>Текст</th><th>Автор</th><th>Исполнитель</th><th>Дата</th><th>Критичность</th><th>Срок</th><th>Статус</th></tr></thead><tbody>' +
      list.map(r => {
        const s = A.find('stages', r.stageId), d = A.find('documents', r.documentId), v = A.find('versions', r.versionId), p = A.find('projects', r.projectId);
        const over = r.deadline && A.daysTo(r.deadline) < 0 && ['open', 'rework'].includes(r.status);
        return '<tr class="click" data-href="#/remark/' + r.id + '"><td class="nowrap"><a href="#/remark/' + r.id + '"><b>' + esc(r.number) + '</b></a></td>' + (opts.hideProject ? '' : '<td class="small">' + esc(p.name) + '</td>') + '<td class="small">' + (s ? s.seq + '. ' + esc(s.name) : '—') + '</td><td class="small">' + esc(d ? d.title : '—') + (v ? ' · v' + v.no : '') + '</td><td class="small">' + esc(r.section) + '</td>' +
          '<td style="min-width:220px">' + esc(r.text) + '</td><td class="small">' + esc(A.userName(r.authorId)) + '</td><td class="small">' + esc(A.userName(r.executorId)) + '</td><td class="small nowrap">' + fmtDate(r.createdAt) + '</td><td>' + badge(A.SEVERITY[r.severity]) + '</td><td class="small nowrap ' + (over ? 'red' : '') + '">' + (r.deadline ? fmtDate(r.deadline) : '—') + '</td><td>' + badge(A.REMARK_STATUS[r.status]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  window.ViewHelpers = { statBox, bindRows, taskCard, loadBar, loadLabel, eventsList, clientName };
})();

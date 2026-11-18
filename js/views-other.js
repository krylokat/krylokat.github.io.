/* Экраны: замечания, документы, клиенты, сотрудники, ИИ-помощник, архив ИИ, отчёты, журнал, уведомления, профиль, поиск. */
(function () {
  'use strict';
  const A = window.PozhApi, S = window.PozhStore, U = window.UI;
  const { esc, icon, badge, fmtDate, fmtDT, field, options } = U;
  const Views = window.Views = window.Views || {};
  const H = () => window.ViewHelpers;
  const db = () => S.db;
  const forbid = (m) => { throw new window.App.Forbidden(m); };
  const setQ = (q) => window.App.setQuery(q);

  /* ================= Замечания ================= */
  Views.remarks = function (ctx) {
    const u = ctx.user, q = ctx.query;
    ctx.title = '<b>Замечания</b>';
    const all = A.visibleRemarks(u);
    let list = all.slice();
    const f = q.f || (['designer', 'calculator', 'estimator', 'manager'].includes(u.role) ? 'mine' : 'open');
    if (f === 'mine') list = list.filter(r => r.executorId === u.id || (u.role === 'expert' && r.authorId === u.id));
    if (f === 'open') list = list.filter(r => ['open', 'rework', 'fixed'].includes(r.status));
    if (f === 'rework') list = list.filter(r => ['open', 'rework'].includes(r.status));
    if (f === 'fixed') list = list.filter(r => r.status === 'fixed');
    if (f === 'closed') list = list.filter(r => ['accepted', 'irrelevant'].includes(r.status));
    if (q.project) list = list.filter(r => r.projectId === Number(q.project));
    if (q.sev) list = list.filter(r => r.severity === q.sev);
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(r => (r.number + ' ' + r.text + ' ' + r.section).toLowerCase().includes(n)); }
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pg = U.paginate(list, Number(q.page) || 1, 15);
    const projects = Array.from(new Set(all.map(r => r.projectId))).map(id => A.find('projects', id));
    const chips = [['mine', 'Назначенные мне'], ['open', 'Открытые'], ['rework', 'На доработке'], ['fixed', 'Ожидают повторной проверки'], ['closed', 'Закрытые'], ['all', 'Все']];
    ctx.after(root => {
      const fm = root.querySelector('#rFilters');
      fm.onchange = () => setQ({ project: fm.project.value, sev: fm.sev.value, page: '' });
      fm.onsubmit = (e) => { e.preventDefault(); setQ({ q: fm.q.value, page: '' }); };
      root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => setQ({ f: b.dataset.f, page: '' }));
      root.querySelectorAll('[data-page]').forEach(b => b.onclick = () => setQ({ page: b.dataset.page }));
    });
    H().bindRows(ctx);
    return '<div class="page-head"><div><h1>Замечания</h1><p>Замечания связаны с проектом, этапом, документом, версией и ответственным исполнителем</p></div></div>' +
      '<div class="card"><div class="actions" style="margin-bottom:12px">' + chips.map(c => '<button class="btn sm ' + (f === c[0] ? 'primary' : '') + '" data-f="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
      '<form id="rFilters" class="filters"><input class="grow" name="q" placeholder="Поиск по номеру, тексту, разделу" value="' + esc(q.q || '') + '" aria-label="Поиск"><select name="project" aria-label="Проект">' + options(projects.map(p => [p.id, p.name]), q.project, 'Все проекты') + '</select>' +
      '<select name="sev" aria-label="Критичность">' + options(Object.keys(A.SEVERITY).map(k => [k, A.SEVERITY[k][0]]), q.sev, 'Любая критичность') + '</select></form>' +
      Views.remarkTable(pg.items, { emptyTitle: 'Замечания не найдены', emptyText: 'Измените фильтр или условия поиска.', emptyBtn: '<a class="btn" href="#/remarks?f=all">Очистить фильтры</a>' }) + U.pagerHtml(pg, 'Замечаний') + '</div>';
  };

  Views.remark = function (ctx) {
    const u = ctx.user;
    const r = A.find('remarks', ctx.params.id);
    if (!r) throw new window.App.NotFound('Замечание не найдено');
    if (!A.canViewRemark(u, r)) forbid('Замечание адресовано другому сотруднику или относится к недоступному проекту.');
    const s = A.find('stages', r.stageId), p = A.find('projects', r.projectId), d = A.find('documents', r.documentId), v = A.find('versions', r.versionId);
    ctx.title = '<a href="#/remarks">Замечания</a> / <b>' + esc(r.number) + '</b>';
    const canIrr = !['accepted', 'irrelevant'].includes(r.status) && (u.role === 'director' || A.canManageProject(u, p) || r.authorId === u.id);
    const laterVers = d ? A.docVersions(d.id).filter(x => x.no >= (v ? v.no : 0)) : [];
    const ai = db().aiArchive.find(a => a.sourceRemarkId === r.id);
    ctx.after(root => {
      const cf = root.querySelector('#cForm');
      cf.onsubmit = (e) => { e.preventDefault(); try { A.commentRemark(r.id, cf.text.value); U.toast('Сообщение добавлено'); window.App.refresh(); } catch (er) { U.handleError(er, cf); } };
      const ib = root.querySelector('#irrBtn');
      if (ib) ib.onclick = () => U.modal({
        title: 'Отметить замечание неактуальным?', body: '<div class="form-top-err"></div><p>Замечание будет закрыто со статусом «Неактуально». Запись и история сохраняются.</p>' + field('Объяснение', '<textarea name="reason" rows="3"></textarea>', { req: true }),
        okLabel: 'Отметить неактуальным', okClass: 'danger', onOk: (m) => { A.markRemarkIrrelevant(r.id, U.readForm(m).reason); U.toast('Замечание отмечено неактуальным'); window.App.refresh(); }
      });
      root.querySelectorAll('[data-open-v]').forEach(x => x.onclick = () => U.openVersion(Number(x.dataset.openV)));
      const aib = root.querySelector('#aiSimilar'); if (aib) aib.onclick = () => Views.aiPanel({ query: r.text, stageType: s && s.stageType });
    });
    const kv = (k, val) => '<div class="kv"><div class="k">' + k + '</div><div class="v" style="font-weight:500">' + val + '</div></div>';
    return '<div class="page-head"><div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><h1>Замечание ' + esc(r.number) + '</h1>' + badge(A.SEVERITY[r.severity]) + badge(A.REMARK_STATUS[r.status]) + (r.external ? badge(['Внешнее', 'gray']) : '') + '</div><p>' + esc(p.name) + ' · этап ' + s.seq + ' «' + esc(s.name) + '»</p></div>' +
      '<div class="actions">' + (A.canViewStage(u, s) ? '<a class="btn" href="#/stage/' + s.id + '">Открыть этап</a>' : '') + '<button class="btn" id="aiSimilar">' + icon('spark', 16) + 'Похожие случаи</button>' + (canIrr ? '<button class="btn danger" id="irrBtn">Неактуально</button>' : '') + '</div></div>' +
      (r.executorId === u.id && ['open', 'rework'].includes(r.status) ? U.alertBox('warn', 'Замечание адресовано вам. Исправьте документ, загрузите новую версию на странице этапа и передайте её на проверку. Удалить замечание или отметить его принятым может только проверяющий.') : '') +
      '<div class="side-grid"><div><div class="card"><h2>Текст замечания</h2><p style="font-size:16px">' + esc(r.text) + '</p><div class="small muted">Раздел / лист: ' + esc(r.section) + ' · категория: ' + esc(r.category) + '</div></div>' +
      '<div class="card"><h2 style="margin-bottom:8px">Переписка</h2>' + (r.comments.length ? '<ul class="list">' + r.comments.map(c => '<li><div><b class="small">' + esc(A.userName(c.userId)) + '</b><div>' + esc(c.text) + '</div></div><span class="xs muted nowrap">' + fmtDT(c.date) + '</span></li>').join('') + '</ul>' : '<p class="muted small">Сообщений нет</p>') +
      '<form id="cForm" style="margin-top:10px"><div class="form-top-err"></div><label class="f"><span>Новое сообщение</span><textarea name="text" rows="2" placeholder="Уточнение, ответ исполнителя, ссылка на исправление"></textarea></label><button class="btn" type="submit">Отправить</button></form></div>' +
      '<div class="card"><h2 style="margin-bottom:8px">Связанные версии</h2>' + (laterVers.length ? laterVers.map(x => '<div class="ver"><div><b>v' + x.no + '</b> · ' + esc(x.fileName) + ' ' + badge(A.VERSION_STATUS[x.status]) + (x.id === r.versionId ? ' <span class="xs muted">— замечание к этой версии</span>' : '') + '<div class="small muted">' + fmtDT(x.date) + ' · ' + esc(x.comment || '') + '</div></div>' + (A.canViewDocument(u, d) ? '<button class="btn sm" data-open-v="' + x.id + '">Открыть</button>' : '') + '</div>').join('') : '<p class="muted small">—</p>') + '</div></div>' +
      '<div><div class="card"><h2 style="margin-bottom:6px">Сведения</h2>' + kv('Проект', esc(p.name) + ' · ' + esc(p.number)) + kv('Этап', s.seq + '. ' + esc(s.name)) + kv('Документ', esc(d ? d.title : '—') + (v ? ', версия ' + v.no : '')) +
      kv('Автор', esc(A.userName(r.authorId))) + kv('Ответственный исполнитель', esc(A.userName(r.executorId))) + kv('Дата', fmtDT(r.createdAt)) + kv('Срок исправления', r.deadline ? fmtDate(r.deadline, true) : '—') +
      (ai ? kv('Архив ИИ', badge(A.AI_STATUS[ai.status])) : '') + '</div>' +
      '<div class="card"><h2 style="margin-bottom:8px">История статусов</h2><ul class="timeline">' + r.history.slice().reverse().map(h => '<li><div>' + badge(A.REMARK_STATUS[h.status]) + '</div><div class="small">' + esc(h.comment || '') + '</div><div class="xs muted">' + fmtDT(h.date) + ' · ' + esc(A.userName(h.userId)) + '</div></li>').join('') + '</ul></div></div></div>';
  };

  /* ================= Документы ================= */
  Views.documents = function (ctx) {
    const u = ctx.user, q = ctx.query;
    ctx.title = '<b>Документы</b>';
    const all = A.visibleDocuments(u);
    let list = all.slice();
    if (q.project) list = list.filter(d => d.projectId === Number(q.project));
    if (q.type) list = list.filter(d => d.type === q.type);
    if (q.kind) list = list.filter(d => d.kind === q.kind);
    if (q.vstatus) list = list.filter(d => { const v = A.docVersions(d.id)[0]; return v && v.status === q.vstatus; });
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(d => d.title.toLowerCase().includes(n) || A.docVersions(d.id).some(v => v.fileName.toLowerCase().includes(n))); }
    list.sort((a, b) => ((A.docVersions(b.id)[0] || {}).date || '').localeCompare((A.docVersions(a.id)[0] || {}).date || ''));
    const pg = U.paginate(list, Number(q.page) || 1, 15);
    const projects = Array.from(new Set(all.map(d => d.projectId))).map(id => A.find('projects', id));
    ctx.after(root => {
      const f = root.querySelector('#dFilters');
      f.onchange = () => setQ({ project: f.project.value, type: f.type.value, kind: f.kind.value, vstatus: f.vstatus.value, page: '' });
      f.onsubmit = (e) => { e.preventDefault(); setQ({ q: f.q.value, page: '' }); };
      root.querySelectorAll('[data-page]').forEach(b => b.onclick = () => setQ({ page: b.dataset.page }));
    });
    return '<div class="page-head"><div><h1>Документы</h1><p>' + (u.role === 'director' ? 'Документы всех проектов' : 'Документы по вашим проектам и назначенным этапам') + '</p></div></div>' +
      U.alertBox('info', 'Поддерживаемые форматы: <b>PDF</b> (просмотр в браузере), <b>DOCX, XLSX, DWG, DXF</b> (хранение и скачивание; DWG/DXF открываются во внешней CAD-программе). Максимальный размер — 25 МБ, исполняемые файлы запрещены. Новые версии загружаются на странице этапа; прежние версии не перезаписываются.') +
      '<div class="card"><form id="dFilters" class="filters"><input class="grow" name="q" placeholder="Поиск по названию или имени файла" value="' + esc(q.q || '') + '" aria-label="Поиск документов">' +
      '<select name="project" aria-label="Проект">' + options(projects.map(p => [p.id, p.name]), q.project, 'Все проекты') + '</select><select name="type" aria-label="Тип">' + options(A.DOC_TYPES, q.type, 'Все типы') + '</select>' +
      '<select name="kind" aria-label="Вид">' + options([['result', 'Результаты'], ['source', 'Исходные']], q.kind, 'Все виды') + '</select>' +
      '<select name="vstatus" aria-label="Статус версии">' + options(Object.keys(A.VERSION_STATUS).map(k => [k, A.VERSION_STATUS[k][0]]), q.vstatus, 'Любой статус версии') + '</select></form>' +
      Views.docTable(ctx, pg.items, { emptyText: 'Измените фильтры или условия поиска.' }) + U.pagerHtml(pg, 'Документов') + '</div>';
  };

  /* ================= Клиенты ================= */
  Views.clientDialog = function (c, onSaved) {
    const d = c || { name: '', type: 'Юридическое лицо', contactPerson: '', phone: '', email: '', address: '', note: '', inn: '', source: '' };
    const body = '<div class="form-top-err"></div><div id="dupBox"></div><div class="form-grid">' + field('Название организации или ФИО', '<input name="name" value="' + esc(d.name) + '">', { req: true, cls: 'full' }) +
      field('Тип клиента', '<select name="type">' + options(['Юридическое лицо', 'Индивидуальный предприниматель', 'Физическое лицо', 'Государственное учреждение'], d.type) + '</select>') + field('ИНН / идентификатор', '<input name="inn" value="' + esc(d.inn || '') + '">', { hint: 'Необязательно; вносится, только если известен' }) +
      field('Контактное лицо', '<input name="contactPerson" value="' + esc(d.contactPerson) + '">') + field('Телефон', '<input name="phone" value="' + esc(d.phone) + '">') +
      field('Электронная почта', '<input name="email" value="' + esc(d.email) + '">') + field('Адрес', '<input name="address" value="' + esc(d.address) + '">') +
      field('Источник сведений', '<input name="source" value="' + esc(d.source || '') + '" placeholder="Заявка, договор, письмо заказчика">', { req: true, cls: 'full', hint: 'Сверьте запись с источником; реквизиты не придумываются' }) +
      field('Примечание', '<textarea name="note" rows="2">' + esc(d.note || '') + '</textarea>', { cls: 'full' }) + '</div>';
    let force = false;
    U.modal({
      title: c ? 'Изменение клиента' : 'Новый клиент', wide: true, body, okLabel: c ? 'Сохранить изменения' : 'Добавить клиента',
      onOk: (m) => {
        try {
          const saved = A.saveClient(U.readForm(m), c ? c.id : null, force);
          U.toast(c ? 'Клиент сохранён' : 'Клиент добавлен в справочник');
          if (onSaved) onSaved(saved); else window.App.refresh();
        } catch (e) {
          if (e.duplicate) {
            force = true;
            m.querySelector('#dupBox').innerHTML = U.alertBox('warn', '<b>' + esc(e.message) + '.</b> Откройте существующую запись или нажмите кнопку ещё раз, чтобы всё равно сохранить.<br><a href="#/clients?sel=' + e.duplicate.id + '" data-close>Открыть существующую запись</a>');
            return false;
          }
          throw e;
        }
      }
    });
  };
  Views.clients = function (ctx) {
    const u = ctx.user, q = ctx.query;
    if (!(u.role === 'director' || u.role === 'gip' || u.canManageClients)) forbid();
    ctx.title = '<b>Клиенты</b>';
    const manage = A.canManageClients(u);
    let list = db().clients.slice();
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(c => (c.name + ' ' + c.contactPerson + ' ' + c.email + ' ' + (c.inn || '')).toLowerCase().includes(n)); }
    if (q.status) list = list.filter(c => c.status === q.status);
    list.sort((a, b) => a.name.localeCompare(b.name));
    const sel = q.sel ? A.find('clients', q.sel) : null;
    ctx.after(root => {
      const f = root.querySelector('#cFilters');
      f.onchange = () => setQ({ status: f.status.value });
      f.onsubmit = (e) => { e.preventDefault(); setQ({ q: f.q.value }); };
      const add = root.querySelector('#addClient'); if (add) add.onclick = () => Views.clientDialog(null);
      root.querySelectorAll('tr[data-cid]').forEach(tr => { tr.tabIndex = 0; tr.onclick = () => setQ({ sel: tr.dataset.cid }); tr.onkeydown = (e) => { if (e.key === 'Enter') setQ({ sel: tr.dataset.cid }); }; });
      if (sel) {
        const ed = root.querySelector('#cEdit'); if (ed) ed.onclick = () => Views.clientDialog(sel);
        const ar = root.querySelector('#cArch');
        if (ar) ar.onclick = async () => {
          const toArch = sel.status === 'active';
          if (!(await U.confirmDlg(toArch ? 'Перевести клиента в архив?' : 'Восстановить клиента?', toArch ? 'Клиент станет неактивным и не будет предлагаться при создании проектов. Связанные проекты, документы и история сохраняются.' : 'Клиент снова будет доступен при создании проектов.', toArch ? 'Перевести в архив' : 'Восстановить', toArch ? 'warn' : 'primary'))) return;
          try { A.setClientStatus(sel.id, toArch ? 'archived' : 'active'); U.toast('Статус клиента изменён'); window.App.refresh(); } catch (e) { U.handleError(e); }
        };
        const del = root.querySelector('#cDel');
        if (del) del.onclick = async () => {
          if (!(await U.confirmDlg('Удалить клиента?', 'Клиент без связанных проектов будет удалён из справочника. Действие записывается в журнал.', 'Удалить', 'danger'))) return;
          try { A.deleteClient(sel.id); U.toast('Клиент удалён'); setQ({ sel: '' }); } catch (e) { U.handleError(e); }
        };
      }
    });
    const projCount = (c) => db().projects.filter(p => p.clientId === c.id).length;
    let panel = '';
    if (sel) {
      const ps = db().projects.filter(p => p.clientId === sel.id && A.canViewProject(u, p));
      panel = '<div class="card"><h2>' + esc(sel.name) + '</h2><div style="margin:6px 0 10px">' + badge(sel.status === 'active' ? ['Активный', 'green'] : ['В архиве', 'gray']) + '</div>' +
        ['type:Тип', 'inn:ИНН / идентификатор', 'contactPerson:Контактное лицо', 'phone:Телефон', 'email:Почта', 'address:Адрес', 'source:Источник сведений', 'note:Примечание'].map(x => { const [k, l] = x.split(':'); return '<div class="kv"><div class="k">' + l + '</div><div class="v" style="font-weight:500">' + esc(sel[k] || '—') + '</div></div>'; }).join('') +
        '<div class="kv"><div class="k">Изменено</div><div class="v" style="font-weight:500">' + fmtDT(sel.updatedAt) + ' · ' + esc(A.userName(sel.updatedBy)) + '</div></div>' +
        '<div class="kv"><div class="k">Проекты</div><div class="v" style="font-weight:500">' + (ps.length ? ps.map(p => '<a href="#/project/' + p.id + '">' + esc(p.name) + '</a>').join('<br>') : '—') + '</div></div>' +
        (manage ? '<div style="display:grid;gap:8px;margin-top:12px"><button class="btn" id="cEdit">Изменить данные</button><button class="btn ' + (sel.status === 'active' ? 'warn' : '') + '" id="cArch">' + (sel.status === 'active' ? 'Перевести в архив' : 'Восстановить') + '</button>' + (!projCount(sel) ? '<button class="btn danger" id="cDel">Удалить</button>' : '<div class="why">Клиента со связанными проектами удалить нельзя — только архивировать.</div>') + '</div>' : '<p class="why">Изменять справочник может директор или сотрудник с делегированным правом. Об ошибке сообщите директору.</p>') + '</div>';
    }
    return '<div class="page-head"><div><h1>Клиенты</h1><p>Справочник заказчиков. Источник — сведения от самого заказчика (заявка, договор). Ответственный — директор или уполномоченный сотрудник.</p></div>' +
      (manage ? '<div class="actions"><button class="btn primary" id="addClient">' + icon('plus') + 'Добавить клиента</button></div>' : '') + '</div>' +
      '<div class="' + (sel ? 'side-grid' : '') + '"><div class="card"><form id="cFilters" class="filters"><input class="grow" name="q" placeholder="Название, контакт, почта или ИНН" value="' + esc(q.q || '') + '" aria-label="Поиск клиентов"><select name="status" aria-label="Статус">' + options([['active', 'Активные'], ['archived', 'В архиве']], q.status, 'Все статусы') + '</select></form>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Название или ФИО</th><th>Контактное лицо</th><th>Телефон</th><th>Почта</th><th>Проектов</th><th>Статус</th><th>Изменено</th></tr></thead><tbody>' +
        list.map(c => '<tr class="click ' + (sel && sel.id === c.id ? 'sel' : '') + '" data-cid="' + c.id + '"><td><b>' + esc(c.name) + '</b><div class="sub">' + esc(c.type) + '</div></td><td>' + esc(c.contactPerson || '—') + '</td><td class="nowrap">' + esc(c.phone || '—') + '</td><td>' + esc(c.email || '—') + '</td><td>' + projCount(c) + '</td><td>' + badge(c.status === 'active' ? ['Активный', 'green'] : ['В архиве', 'gray']) + '</td><td class="small nowrap">' + fmtDate(c.updatedAt) + '</td></tr>').join('') + '</tbody></table></div>'
        : U.emptyState('Клиенты не найдены', '', '<a class="btn" href="#/clients">Очистить фильтры</a>')) + '</div>' + panel + '</div>';
  };

  /* ================= Сотрудники ================= */
  function userDialog(t) {
    const d = t || { fullName: '', email: '', role: 'designer', department: '', phone: '', canManageClients: false };
    U.modal({
      title: t ? 'Изменить данные сотрудника' : 'Добавить сотрудника', wide: true,
      body: '<div class="form-top-err"></div><div class="form-grid">' + field('ФИО', '<input name="fullName" value="' + esc(d.fullName) + '" placeholder="Иванов И. И.">', { req: true }) +
        field('Рабочая электронная почта', '<input name="email" type="email" value="' + esc(d.email) + '">', { req: true, hint: 'Должна быть уникальной' }) +
        (t ? '' : field('Роль', '<select name="role">' + options(Object.keys(A.ROLES).map(k => [k, A.ROLES_FULL[k]]), d.role) + '</select>', { req: true })) +
        field('Подразделение', '<input name="department" value="' + esc(d.department || '') + '">') + field('Телефон', '<input name="phone" value="' + esc(d.phone || '') + '">') +
        '<label class="full" style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" name="canManageClients" ' + (d.canManageClients ? 'checked' : '') + '> Делегировать право ведения справочника клиентов</label></div>' +
        (t ? '' : U.alertBox('info', 'Система сгенерирует временный пароль. Покажите его сотруднику лично — при первом входе он обязан сменить пароль. Пароль в открытом виде больше нигде не отображается.')),
      okLabel: t ? 'Сохранить' : 'Добавить сотрудника',
      onOk: (m) => {
        const data = U.readForm(m);
        if (t) { A.updateUser(t.id, data); U.toast('Данные сохранены'); window.App.refresh(); return; }
        const res = A.createUser(data);
        showTempPassword(res.user, res.tempPassword, true);
      }
    });
  }
  function showTempPassword(user, pw, created) {
    U.modal({
      title: created ? 'Учётная запись создана' : 'Доступ сброшен', cancelLabel: 'Готово', onClose: () => window.App.go('#/users?sel=' + user.id),
      body: '<p>' + esc(user.fullName) + ' · ' + esc(user.email) + '</p><div class="card" style="background:var(--bg);text-align:center"><div class="small muted">Временный пароль (показывается один раз)</div><div style="font-size:22px;font-weight:700;letter-spacing:1px;font-family:monospace">' + esc(pw) + '</div></div><p class="small muted">При первом входе сотрудник будет обязан сменить пароль. В базе хранится только хеш.</p>'
    });
  }
  Views.users = function (ctx) {
    const u = ctx.user, q = ctx.query;
    if (!A.canManageUsers(u)) forbid('Раздел «Сотрудники и учётные записи» доступен только директору и сотрудникам с делегированным правом.');
    ctx.title = '<b>Сотрудники</b>';
    let list = db().users.slice();
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(x => (x.fullName + ' ' + x.email).toLowerCase().includes(n)); }
    if (q.role) list = list.filter(x => x.role === q.role);
    if (q.status) list = list.filter(x => x.status === q.status);
    const sel = A.userById(q.sel) || null;
    ctx.after(root => {
      const f = root.querySelector('#uFilters');
      f.onchange = () => setQ({ role: f.role.value, status: f.status.value });
      f.onsubmit = (e) => { e.preventDefault(); setQ({ q: f.q.value }); };
      f.q.oninput = () => { const n = f.q.value.toLowerCase(); root.querySelectorAll('tr[data-uid]').forEach(tr => tr.classList.toggle('hidden', !tr.textContent.toLowerCase().includes(n))); };
      root.querySelector('#addUser').onclick = () => userDialog(null);
      root.querySelectorAll('tr[data-uid]').forEach(tr => { tr.tabIndex = 0; tr.onclick = () => setQ({ sel: tr.dataset.uid }); tr.onkeydown = (e) => { if (e.key === 'Enter') setQ({ sel: tr.dataset.uid }); }; });
      if (!sel) return;
      const on = (id, fn) => { const b = root.querySelector(id); if (b) b.onclick = fn; };
      on('#uEdit', () => userDialog(sel));
      on('#uRole', () => U.modal({
        title: 'Сменить роль', subtitle: sel.fullName + ' · сейчас: ' + A.ROLES[sel.role], body: '<div class="form-top-err"></div>' + field('Новая роль', '<select name="role">' + options(Object.keys(A.ROLES).map(k => [k, A.ROLES_FULL[k]]), sel.role) + '</select>', { req: true }) + U.alertBox('info', 'Изменение действует со следующего действия пользователя. Назначенные этапы и авторство сохраняются.'),
        okLabel: 'Сменить роль', onOk: (m) => { A.changeRole(sel.id, U.readForm(m).role); U.toast('Роль изменена'); window.App.refresh(); }
      }));
      on('#uReset', async () => {
        if (!(await U.confirmDlg('Сбросить доступ?', 'Текущий пароль перестанет действовать. Будет выдан временный пароль, который сотрудник сменит при входе.', 'Сбросить доступ'))) return;
        try { showTempPassword(sel, A.resetAccess(sel.id), false); } catch (e) { U.handleError(e); }
      });
      const st = async (status, title, text, label, cls) => {
        if (!(await U.confirmDlg(title, text, label, cls))) return;
        try { A.setUserStatus(sel.id, status); U.toast('Статус учётной записи изменён'); window.App.refresh(); } catch (e) { U.handleError(e); }
      };
      on('#uBlock', () => st('blocked', 'Заблокировать учётную запись?', esc(sel.fullName) + ' не сможет войти в систему. Проекты, документы, решения и замечания сотрудника не удаляются, авторство сохраняется. Блокировку можно снять.', 'Заблокировать', 'warn'));
      on('#uDeact', () => st('deactivated', 'Деактивировать учётную запись?', esc(sel.fullName) + ' не сможет войти в систему (например, при увольнении). Сотрудник с историей не удаляется: проекты, документы и замечания сохраняются.', 'Деактивировать', 'danger'));
      on('#uActivate', () => st('active', 'Восстановить доступ?', 'Сотрудник снова сможет войти в систему.', 'Восстановить'));
    });
    const lastLogin = (x) => x.lastLogin ? fmtDT(x.lastLogin) : 'не входил';
    let panel = '';
    if (sel) {
      const self = sel.id === u.id;
      panel = '<div class="card"><h2>' + esc(sel.fullName) + '</h2>' +
        [['Рабочая почта', esc(sel.email)], ['Роль', esc(A.ROLES_FULL[sel.role])], ['Подразделение', esc(sel.department || '—')], ['Телефон', esc(sel.phone || '—')], ['Статус', badge(A.USER_STATUS[sel.status])], ['Последний вход', lastLogin(sel)],
          ['Права', (sel.canManageUsers ? 'учётные записи; ' : '') + (sel.canManageClients || sel.role === 'director' ? 'ведение клиентов' : '—')]].map(x => '<div class="kv"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>').join('') +
        '<div style="display:grid;gap:8px;margin-top:12px"><button class="btn" id="uEdit">Изменить данные</button>' + (self ? '' : '<button class="btn" id="uRole">Сменить роль</button>') + '<button class="btn" id="uReset">Сбросить доступ</button>' +
        (self ? '<div class="why">Собственную роль и статус изменить нельзя.</div>' : sel.status === 'active' ? '<button class="btn warn" id="uBlock">Заблокировать</button><button class="btn danger" id="uDeact">Деактивировать</button>' : '<button class="btn primary" id="uActivate">Восстановить доступ</button>' + (sel.status === 'blocked' ? '<button class="btn danger" id="uDeact">Деактивировать</button>' : '')) + '</div>' +
        '<p class="why" style="margin-top:12px">Пароль в открытом виде не отображается. Блокировка и деактивация не удаляют проекты, документы и замечания сотрудника. Все действия записываются в журнал аудита.</p></div>';
    }
    return '<div class="page-head"><div><h1>Сотрудники и учётные записи</h1><p>Публичной регистрации нет: учётные записи создаёт директор или уполномоченный им сотрудник</p></div><div class="actions"><button class="btn primary" id="addUser">' + icon('plus') + 'Добавить сотрудника</button></div></div>' +
      '<div class="side-grid"><div class="card"><form id="uFilters" class="filters"><input class="grow" name="q" placeholder="ФИО или почта" value="' + esc(q.q || '') + '" aria-label="Поиск сотрудников">' +
      '<select name="role" aria-label="Роль">' + options(Object.keys(A.ROLES).map(k => [k, A.ROLES[k]]), q.role, 'Все роли') + '</select><select name="status" aria-label="Статус">' + options(Object.keys(A.USER_STATUS).map(k => [k, A.USER_STATUS[k][0]]), q.status, 'Все статусы') + '</select></form>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>ФИО</th><th>Роль</th><th>Подразделение</th><th>Статус</th><th>Последний вход</th></tr></thead><tbody>' + list.map(x => '<tr class="click ' + (sel && sel.id === x.id ? 'sel' : '') + '" data-uid="' + x.id + '"><td><b>' + esc(x.fullName) + '</b><div class="sub">' + esc(x.email) + '</div></td><td>' + esc(A.ROLES[x.role]) + '</td><td class="small">' + esc(x.department || '—') + '</td><td>' + badge(A.USER_STATUS[x.status]) + '</td><td class="small nowrap">' + lastLogin(x) + '</td></tr>').join('') + '</tbody></table></div>'
        : U.emptyState('Сотрудники не найдены', '', '<a class="btn" href="#/users">Очистить фильтры</a>')) + '</div>' +
      (panel || '<div class="card"><p class="muted">Выберите сотрудника в таблице, чтобы увидеть данные и действия.</p></div>') + '</div>';
  };

  /* ================= ИИ-помощник ================= */
  Views.runAi = function (form, out, onDraft) {
    const d = U.readForm(form);
    U.clearErrors(form);
    let res;
    try { res = A.aiSearch(d.query, { stageType: d.stageType, docType: d.docType }); } catch (e) { U.handleError(e, form); return; }
    const thr = Math.round(db().meta.aiThreshold * 100);
    if (!res.results.length) {
      out.innerHTML = '<div class="card">' + U.emptyState('Не найдено достаточно похожих примеров', 'В архиве нет записей со сходством выше ' + thr + '%. Помощник ничего не придумывает — выполните обычную проверку по нормативам и опыту специалиста.') + '</div>';
      return;
    }
    out.innerHTML = '<div class="card-head"><h2>Найдено ' + res.results.length + ' ' + U.plural(res.results.length, 'похожее замечание', 'похожих замечания', 'похожих замечаний') + '</h2><span class="small muted">Показаны записи со сходством выше ' + thr + '%</span></div>' +
      '<p class="small muted" style="margin-top:-6px">Записи отсортированы по убыванию сходства. Учитываются только записи, к которым у вас есть доступ.</p><div id="draftBox"></div>' +
      res.results.map((r, i) => {
        const pct = Math.round(r.score * 100), a = r.rec;
        return '<div class="ai-card"><div class="top"><h3>' + esc(a.title) + '</h3><div class="sim"><div class="bar"><i style="width:' + pct + '%"></i></div>Сходство ' + pct + '%</div></div>' +
          '<p style="margin:8px 0 0">' + esc(a.text) + '</p><div class="lbl">Почему найдено</div><div class="small">' + esc(r.reasons.join('; ') || 'близость формулировок') + '</div>' +
          '<div class="lbl">Как устраняли раньше</div><div class="small">' + esc(a.fix || 'Способ устранения не указан') + '</div>' +
          '<div class="small muted" style="margin-top:10px">' + esc(a.sourceLabel) + ' · ' + esc(a.category) + ' · ' + badge(['Проверено специалистом', 'green']) + ' · ' + fmtDate(a.checkedAt || a.createdAt) + (a.isTest ? ' · демо-пример' : '') + '</div>' +
          '<div class="btns"><button class="btn sm" data-ai-open="' + i + '">Открыть запись</button><button class="btn sm primary" data-ai-draft="' + i + '">Использовать как черновик</button>' +
          '<span class="right"><button class="btn sm" data-ai-fb="1" data-i="' + i + '">Полезно</button><button class="btn sm" data-ai-fb="0" data-i="' + i + '">Не полезно</button></span></div></div>';
      }).join('') + '<p class="xs muted">Подсказка носит справочный характер и требует проверки специалистом. Оценки «Полезно / Не полезно» сохраняются для анализа качества; модель от них автоматически не меняется.</p>';
    out.querySelectorAll('[data-ai-open]').forEach(b => b.onclick = () => {
      const r = res.results[Number(b.dataset.aiOpen)], a = r.rec;
      const src = a.sourceRemarkId ? A.find('remarks', a.sourceRemarkId) : null;
      const srcLink = src && A.canViewRemark(A.me(), src) ? '<a href="#/remark/' + src.id + '" data-close>Открыть исходное замечание ' + esc(src.number) + '</a>' : a.sourceRemarkId ? '<span class="muted">Исходное замечание недоступно по правам</span>' : '<span class="muted">Обезличенный пример без ссылки на проект</span>';
      U.modal({
        title: a.title, subtitle: 'Запись архива ИИ', cancelLabel: 'Закрыть',
        body: '<div class="kv"><div class="k">Текст</div><div class="v" style="font-weight:500">' + esc(a.text) + '</div></div><div class="kv"><div class="k">Способ устранения</div><div class="v" style="font-weight:500">' + esc(a.fix || '—') + '</div></div>' +
          '<div class="kv"><div class="k">Категория · тип этапа · тип документа</div><div class="v" style="font-weight:500">' + esc(a.category) + ' · ' + esc(a.stageType || '—') + ' · ' + esc(a.docType || '—') + '</div></div><div class="kv"><div class="k">Источник</div><div class="v" style="font-weight:500">' + esc(a.sourceLabel) + '<br>' + srcLink + '</div></div>' +
          '<div class="kv"><div class="k">Проверил</div><div class="v" style="font-weight:500">' + esc(A.userName(a.checkedBy)) + ', ' + fmtDate(a.checkedAt) + '</div></div>' + U.alertBox('warn', 'Подсказка носит справочный характер и требует проверки специалистом.')
      });
    });
    out.querySelectorAll('[data-ai-draft]').forEach(b => b.onclick = () => {
      const a = res.results[Number(b.dataset.aiDraft)].rec;
      if (onDraft) { onDraft(a); return; }
      const box = out.querySelector('#draftBox');
      box.innerHTML = '<div class="card" style="margin-bottom:14px;border-color:var(--blue)"><h3>Черновик замечания (не сохранён)</h3><p class="small muted">Текст скопирован без автосохранения. Проверьте и отредактируйте его под конкретный результат, затем используйте при возврате на доработку.</p><textarea id="draftText" rows="3">' + esc(a.text) + '</textarea><div class="actions" style="margin-top:8px"><button class="btn sm" id="copyDraft">Скопировать текст</button></div></div>';
      box.querySelector('#copyDraft').onclick = () => { const t = box.querySelector('#draftText'); t.select(); try { navigator.clipboard.writeText(t.value); } catch (e) { document.execCommand('copy'); } U.toast('Текст скопирован в буфер обмена'); };
      box.scrollIntoView({ behavior: 'smooth' });
    });
    out.querySelectorAll('[data-ai-fb]').forEach(b => b.onclick = () => {
      const useful = b.dataset.aiFb === '1', a = res.results[Number(b.dataset.i)].rec;
      U.modal({
        title: useful ? 'Отметить как полезное' : 'Отметить как неполезное', body: field('Причина (необязательно)', '<textarea name="reason" rows="2"></textarea>'), okLabel: 'Отправить оценку',
        onOk: (m) => { A.aiFeedback(a.id, useful, U.readForm(m).reason, d.query); U.toast('Спасибо, оценка сохранена'); b.parentElement.innerHTML = '<span class="small muted">Оценка: ' + (useful ? 'полезно' : 'не полезно') + '</span>'; }
      });
    });
  };
  Views.ai = function (ctx) {
    const u = ctx.user;
    ctx.title = '<b>ИИ-помощник</b>';
    const q = ctx.query;
    ctx.after(root => {
      const f = root.querySelector('#aiForm');
      f.onsubmit = (e) => { e.preventDefault(); Views.runAi(f, root.querySelector('#aiOut'), null); };
      if (q.text) f.onsubmit(new Event('submit'));
    });
    const recs = A.aiAllowedRecords(u).length;
    return '<div class="page-head"><div><h1>ИИ-помощник</h1><p>Поиск похожих замечаний в архиве компании</p></div></div>' +
      U.alertBox('warn', '<b>Подсказка носит справочный характер и требует проверки специалистом.</b> Помощник не проверяет чертежи, не принимает результаты и не создаёт замечания без вашего подтверждения.') +
      '<div class="ai-grid"><div><div class="card"><h2 style="margin-bottom:12px">Что нужно найти</h2><form id="aiForm" novalidate><div class="form-top-err"></div>' +
      field('Опишите замечание или вставьте текст', '<textarea name="query" rows="5" placeholder="Опишите замечание или вставьте текст для поиска похожих случаев">' + esc(q.text || '') + '</textarea>') +
      field('Этап', '<select name="stageType">' + options(A.STAGE_TYPES, q.stage || '', 'Любой тип этапа') + '</select>') +
      field('Тип документа', '<select name="docType">' + options(A.DOC_TYPES, '', 'Любой тип документа') + '</select>') +
      '<button class="btn primary block" type="submit">' + icon('search', 16) + 'Найти похожие замечания</button></form></div>' +
      '<div class="card"><h2 style="margin-bottom:8px">Как работает поиск</h2><p class="small muted">Помощник сравнивает формулировку с замечаниями из архива по словам и ключевым выражениям (TF-IDF и косинусное сходство) и показывает до пяти самых близких.</p>' +
      '<p class="small muted">В поиск попадают только проверенные специалистом записи, к которым у вас есть доступ (доступно записей: ' + recs + ').</p><p class="small muted">Если совпадений нет, помощник честно сообщит об этом и ничего не придумает. Архив пополняется по мере работы: закрытые замечания становятся кандидатами и включаются после проверки специалистом.</p>' +
      '<p class="xs muted">Внешние ИИ-сервисы не вызываются: тексты не покидают систему.</p></div></div>' +
      '<div id="aiOut"><div class="card">' + U.emptyState('Введите текст и нажмите «Найти похожие замечания»', 'Например: «Номенклатура извещателей в спецификации не совпадает со схемой АПС».') + '</div></div></div>';
  };

  /* ================= Архив ИИ ================= */
  Views.aiArchive = function (ctx) {
    const u = ctx.user, q = ctx.query;
    if (!A.canManageAiArchive(u)) forbid('Экран управления архивом ИИ доступен директору и эксперту.');
    ctx.title = '<b>Архив ИИ</b>';
    let list = db().aiArchive.slice();
    const st = q.st || 'pending';
    if (st !== 'all') list = list.filter(a => a.status === st);
    if (q.cat) list = list.filter(a => a.category === q.cat);
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(a => (a.title + ' ' + a.text).toLowerCase().includes(n)); }
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const fb = (id) => { const f = db().aiFeedback.filter(x => x.recId === id); return f.length ? '<span class="green">+' + f.filter(x => x.useful).length + '</span> / <span class="red">−' + f.filter(x => !x.useful).length + '</span>' : '—'; };
    const counts = {}; db().aiArchive.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });
    ctx.after(root => {
      const f = root.querySelector('#aFilters');
      f.onchange = () => setQ({ cat: f.cat.value });
      f.onsubmit = (e) => { e.preventDefault(); setQ({ q: f.q.value }); };
      root.querySelectorAll('[data-st]').forEach(b => b.onclick = () => setQ({ st: b.dataset.st }));
      const thr = root.querySelector('#thrForm');
      if (thr) thr.onsubmit = (e) => { e.preventDefault(); try { A.setAiThreshold(Number(thr.thr.value) / 100); U.toast('Порог релевантности сохранён'); window.App.refresh(); } catch (er) { U.handleError(er, thr); } };
      root.querySelector('#addEx').onclick = () => exampleDialog(null);
      root.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        const a = A.find('aiArchive', b.dataset.id), act = b.dataset.act;
        if (act === 'check') return exampleDialog(a);
        const txt = { included: ['Включить запись в архив ИИ?', 'Запись начнёт участвовать в поиске похожих замечаний.', 'Включить в архив ИИ'], rejected: ['Не включать запись?', 'Запись не попадёт в поиск. Исходное замечание и история проекта сохраняются.', 'Не включать'], excluded: ['Исключить запись из архива ИИ?', 'После обновления индекса запись перестанет участвовать в поиске. Исходное замечание и история сохраняются.', 'Исключить из архива ИИ'] }[act];
        if (!(await U.confirmDlg(txt[0], txt[1], txt[2], act === 'included' ? 'primary' : 'warn'))) return;
        try { A.aiSetStatus(a.id, act); U.toast('Статус записи изменён, индекс поиска обновлён'); window.App.refresh(); } catch (e) { U.handleError(e); }
      });
    });
    function exampleDialog(a) {
      const d = a || { title: '', text: '', category: '', stageType: '', docType: '', fix: '' };
      U.modal({
        title: a ? 'Проверка записи' : 'Добавить пример', subtitle: a ? a.sourceLabel : 'Обезличенный пример. После добавления — проверка и включение специалистом.', wide: true,
        body: '<div class="form-top-err"></div><div class="form-grid">' + field('Краткое название', '<input name="title" value="' + esc(d.title) + '">', { req: true, cls: 'full' }) +
          field('Текст примера', '<textarea name="text" rows="3">' + esc(d.text) + '</textarea>', { req: true, cls: 'full', hint: 'Без персональных данных, контактов и коммерческой тайны' }) +
          field('Категория', '<select name="category">' + options(A.REMARK_CATEGORIES, d.category, '— выберите —') + '</select>', { req: true }) +
          field('Тип этапа', '<select name="stageType">' + options(A.STAGE_TYPES, d.stageType, '—') + '</select>') + field('Тип документа', '<select name="docType">' + options(A.DOC_TYPES, d.docType, '—') + '</select>') +
          field('Способ устранения (подтверждается специалистом)', '<textarea name="fix" rows="2">' + esc(d.fix || '') + '</textarea>', { cls: 'full' }) + '</div>' +
          (a ? U.alertBox('info', 'Проверьте понятность текста, корректность способа устранения и отсутствие лишних персональных и конфиденциальных данных.') : ''),
        okLabel: a ? 'Включить в архив ИИ' : 'Добавить пример',
        onOk: (m) => {
          const data = U.readForm(m);
          if (a) { if (!data.category) throw new A.ApiError('Категория обязательна', { category: 'Выберите категорию' }); Object.assign(a, { stageType: data.stageType, docType: data.docType }); A.aiSetStatus(a.id, 'included', data); U.toast('Запись проверена и включена в архив ИИ'); }
          else { A.aiAddExample(data); U.toast('Пример добавлен и ожидает проверки'); }
          window.App.refresh();
        }
      });
    }
    const chips = [['pending', 'Кандидаты'], ['included', 'В архиве ИИ'], ['excluded', 'Исключённые'], ['rejected', 'Не включены'], ['all', 'Все']];
    return '<div class="page-head"><div><h1>Архив ИИ</h1><p>Проверенные замечания для поиска похожих случаев. Источник — закрытые замечания (кандидаты) и вручную подготовленные демонстрационные примеры. Ответственный — эксперт.</p></div><div class="actions"><button class="btn primary" id="addEx">' + icon('plus') + 'Добавить пример</button></div></div>' +
      (S.db.meta.demo ? U.alertBox('info', 'Начальный набор — вручную подготовленные демонстрационные типовые примеры; это не записи ООО «ПожЭксперт+». Новые замечания автоматически проверенными не становятся.') : '') +
      '<div class="grid g4" style="margin-bottom:16px">' + H().statBox(counts.included || 0, 'В архиве ИИ (в индексе)', 'green') + H().statBox(counts.pending || 0, 'Кандидаты на проверку', 'amber') + H().statBox((counts.excluded || 0) + (counts.rejected || 0), 'Исключено / не включено', '') +
      '<div class="stat vert"><div class="lbl">Порог релевантности</div>' + (u.role === 'director' ? '<form id="thrForm" style="display:flex;gap:6px;align-items:center"><input name="thr" type="number" min="5" max="90" value="' + Math.round(db().meta.aiThreshold * 100) + '" style="width:80px"> % <button class="btn sm">Сохранить</button></form>' : '<div class="num">' + Math.round(db().meta.aiThreshold * 100) + '%</div><div class="xs muted">настраивает директор</div>') + '</div></div>' +
      '<div class="card"><div class="actions" style="margin-bottom:12px">' + chips.map(c => '<button class="btn sm ' + (st === c[0] ? 'primary' : '') + '" data-st="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' +
      '<form id="aFilters" class="filters"><input class="grow" name="q" placeholder="Поиск по тексту" value="' + esc(q.q || '') + '" aria-label="Поиск"><select name="cat" aria-label="Категория">' + options(A.REMARK_CATEGORIES, q.cat, 'Все категории') + '</select></form>' +
      (list.length ? '<div class="table-wrap"><table><thead><tr><th>Пример</th><th>Категория</th><th>Этап / документ</th><th>Источник</th><th>Статус проверки</th><th>Дата</th><th>Индекс</th><th>Оценки</th><th>Действия</th></tr></thead><tbody>' +
        list.map(a => '<tr><td style="min-width:240px"><b>' + esc(a.title) + '</b><div class="sub">' + esc(a.text) + '</div></td><td class="small">' + esc(a.category) + '</td><td class="small">' + esc(a.stageType || '—') + ' / ' + esc(a.docType || '—') + '</td><td class="small">' + esc(a.sourceLabel) + (a.isTest ? '<div class="xs muted">тестовая запись</div>' : '') + '</td>' +
          '<td>' + badge(A.AI_STATUS[a.status]) + (a.checkedBy ? '<div class="xs muted">' + esc(A.userName(a.checkedBy)) + '</div>' : '') + '</td><td class="small nowrap">' + fmtDate(a.checkedAt || a.createdAt) + '</td><td class="small">' + (a.status === 'included' ? 'в индексе с ' + fmtDate(a.indexedAt) : 'не участвует') + '</td><td class="small nowrap">' + fb(a.id) + '</td>' +
          '<td><div style="display:grid;gap:6px">' + (a.status === 'pending' ? '<button class="btn sm primary" data-act="check" data-id="' + a.id + '">Проверить</button><button class="btn sm" data-act="rejected" data-id="' + a.id + '">Не включать</button>' : a.status === 'included' ? '<button class="btn sm warn" data-act="excluded" data-id="' + a.id + '">Исключить из архива ИИ</button>' : '<button class="btn sm" data-act="included" data-id="' + a.id + '">Включить в архив ИИ</button>') + '</div></td></tr>').join('') + '</tbody></table></div>'
        : U.emptyState('Записей нет', st === 'pending' ? 'Новые кандидаты появятся, когда проверяющие примут исправления по замечаниям.' : '')) + '</div>';
  };

  /* ================= Отчёты ================= */
  Views.reports = function (ctx) {
    const u = ctx.user, q = ctx.query;
    if (!['director', 'gip'].includes(u.role)) forbid();
    ctx.title = '<b>Отчёты</b>';
    const tab = q.tab || 'summary';
    const projects = A.visibleProjects(u).filter(p => !q.client || p.clientId === Number(q.client));
    const pids = projects.map(p => p.id);
    const stages = db().stages.filter(s => pids.includes(s.projectId));
    const remarks = db().remarks.filter(r => pids.includes(r.projectId));
    const reviews = db().reviews.filter(r => stages.some(s => s.id === r.stageId));
    const fromOk = (d) => (!q.from || d >= q.from) && (!q.to || d.slice(0, 10) <= q.to);
    const tabs = [['summary', 'Сводка'], ['quality', 'Контроль качества'], ['load', 'Загрузка сотрудников'], ['deadlines', 'Календарь сроков']];
    let body = '';
    const csvRows = [];
    if (tab === 'summary') {
      const by = {}; projects.forEach(p => { by[p.status] = (by[p.status] || 0) + 1; });
      const st = {}; stages.forEach(s => { const k = A.stageState(s); st[k] = (st[k] || 0) + 1; });
      body = '<div class="grid g4" style="margin-bottom:16px">' + H().statBox(projects.length, 'Проектов') + H().statBox(projects.filter(A.isProjectOverdue).length, 'С просрочкой', 'red') + H().statBox(stages.filter(A.isStageOverdue).length, 'Просроченных этапов', 'red') + H().statBox(stages.filter(s => s.status === 'accepted').length + ' / ' + stages.length, 'Этапов принято', 'green') + '</div>' +
        '<div class="grid g2"><div><h3>Проекты по статусам</h3><table><tbody>' + Object.keys(A.PROJECT_STATUS).map(k => '<tr><td>' + badge(A.PROJECT_STATUS[k]) + '</td><td><b>' + (by[k] || 0) + '</b></td></tr>').join('') + '</tbody></table></div>' +
        '<div><h3>Этапы по статусам</h3><table><tbody>' + Object.keys(A.STAGE_STATE).map(k => '<tr><td>' + badge(A.STAGE_STATE[k]) + '</td><td><b>' + (st[k] || 0) + '</b></td></tr>').join('') + '</tbody></table></div></div>' +
        '<h3 style="margin-top:20px">Проекты</h3><div class="table-wrap"><table><thead><tr><th>Проект</th><th>Заказчик</th><th>ГИП</th><th>Статус</th><th>Выполнение</th><th>Просроч. этапов</th><th>Возвратов</th><th>Плановое окончание</th></tr></thead><tbody>' +
        projects.map(p => { const pr = A.projectProgress(p); const ov = A.stagesOf(p.id).filter(A.isStageOverdue).length; const rt = reviews.filter(r => r.decision === 'returned' && A.find('stages', r.stageId).projectId === p.id).length; csvRows.push([p.number, p.name, H().clientName(p.clientId), A.userName(p.gipId), A.PROJECT_STATUS[p.status][0], pr.pct + '%', ov, rt, p.endDate]); return '<tr><td><a href="#/project/' + p.id + '">' + esc(p.name) + '</a><div class="sub">' + esc(p.number) + '</div></td><td>' + esc(H().clientName(p.clientId)) + '</td><td>' + esc(A.userName(p.gipId)) + '</td><td>' + badge(A.PROJECT_STATUS[p.status]) + '</td><td>' + pr.pct + '% (' + pr.accepted + '/' + pr.total + ')</td><td class="' + (ov ? 'red' : '') + '">' + ov + '</td><td>' + rt + '</td><td>' + fmtDate(p.endDate, true) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      csvRows.unshift(['Номер', 'Проект', 'Заказчик', 'ГИП', 'Статус', 'Выполнение', 'Просроченных этапов', 'Возвратов', 'Плановое окончание']);
    } else if (tab === 'quality') {
      const rv = reviews.filter(r => fromOk(r.date));
      const cats = {}; remarks.filter(r => fromOk(r.createdAt)).forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
      const sev = {}; remarks.filter(r => fromOk(r.createdAt)).forEach(r => { sev[r.severity] = (sev[r.severity] || 0) + 1; });
      const byExec = {}; rv.filter(r => r.decision === 'returned').forEach(r => { const s = A.find('stages', r.stageId); byExec[s.executorId] = (byExec[s.executorId] || 0) + 1; });
      const max = Math.max(1, ...Object.values(cats));
      body = '<div class="grid g4" style="margin-bottom:16px">' + H().statBox(rv.filter(r => r.decision === 'accepted').length, 'Принято результатов', 'green') + H().statBox(rv.filter(r => r.decision === 'returned').length, 'Возвратов на доработку', 'amber') + H().statBox(remarks.length, 'Замечаний всего') + H().statBox(remarks.filter(r => ['open', 'rework', 'fixed'].includes(r.status)).length, 'Открытых замечаний', 'red') + '</div>' +
        '<div class="grid g2"><div><h3>Наиболее частые категории замечаний</h3>' + Object.keys(cats).sort((a, b) => cats[b] - cats[a]).map(k => '<div class="load-row" style="grid-template-columns:200px 1fr 40px"><span class="small">' + esc(k) + '</span><div class="bar"><i style="width:' + (cats[k] * 100 / max) + '%"></i></div><b>' + cats[k] + '</b></div>').join('') + (Object.keys(cats).length ? '' : '<p class="muted">Нет данных</p>') +
        '<h3 style="margin-top:16px">По критичности</h3><table><tbody>' + Object.keys(A.SEVERITY).map(k => '<tr><td>' + badge(A.SEVERITY[k]) + '</td><td><b>' + (sev[k] || 0) + '</b></td></tr>').join('') + '</tbody></table></div>' +
        '<div><h3>Возвраты по исполнителям</h3><table><thead><tr><th>Исполнитель</th><th>Возвратов</th></tr></thead><tbody>' + Object.keys(byExec).map(id => '<tr><td>' + esc(A.userName(Number(id))) + '</td><td>' + byExec[id] + '</td></tr>').join('') + '</tbody></table>' + (Object.keys(byExec).length ? '' : '<p class="muted">Возвратов нет</p>') + '</div></div>';
      csvRows.push(['Категория', 'Замечаний']); Object.keys(cats).forEach(k => csvRows.push([k, cats[k]]));
    } else if (tab === 'load') {
      const ws = db().users.filter(x => x.status === 'active' && A.EXECUTOR_ROLES.includes(x.role)).map(x => ({ x, wl: A.workload(x.id) })).sort((a, b) => b.wl.pct - a.wl.pct);
      body = '<div class="table-wrap"><table><thead><tr><th>Сотрудник</th><th>Роль</th><th>Активных задач</th><th>Плановые часы (2 нед.)</th><th>Загрузка</th><th>Ближайший срок</th><th>Оценка</th></tr></thead><tbody>' +
        ws.map(w => { csvRows.push([w.x.fullName, A.ROLES[w.x.role], w.wl.active, w.wl.hours, w.wl.pct + '%', w.wl.nearest || '', w.wl.approx ? 'приблизительная' : 'по трудоёмкости']); return '<tr><td><b>' + esc(w.x.fullName) + '</b></td><td>' + esc(A.ROLES[w.x.role]) + '</td><td>' + w.wl.active + '</td><td>' + w.wl.hours + ' ч</td><td style="min-width:180px">' + H().loadBar(w.wl) + '<span class="small ' + (w.wl.overload ? 'red' : '') + '">' + w.wl.pct + '%' + (w.wl.overload ? ' — перегрузка' : '') + '</span></td><td>' + (w.wl.nearest ? fmtDate(w.wl.nearest) : '—') + (w.wl.overdue ? ' ' + badge(['есть просрочка', 'red']) : '') + '</td><td class="small">' + (w.wl.approx ? 'приблизительная' : 'по трудоёмкости') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="xs muted">Загрузка = плановые часы активных этапов (в работе и на доработке) / 80 ч за 2 недели. Для этапов без трудоёмкости принимается 16 ч, и оценка помечается как приблизительная — это не точный процент занятости.</p>';
      csvRows.unshift(['Сотрудник', 'Роль', 'Активных задач', 'Часы', 'Загрузка', 'Ближайший срок', 'Оценка']);
    } else {
      const open = stages.filter(s => s.status !== 'accepted' && A.projectOf(s).status === 'in_work').sort((a, b) => a.deadline.localeCompare(b.deadline));
      const groups = {};
      open.forEach(s => {
        const d = A.daysTo(s.deadline);
        const k = d < 0 ? '0|Просрочено' : d <= 7 ? '1|Ближайшие 7 дней' : d <= 30 ? '2|8–30 дней' : '3|Позже';
        (groups[k] = groups[k] || []).push(s);
      });
      body = Object.keys(groups).sort().map(k => '<h3 style="margin:14px 0 6px">' + k.split('|')[1] + ' (' + groups[k].length + ')</h3><div class="table-wrap"><table><thead><tr><th>Срок</th><th>Проект</th><th>Этап</th><th>Исполнитель</th><th>Статус</th></tr></thead><tbody>' +
        groups[k].map(s => { csvRows.push([s.deadline, A.projectOf(s).name, s.seq + '. ' + s.name, A.userName(s.executorId), A.STAGE_STATE[A.stageState(s)][0]]); return '<tr><td class="nowrap">' + U.deadlineText(s) + '</td><td>' + esc(A.projectOf(s).name) + '</td><td><a href="#/stage/' + s.id + '">' + s.seq + '. ' + esc(s.name) + '</a></td><td>' + esc(A.userName(s.executorId)) + '</td><td>' + U.stageBadge(s) + '</td></tr>'; }).join('') + '</tbody></table></div>').join('') || U.emptyState('Открытых этапов нет');
      csvRows.unshift(['Срок', 'Проект', 'Этап', 'Исполнитель', 'Статус']);
    }
    ctx.after(root => {
      const f = root.querySelector('#repF');
      f.onchange = () => setQ({ client: f.client.value, from: f.from.value, to: f.to.value });
      root.querySelector('#csvBtn').onclick = () => {
        const csv = '﻿' + csvRows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'otchet_' + tab + '_' + A.today() + '.csv'; a.click();
      };
      root.querySelector('#printBtn').onclick = () => window.print();
    });
    const clients = Array.from(new Set(A.visibleProjects(u).map(p => p.clientId))).map(id => [id, H().clientName(id)]);
    return '<div class="page-head"><div><h1>Отчёты</h1><p>Статистика проектов, этапов, сроков, качества и загрузки' + (u.role === 'gip' ? ' по вашим проектам' : '') + '</p></div><div class="actions"><button class="btn" id="printBtn">Печать</button><button class="btn primary" id="csvBtn">' + icon('download', 16) + 'Выгрузить CSV (Excel)</button></div></div>' +
      '<div class="card"><nav class="tabs">' + tabs.map(t => '<a href="#/reports?tab=' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</a>').join('') + '</nav>' +
      '<form id="repF" class="filters"><select name="client" aria-label="Заказчик">' + options(clients, q.client, 'Все заказчики') + '</select>' + (tab === 'quality' ? '<input type="date" name="from" value="' + esc(q.from || '') + '" aria-label="Период с" style="min-width:150px"><input type="date" name="to" value="' + esc(q.to || '') + '" aria-label="Период по" style="min-width:150px">' : '<input type="hidden" name="from"><input type="hidden" name="to">') + '</form>' + body + '</div>';
  };

  /* ================= Журнал аудита ================= */
  Views.auditLog = function (ctx) {
    const u = ctx.user, q = ctx.query;
    if (u.role !== 'director') forbid('Журнал аудита доступен директору.');
    ctx.title = '<b>Журнал аудита</b>';
    const groups = { project: 'Проекты', stage: 'Этапы и назначения', version: 'Документы и версии', review: 'Проверки', remark: 'Замечания', user: 'Учётные записи', client: 'Клиенты', ai: 'ИИ и архив ИИ', auth: 'Вход и выход', file: 'Скачивание файлов' };
    let list = db().audit.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (q.g) list = list.filter(a => a.action.split('.')[0] === q.g);
    if (q.user) list = list.filter(a => a.userId === Number(q.user));
    if (q.from) list = list.filter(a => a.date.slice(0, 10) >= q.from);
    if (q.to) list = list.filter(a => a.date.slice(0, 10) <= q.to);
    if (q.q) { const n = q.q.toLowerCase(); list = list.filter(a => a.description.toLowerCase().includes(n)); }
    const pg = U.paginate(list, Number(q.page) || 1, 25);
    ctx.after(root => {
      const f = root.querySelector('#aF');
      f.onchange = () => setQ({ g: f.g.value, user: f.user.value, from: f.from.value, to: f.to.value, page: '' });
      f.onsubmit = (e) => { e.preventDefault(); setQ({ q: f.q.value, page: '' }); };
      root.querySelectorAll('[data-page]').forEach(b => b.onclick = () => setQ({ page: b.dataset.page }));
    });
    return '<div class="page-head"><div><h1>Журнал аудита</h1><p>Все операции, меняющие статусы, назначения, сроки, права, версии и архив ИИ: пользователь, дата и время, описание. Журнал не редактируется.</p></div></div>' +
      '<div class="card"><form id="aF" class="filters"><input class="grow" name="q" placeholder="Поиск по описанию" value="' + esc(q.q || '') + '" aria-label="Поиск">' +
      '<select name="g" aria-label="Тип">' + options(Object.keys(groups).map(k => [k, groups[k]]), q.g, 'Все типы действий') + '</select><select name="user" aria-label="Пользователь">' + options(db().users.map(x => [x.id, x.fullName]), q.user, 'Все пользователи') + '</select>' +
      '<input type="date" name="from" value="' + esc(q.from || '') + '" aria-label="С" style="min-width:150px"><input type="date" name="to" value="' + esc(q.to || '') + '" aria-label="По" style="min-width:150px"></form>' +
      (pg.total ? '<div class="table-wrap"><table><thead><tr><th>Дата и время</th><th>Пользователь</th><th>Действие</th><th>Было → стало</th><th>Объект</th></tr></thead><tbody>' +
        pg.items.map(a => '<tr><td class="nowrap small">' + new Date(a.date).toLocaleString('ru-RU') + '</td><td class="small">' + esc(A.userName(a.userId)) + '</td><td>' + esc(a.description) + '</td><td class="small">' + (a.oldValue || a.newValue ? esc(a.oldValue || '—') + ' → ' + esc(a.newValue || '—') : '') + '</td><td class="small">' + (a.projectId ? '<a href="#/project/' + a.projectId + '?tab=history">' + esc((A.find('projects', a.projectId) || {}).number || '') + '</a>' : esc(groups[a.action.split('.')[0]] || '')) + '</td></tr>').join('') +
        '</tbody></table></div>' + U.pagerHtml(pg, 'Записей') : U.emptyState('Записи не найдены', '', '<a class="btn" href="#/audit">Очистить фильтры</a>')) + '</div>';
  };

  /* ================= Уведомления ================= */
  Views.notifications = function (ctx) {
    const q = ctx.query;
    ctx.title = '<b>Уведомления</b>';
    let list = A.myNotifications();
    if (q.unread === '1') list = list.filter(n => !n.readAt);
    ctx.after(root => {
      root.querySelector('#allRead').onclick = () => { A.markAllRead(); window.App.refresh(); };
      root.querySelector('#onlyUnread').onchange = (e) => setQ({ unread: e.target.checked ? '1' : '' });
      root.querySelectorAll('[data-read]').forEach(b => b.onclick = () => { A.markRead(Number(b.dataset.read)); window.App.refresh(); });
      root.querySelectorAll('[data-go]').forEach(a => a.onclick = () => A.markRead(Number(a.dataset.go)));
    });
    return '<div class="page-head"><div><h1>Уведомления</h1><p>Назначения, сроки, проверки, возвраты и решения по вашим задачам. Отметка о прочтении статус задачи не меняет.</p></div><div class="actions"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="onlyUnread" ' + (q.unread === '1' ? 'checked' : '') + '> Только новые</label><button class="btn" id="allRead">Отметить все прочитанными</button></div></div>' +
      '<div class="card">' + (list.length ? '<ul class="list">' + list.map(n => '<li style="' + (n.readAt ? '' : 'font-weight:600') + '"><div><div class="small">' + badge([A.NOTE_TYPES[n.type] || 'Событие', n.type === 'overdue' || n.type === 'returned' ? 'red' : n.type === 'review' || n.type === 'deadline' ? 'amber' : n.type === 'accepted' || n.type === 'unblocked' ? 'green' : 'blue']) + ' <span class="muted" style="font-weight:400">' + fmtDT(n.date) + '</span></div>' +
        '<div style="margin-top:4px">' + esc(n.text) + '</div>' + (n.link ? '<a class="small" href="' + esc(n.link) + '" data-go="' + n.id + '" style="font-weight:400">Перейти</a>' : '') + '</div>' + (n.readAt ? '<span class="xs muted" style="font-weight:400">прочитано</span>' : '<button class="btn sm" data-read="' + n.id + '">Прочитано</button>') + '</li>').join('') + '</ul>' : U.emptyState('Уведомлений нет')) + '</div>';
  };

  /* ================= Профиль ================= */
  async function exportBackup() {
    const data = JSON.parse(S.exportJson());
    data.files = {};
    for (const v of data.versions.filter(x => x.fileKey)) {
      const blob = await S.Files.get(v.fileKey);
      if (blob) data.files[v.fileKey] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'pozhexpert_backup_' + A.today() + '.json'; a.click();
  }
  async function importBackup(file) {
    const data = JSON.parse(await file.text());
    const files = data.files || {}; delete data.files;
    S.importJson(JSON.stringify(data));
    await S.Files.clear();
    for (const k of Object.keys(files)) { const blob = await (await fetch(files[k])).blob(); await S.Files.put(k, blob); }
  }
  Views.profile = function (ctx) {
    const u = ctx.user;
    ctx.title = '<b>Профиль</b>';
    const first = ctx.query.first === '1' || u.mustChangePassword;
    ctx.after(root => {
      const f = root.querySelector('#pwForm');
      f.onsubmit = (e) => { e.preventDefault(); try { A.changePassword(f.old ? f.old.value : '', f.new1.value, f.new2.value); U.toast('Пароль изменён'); window.App.go('#/'); } catch (er) { U.handleError(er, f); } };
      root.querySelector('#themeSel').onchange = (e) => S.Theme.set(e.target.value);
      const rs = root.querySelector('#resetDemo');
      if (rs) rs.onclick = async () => { if (!(await U.confirmDlg('Сбросить демо-данные?', 'Все изменения в этом браузере (проекты, загруженные файлы, замечания) будут удалены и заменены исходным демонстрационным набором. Потребуется войти заново.', 'Сбросить', 'danger'))) return; await S.reset(); location.hash = '#/login'; location.reload(); };
      const ex = root.querySelector('#expBtn'); if (ex) ex.onclick = () => exportBackup().then(() => U.toast('Резервная копия выгружена'));
      const im = root.querySelector('#impFile');
      if (im) im.onchange = async () => {
        if (!im.files[0]) return;
        if (!(await U.confirmDlg('Восстановить из резервной копии?', 'Текущие данные и файлы в этом браузере будут заменены содержимым копии.', 'Восстановить', 'danger'))) { im.value = ''; return; }
        try { await importBackup(im.files[0]); U.toast('Данные восстановлены'); location.hash = '#/login'; location.reload(); } catch (e) { U.toast('Не удалось восстановить: ' + e.message, 'err'); }
      };
    });
    return '<div class="page-head"><div><h1>Профиль</h1><p>Свои данные и смена пароля. Роль меняет только директор.</p></div></div>' +
      (first ? U.alertBox('warn', '<b>Смените временный пароль.</b> Он был выдан директором; задайте собственный пароль не короче 8 символов.') : '') +
      '<div class="grid g2"><div class="card"><h2 style="margin-bottom:6px">Мои данные</h2>' + [['ФИО', u.fullName], ['Рабочая почта', u.email], ['Роль', A.ROLES_FULL[u.role]], ['Подразделение', u.department || '—'], ['Телефон', u.phone || '—'], ['Последний вход', fmtDT(u.lastLogin)]].map(x => '<div class="kv"><div class="k">' + x[0] + '</div><div class="v">' + esc(x[1]) + '</div></div>').join('') +
      '<label class="f" style="margin-top:14px"><span>Тема оформления</span><select id="themeSel">' + options([['light', 'Светлая'], ['dark', 'Тёмная']], S.Theme.get()) + '</select></label></div>' +
      '<div class="card"><h2 style="margin-bottom:12px">Смена пароля</h2><form id="pwForm" novalidate><div class="form-top-err"></div>' + (u.mustChangePassword ? '' : field('Текущий пароль', '<input type="password" name="old" autocomplete="current-password">', { req: true })) +
      field('Новый пароль', '<input type="password" name="new1" autocomplete="new-password">', { req: true, hint: 'Не менее 8 символов' }) + field('Повторите новый пароль', '<input type="password" name="new2" autocomplete="new-password">', { req: true }) + '<button class="btn primary" type="submit">Сменить пароль</button></form></div></div>' +
      (u.role === 'director' ? '<div class="card" style="margin-top:16px"><h2 style="margin-bottom:8px">Резервное копирование</h2><p class="small muted">Копия включает базу данных и загруженные файлы (база ссылается на файлы, поэтому они сохраняются вместе). Восстановление заменяет данные в этом браузере.</p><div class="actions"><button class="btn" id="expBtn">' + icon('download', 16) + 'Выгрузить резервную копию</button><label class="btn">' + icon('upload', 16) + 'Восстановить из копии<input type="file" id="impFile" accept=".json" class="hidden"></label></div></div>' : '') +
      (S.db.meta.demo ? '<div class="card" style="margin-top:16px"><h2 style="margin-bottom:8px">Демонстрационный режим</h2><p class="small muted">Данные прототипа хранятся в этом браузере. Сброс вернёт исходный набор демо-данных.</p><button class="btn danger" id="resetDemo">Сбросить демо-данные</button></div>' : '');
  };

  /* ================= Поиск ================= */
  Views.search = function (ctx) {
    const qq = ctx.query.q || '';
    ctx.title = '<b>Поиск</b>';
    const r = A.globalSearch(qq);
    const total = r.projects.length + r.documents.length + r.remarks.length;
    ctx.after(root => root.querySelectorAll('[data-open-v]').forEach(x => x.onclick = () => U.openVersion(Number(x.dataset.openV))));
    return '<div class="page-head"><div><h1>Результаты поиска</h1><p>«' + esc(qq) + '» — найдено ' + total + ' (только в пределах ваших прав)</p></div></div>' +
      (total ? '' : '<div class="card">' + U.emptyState('Ничего не найдено', 'Проверьте написание или используйте другой запрос.') + '</div>') +
      (r.projects.length ? '<div class="card"><h2 style="margin-bottom:8px">Проекты</h2><ul class="list">' + r.projects.map(p => '<li><a href="#/project/' + p.id + '"><b>' + esc(p.name) + '</b></a><span class="small muted">' + esc(p.number) + ' · ' + esc(H().clientName(p.clientId)) + '</span></li>').join('') + '</ul></div>' : '') +
      (r.documents.length ? '<div class="card"><h2 style="margin-bottom:8px">Документы</h2><ul class="list">' + r.documents.map(d => { const v = A.docVersions(d.id)[0]; return '<li><div><b>' + esc(d.title) + '</b><div class="small muted">' + esc(A.find('projects', d.projectId).name) + ' · ' + esc(v.fileName) + ' · v' + v.no + '</div></div><button class="btn sm" data-open-v="' + v.id + '">Открыть</button></li>'; }).join('') + '</ul></div>' : '') +
      (r.remarks.length ? '<div class="card"><h2 style="margin-bottom:8px">Замечания</h2><ul class="list">' + r.remarks.map(x => '<li><div><a href="#/remark/' + x.id + '"><b>' + esc(x.number) + '</b></a> ' + esc(x.text) + '</div>' + badge(A.REMARK_STATUS[x.status]) + '</li>').join('') + '</ul></div>' : '');
  };
})();

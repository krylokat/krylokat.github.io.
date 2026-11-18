/* Страница этапа: задача исполнителя (загрузка результата, передача на проверку) и проверка результата экспертом. */
(function () {
  'use strict';
  const A = window.PozhApi, S = window.PozhStore, U = window.UI;
  const { esc, icon, badge, fmtDate, fmtDT, field, options } = U;
  const Views = window.Views = window.Views || {};
  const db = () => S.db;

  function remarkCard(r, actions) {
    const d = A.find('documents', r.documentId), v = A.find('versions', r.versionId);
    return '<div class="remark"><div class="top"><a href="#/remark/' + r.id + '"><b>' + esc(r.number) + '</b></a>' + badge(A.SEVERITY[r.severity]) + badge(A.REMARK_STATUS[r.status]) + '</div>' +
      '<p>' + esc(r.text) + '</p><div class="small muted">' + esc(d ? d.title : '') + ', ' + esc(r.section) + (v ? ' · версия ' + v.no : '') + ' · автор: ' + esc(A.userName(r.authorId)) + (r.deadline ? ' · срок: ' + fmtDate(r.deadline) : '') + '</div>' +
      (actions || '') + '</div>';
  }

  Views.stage = function (ctx) {
    const u = ctx.user;
    const s = A.find('stages', ctx.params.id);
    if (!s) throw new window.App.NotFound('Этап не найден');
    if (!A.canViewStage(u, s)) throw new window.App.Forbidden('У вас нет доступа к этому этапу: он не назначен вам и не относится к вашим проектам.');
    const p = A.projectOf(s);
    const state = A.stageState(s);
    const isExec = s.executorId === u.id, isRev = s.reviewerId === u.id && !isExec, manage = A.canManageProject(u, p);
    ctx.title = '<a href="#/projects">Проекты</a> / <a href="#/project/' + p.id + '">' + esc(p.name) + '</a> / <b>Этап ' + s.seq + '</b>';
    ctx.docTitle = s.name;
    const remarks = db().remarks.filter(r => r.stageId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const docs = db().documents.filter(d => d.stageId === s.id);
    const versions = A.stageVersions(s.id);
    const submitted = versions.filter(v => v.status === 'submitted');
    const src = db().documents.filter(d => d.projectId === p.id && !d.stageId);

    /* ---- предупреждения ---- */
    let alerts = '';
    if (state === 'rework') alerts += U.alertBox('warn', '<b>Результат возвращён на доработку.</b> ' + (isExec ? 'Исправьте замечания, загрузите новую версию с комментарием и передайте её на проверку.' : 'Ожидается новая версия от исполнителя.'));
    if (state === 'blocked') alerts += U.alertBox('info', '<b>Этап заблокирован зависимостью.</b> ' + esc(A.blockReason(s)) + '. Работа начнётся после принятия результата предыдущих этапов.');
    if (A.isStageOverdue(s)) alerts += U.alertBox('err', '<b>Срок этапа просрочен на ' + (-A.daysTo(s.deadline)) + ' ' + U.plural(-A.daysTo(s.deadline), 'день', 'дня', 'дней') + '.</b> ' + (manage ? 'При необходимости перенесите срок с указанием причины.' : 'Сообщите ГИПу, если нужен перенос срока.'));
    if (state === 'draft') alerts += U.alertBox('info', 'Проект в статусе «Черновик» — этап начнётся после запуска проекта ГИПом.');
    if (state === 'review' && !isRev) alerts += U.alertBox('info', 'Результат передан на проверку и зафиксирован. Решение принимает проверяющий: ' + esc(A.userName(s.reviewerId)) + '.');
    if (state === 'accepted') alerts += U.alertBox('ok', 'Результат этапа принят' + (s.factEnd ? ' ' + fmtDate(s.factEnd, true) : '') + '. Зависимые этапы разблокированы.');

    /* ---- основная колонка ---- */
    let main = '';
    // Проверка: результат и просмотр
    if (isRev && state === 'review') {
      main += '<div class="card"><div class="card-head"><h2>Результат' + (submitted.length ? ', версия ' + submitted.map(v => v.no).join(', ') : '') + '</h2></div>' +
        (submitted.length ? submitted.map(v => { const d = A.find('documents', v.documentId); return '<div class="ver"><div><b>' + esc(d.title) + '</b> · ' + esc(v.fileName) + '<div class="small muted">' + U.fmtSize(v.size) + ' · ' + esc(A.userName(v.authorId)) + ' · ' + fmtDT(v.date) + '</div><div class="small">Комментарий: ' + esc(v.comment || '—') + '</div></div><div class="actions"><button class="btn sm" data-open-v="' + v.id + '">Открыть</button><button class="btn sm" data-dl-v="' + v.id + '">' + icon('download', 15) + 'Скачать</button></div></div>'; }).join('') +
          (submitted.find(v => v.ext === 'pdf') ? '<div id="pdfPreview" data-v="' + submitted.find(v => v.ext === 'pdf').id + '" style="margin-top:12px"></div>' : '<p class="small muted">Встроенный просмотр доступен для PDF; DWG/DXF/DOCX/XLSX открываются во внешней программе после скачивания.</p>')
          : '<p class="muted">Этап не требует файла. Комментарий исполнителя: ' + esc(s.submitComment || '—') + '</p>') + '</div>';
      const fixed = remarks.filter(r => ['fixed', 'rework'].includes(r.status));
      if (fixed.length) {
        main += '<div class="card"><div class="card-head"><h2>Повторная проверка замечаний</h2></div>' + fixed.map(r => remarkCard(r, r.status === 'fixed' ?
          '<div class="actions" style="margin-top:10px"><button class="btn sm success-o" data-rd="accept" data-rid="' + r.id + '">Принять исправление</button><button class="btn sm danger" data-rd="reject" data-rid="' + r.id + '">Не исправлено</button></div>' :
          '<div class="small amber" style="margin-top:8px">Отмечено «Не исправлено» — результат нужно вернуть на доработку</div>')).join('') + '</div>';
      }
    }
    // Замечания к этапу
    const openR = remarks.filter(r => ['open', 'rework'].includes(r.status) && !(isRev && state === 'review'));
    if (openR.length) {
      const byVer = {};
      openR.forEach(r => { const v = A.find('versions', r.versionId); const k = v ? v.no : '—'; (byVer[k] = byVer[k] || []).push(r); });
      main += Object.keys(byVer).map(k => '<div class="card"><div class="card-head"><h2>Замечания к версии ' + k + '</h2></div>' + byVer[k].map(r => remarkCard(r)).join('') +
        '<p class="small muted">После передачи новой версии статус замечаний изменится на «Исправлено, ожидает проверки». Закрывает замечание только проверяющий.</p></div>').join('');
    }
    // Загрузка
    const upWhy = A.uploadCheck(u, s);
    if (isExec && !upWhy) {
      main += '<div class="card"><div class="card-head"><h2>' + (docs.length ? 'Загрузить новую версию' : 'Загрузить результат') + '</h2></div>' + uploadForm(s, docs) + '</div>';
    }
    // Внешнее согласование
    if (s.stageType === 'Согласование' || !s.fileRequired) {
      const ap = s.approval;
      main += '<div class="card"><div class="card-head"><h2>Внешнее согласование</h2>' + ((isExec || manage) && state !== 'accepted' ? '<button class="btn sm" id="extRemark">Зарегистрировать внешнее замечание</button>' : '') + '</div>' +
        (ap ? '<p>Статус: <b>' + esc(ap.status) + '</b> · ' + fmtDate(ap.date, true) + (ap.note ? '<br><span class="small">' + esc(ap.note) + '</span>' : '') + '</p>' : '<p class="muted">Статус согласования ещё не указан.</p>') +
        (isExec && ['in_work', 'rework'].includes(state) ? '<form id="apForm" class="form-grid" novalidate><div class="form-top-err full"></div>' + field('Статус согласования', '<select name="status">' + options(['Пакет подготовлен', 'Отправлено на согласование', 'Получены замечания', 'Согласовано', 'Отказ в согласовании'], ap && ap.status, '— выберите —') + '</select>', { req: true }) +
          field('Дата', '<input type="date" name="date" value="' + A.today() + '">', { req: true }) + field('Примечание (номер письма, ответ)', '<input name="note">', { cls: 'full' }) + '<div class="full"><button class="btn" type="submit">Сохранить статус</button></div></form>' : '') + '</div>';
    }
    // История версий
    main += '<div class="card"><div class="card-head"><h2>История версий</h2></div>' + (versions.length ? versions.map(v => {
      const d = A.find('documents', v.documentId);
      return '<div class="ver"><div><b>v' + v.no + '</b> · ' + esc(d.title) + ' · ' + esc(v.fileName) + ' ' + badge(A.VERSION_STATUS[v.status]) + '<div class="small muted">' + U.fmtSize(v.size) + ' · ' + esc(A.userName(v.authorId)) + ' · ' + fmtDT(v.date) + '</div><div class="small">' + esc(v.comment || 'без комментария') + '</div></div>' +
        '<div class="actions"><button class="btn sm" data-open-v="' + v.id + '">Открыть</button><button class="btn sm" data-dl-v="' + v.id + '" aria-label="Скачать">' + icon('download', 15) + '</button></div></div>';
    }).join('') : U.emptyState('Версий пока нет', isExec ? 'Загрузите результат выше.' : '')) + '</div>';
    // Закрытые замечания
    const closed = remarks.filter(r => ['accepted', 'irrelevant'].includes(r.status));
    if (closed.length) main += '<div class="card"><div class="card-head"><h2>Закрытые замечания</h2></div>' + closed.map(r => remarkCard(r)).join('') + '</div>';

    /* ---- боковая колонка ---- */
    let side = '<div class="card"><h2 style="margin-bottom:6px">Сведения</h2>' +
      kv('Проект', '<a href="#/project/' + p.id + '">' + esc(p.name) + '</a> · ' + esc(p.number)) +
      kv('Исполнитель', s.executorId ? esc(A.userName(s.executorId)) : '<span class="amber">Не назначен</span>') + kv('Проверяющий', esc(A.userName(s.reviewerId))) +
      kv('Плановые сроки', fmtDate(s.startDate, true) + ' – ' + fmtDate(s.deadline, true)) + kv('Срок', U.deadlineText(s).replace('<br>', ' · ')) +
      (s.factEnd ? kv('Фактическое завершение', fmtDate(s.factEnd, true)) : '') +
      kv('Трудоёмкость', s.effortHours ? s.effortHours + ' ч' : 'не задана') +
      kv('Зависимости', (s.dependsOn || []).length ? s.dependsOn.map(id => { const d = A.find('stages', id); return 'Этап ' + d.seq + ' ' + badge(A.STAGE_STATE[A.stageState(d)]); }).join('<br>') : 'Нет') +
      kv('Ожидаемый результат', esc(s.expectedResult || '—') + '<div class="xs muted">' + (s.fileRequired ? 'Файл результата обязателен' : 'Файл не обязателен') + '</div>') +
      (s.description ? kv('Описание', esc(s.description)) : '') + '</div>';
    // Передача на проверку
    if (isExec) {
      const why = A.submitCheck(u, s);
      side += '<div class="card"><h2 style="margin-bottom:10px">Передать на проверку</h2>' + (!why ? field('Комментарий для проверяющего', '<textarea id="subComment" rows="2" placeholder="Необязательно"></textarea>') : '') +
        '<button class="btn primary block" id="submitBtn" ' + (why ? 'disabled aria-describedby="subWhy"' : '') + '>Передать на проверку</button>' + (why ? '<div class="why" id="subWhy" style="margin-top:8px">' + esc(why) + '</div>' : '<div class="why" style="margin-top:8px">Версия будет зафиксирована, проверяющий получит уведомление.</div>') + '</div>';
    }
    // Решение проверяющего
    if (isRev && state === 'review') {
      const curVers = submitted.length ? submitted : versions.slice(0, 1);
      side += '<div class="card"><h2 style="margin-bottom:10px">Решение по версии ' + (submitted.map(v => v.no).join(', ') || '') + '</h2>' +
        field('Комментарий к решению', '<textarea id="decComment" rows="2"></textarea>') +
        '<div class="actions"><button class="btn success" id="acceptBtn" style="flex:1">Принять результат</button><button class="btn warn" id="returnBtn" style="flex:1">Вернуть на доработку</button></div>' +
        '<p class="why">Исполнитель не может принять собственный результат. При возврате замечание обязательно.</p></div>' +
        '<div class="card"><div class="card-head"><h2>Новое замечание при возврате</h2><button class="btn sm" id="aiHelp">' + icon('spark', 15) + 'Подсказка ИИ</button></div><form id="remForm" novalidate><div class="form-top-err"></div>' +
        field('Текст замечания', '<textarea name="text" rows="3"></textarea>', { req: true }) +
        field('Документ и версия', '<select name="versionId">' + options(curVers.map(v => [v.id, A.find('documents', v.documentId).title + ', версия ' + v.no]), curVers[0] && curVers[0].id) + '</select>', { req: true }) +
        field('Раздел или лист', '<input name="section" placeholder="например, раздел 3.2, лист 5">', { req: true }) +
        field('Категория', '<select name="category">' + options(A.REMARK_CATEGORIES, '', '— выберите —') + '</select>', { req: true }) +
        field('Критичность', '<select name="severity">' + options(Object.keys(A.SEVERITY).map(k => [k, A.SEVERITY[k][0]]), '', '— выберите —') + '</select>', { req: true }) +
        field('Срок исправления', '<input type="date" name="deadline">') + '<input type="hidden" name="fromAi" value="">' +
        '<div class="hint">Шаблон или подсказку ИИ обязательно уточните под конкретный результат.</div></form></div>';
    } else if (isRev && state !== 'review') {
      side += '<div class="card"><h2>Проверка</h2><p class="muted small">Вы — проверяющий этапа. Решение станет доступно, когда исполнитель передаст результат на проверку.</p></div>';
    }
    // Управление ГИПа
    if (manage) {
      side += '<div class="card"><h2 style="margin-bottom:10px">Управление этапом</h2><div style="display:grid;gap:8px">' +
        (s.status !== 'accepted' ? '<button class="btn" id="gAssign">Назначить исполнителя</button><button class="btn" id="gDeadline">Изменить срок</button>' : '') +
        '<button class="btn" id="gEdit">Изменить этап</button>' +
        (s.status === 'accepted' ? '<button class="btn danger" id="gCancel">Отменить приёмку</button><div class="why">Используется, если в принятом результате найдена критическая ошибка. Зависимые этапы будут заблокированы.</div>' : '') + '</div></div>';
    }
    if (isExec || isRev) side += '<div class="card"><h2>Нужна подсказка?</h2><p class="small muted">ИИ-помощник найдёт похожие замечания в архиве и покажет, как их устраняли раньше.</p><button class="btn block" id="aiSide">' + icon('spark') + 'Открыть ИИ-помощник</button></div>';
    // Исходные материалы
    side += '<div class="card"><h2 style="margin-bottom:8px">Исходные материалы</h2>' + (src.length ? '<ul class="list">' + src.map(d => { const v = A.docVersions(d.id)[0]; return '<li><div class="small"><b>' + esc(d.title) + '</b><div class="muted">' + esc(v.fileName) + '</div></div><button class="btn sm" data-dl-v="' + v.id + '" aria-label="Скачать">' + icon('download', 15) + '</button></li>'; }).join('') + '</ul>' : '<p class="muted small">Исходные документы не загружены</p>') + '</div>';
    // История этапа
    const hist = db().audit.filter(a => (a.objType === 'stage' && a.objId === s.id) || (a.objType === 'version' && versions.some(v => v.id === a.objId) && a.action !== 'file.download')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    side += '<div class="card"><h2 style="margin-bottom:8px">История этапа</h2>' + (hist.length ? '<ul class="timeline">' + hist.map(a => '<li><div class="small">' + esc(a.description) + '</div><div class="xs muted">' + fmtDT(a.date) + ' · ' + esc(A.userName(a.userId)) + '</div></li>').join('') + '</ul>' : '<p class="muted small">Событий нет</p>') +
      ((s.assignHistory || []).length ? '<h3 style="margin-top:8px">Назначения</h3><ul class="list">' + s.assignHistory.map(h => '<li class="small"><span>' + esc(A.userName(h.from)) + ' → <b>' + esc(A.userName(h.to)) + '</b>' + (h.reason ? '<br><span class="muted">' + esc(h.reason) + '</span>' : '') + '</span><span class="xs muted">' + fmtDate(h.date) + '</span></li>').join('') + '</ul>' : '') + '</div>';

    ctx.after(root => bindStage(root, s, p, u, docs));
    return '<div class="page-head"><div><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><h1>Этап ' + s.seq + '. ' + esc(s.name) + '</h1>' + U.stageBadge(s) + '</div><p>' + esc(p.name) + ' · ' + esc(p.number) + ' · ' + esc(s.stageType || '') + '</p></div></div>' +
      alerts + '<div class="side-grid"><div>' + main + '</div><div>' + side + '</div></div>';
  };
  function kv(k, v) { return '<div class="kv"><div class="k">' + k + '</div><div class="v" style="font-weight:500">' + v + '</div></div>'; }

  function uploadForm(s, docs) {
    return '<form id="upForm" novalidate><div class="form-top-err"></div>' +
      (docs.length ? field('Документ', '<select name="documentId">' + options(docs.map(d => [d.id, d.title + ' (сейчас v' + A.docVersions(d.id).length + ')']), docs[0].id) + '<option value="">+ Новый документ</option></select>') : '<input type="hidden" name="documentId" value="">') +
      '<div id="newDocFields" class="form-grid ' + (docs.length ? 'hidden' : '') + '">' + field('Название документа', '<input name="title" value="' + esc(docs.length ? '' : (s.expectedResult ? s.name : s.name)) + '">', { req: true }) +
      field('Тип документа', '<select name="type">' + options(A.DOC_TYPES, s.stageType && A.DOC_TYPES.includes(s.stageType) ? s.stageType : 'Прочее') + '</select>') + '</div>' +
      '<div class="drop" id="drop" tabindex="0" role="button" aria-label="Выбрать файл">' + icon('upload', 22) + '<div><b>Перетащите файл сюда</b> или нажмите, чтобы выбрать</div><div class="small">PDF, DOCX, XLSX, DWG, DXF · до 25 МБ · исполняемые файлы запрещены</div><div id="fileInfo" class="small" style="margin-top:6px"></div></div>' +
      '<input type="file" name="file" id="fileInp" class="hidden" accept=".pdf,.docx,.xlsx,.dwg,.dxf">' +
      field('Комментарий к версии', '<textarea name="comment" rows="2" placeholder="Что изменено (например: «Добавлена категория помещения по замечанию Р-031»)"></textarea>', { req: docs.length > 0, hint: 'Для новой версии существующего документа комментарий обязателен' }) +
      '<div id="upProgress" class="small muted"></div><button class="btn primary" type="submit">' + icon('upload', 16) + 'Загрузить ' + (docs.length ? 'новую версию' : 'результат') + '</button></form>';
  }
  function bindUpload(root, onDone, uploader) {
    const f = root.querySelector('#upForm'); if (!f) return;
    const inp = f.querySelector('#fileInp'), drop = f.querySelector('#drop'), info = f.querySelector('#fileInfo');
    const showFile = () => {
      const file = inp.files[0];
      if (!file) { info.textContent = ''; return; }
      const err = A.checkFile(file);
      info.innerHTML = err ? '<span class="red">' + esc(err) + '</span>' : '<span class="green">Выбран: ' + esc(file.name) + ' · ' + U.fmtSize(file.size) + '</span>';
    };
    drop.onclick = () => inp.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) { inp.files = e.dataTransfer.files; showFile(); } };
    inp.onchange = showFile;
    const sel = f.querySelector('select[name=documentId]');
    if (sel) sel.onchange = () => f.querySelector('#newDocFields').classList.toggle('hidden', !!sel.value);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = U.readForm(f);
      const pr = f.querySelector('#upProgress'); pr.textContent = 'Загрузка…';
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const v = await uploader({ file: d.file, documentId: d.documentId ? Number(d.documentId) : null, title: d.title, type: d.type, comment: d.comment });
        U.toast('Загружено: ' + v.fileName + ', версия ' + v.no + ' (' + U.fmtSize(v.size) + ')');
        onDone();
      } catch (err) { pr.textContent = ''; btn.disabled = false; U.handleError(err, f); }
    };
  }

  function bindStage(root, s, p, u, docs) {
    root.querySelectorAll('[data-open-v]').forEach(x => x.onclick = () => U.openVersion(Number(x.dataset.openV)));
    root.querySelectorAll('[data-dl-v]').forEach(x => x.onclick = () => U.downloadVersion(Number(x.dataset.dlV)));
    const prev = root.querySelector('#pdfPreview');
    if (prev) A.getVersionFile(Number(prev.dataset.v)).then(f => { prev.innerHTML = '<iframe class="pdf-view" title="Просмотр PDF" src="' + URL.createObjectURL(f.blob) + '"></iframe>'; }).catch(() => { prev.innerHTML = ''; });
    bindUpload(root, () => window.App.refresh(), (o) => A.uploadVersion(s.id, o));
    const sub = root.querySelector('#submitBtn');
    if (sub && !sub.disabled) sub.onclick = async () => {
      const ok = await U.confirmDlg('Передать на проверку?', 'Загруженная версия будет зафиксирована и станет недоступна для замены. Проверяющий ' + esc(A.userName(s.reviewerId)) + ' получит уведомление.', 'Передать на проверку');
      if (!ok) return;
      try { A.submitStage(s.id, (root.querySelector('#subComment') || {}).value); U.toast('Результат передан на проверку'); window.App.refresh(); } catch (e) { U.handleError(e); }
    };
    root.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => {
      try { A.remarkDecision(Number(b.dataset.rid), b.dataset.rd); U.toast(b.dataset.rd === 'accept' ? 'Исправление принято' : 'Отмечено: не исправлено'); window.App.refresh(); } catch (e) { U.handleError(e); }
    });
    const acc = root.querySelector('#acceptBtn');
    if (acc) acc.onclick = async () => {
      const ok = await U.confirmDlg('Принять результат?', 'Будут зафиксированы проверяющий, дата, версия и комментарий. Этап получит статус «Принят», зависимые этапы будут разблокированы, исполнитель получит уведомление.', 'Принять результат', 'success');
      if (!ok) return;
      try { A.acceptStage(s.id, root.querySelector('#decComment').value); U.toast('Результат принят'); window.App.refresh(); } catch (e) { U.handleError(e); }
    };
    const ret = root.querySelector('#returnBtn');
    if (ret) ret.onclick = async () => {
      const f = root.querySelector('#remForm');
      const data = U.readForm(f);
      U.clearErrors(f);
      const hasNotFixed = db().remarks.some(r => r.stageId === s.id && r.status === 'rework');
      if (!data.text.trim() && !hasNotFixed) { U.showErrors(f, new A.ApiError('При возврате обязательно замечание: заполните текст, раздел и критичность', { text: 'Опишите проблему', section: !data.section ? 'Укажите раздел или лист' : null, severity: !data.severity ? 'Выберите критичность' : null, category: !data.category ? 'Выберите категорию' : null })); f.scrollIntoView({ behavior: 'smooth' }); return; }
      const ok = await U.confirmDlg('Вернуть на доработку?', 'Версия получит статус «Возвращена», этап — «На доработке». Исполнитель ' + esc(A.userName(s.executorId)) + ' получит уведомление с замечаниями. Зависимые этапы останутся заблокированными.', 'Вернуть на доработку', 'warn');
      if (!ok) return;
      try {
        A.returnStage(s.id, data.text.trim() ? Object.assign(data, { versionId: Number(data.versionId), fromAi: !!data.fromAi }) : null, root.querySelector('#decComment').value);
        U.toast('Результат возвращён на доработку'); window.App.refresh();
      } catch (e) { U.handleError(e, f); f.scrollIntoView({ behavior: 'smooth' }); }
    };
    const aiH = root.querySelector('#aiHelp');
    if (aiH) aiH.onclick = () => {
      const f = root.querySelector('#remForm');
      Views.aiPanel({ query: f.text.value, stageType: s.stageType, onDraft: (rec) => { f.text.value = rec.text; f.fromAi.value = '1'; if (!f.category.value) f.category.value = rec.category; f.text.focus(); U.toast('Текст скопирован в черновик замечания — проверьте и отредактируйте его'); } });
    };
    const aiS = root.querySelector('#aiSide');
    if (aiS) aiS.onclick = () => {
      const lastRem = db().remarks.find(r => r.stageId === s.id && ['open', 'rework'].includes(r.status));
      Views.aiPanel({ query: lastRem ? lastRem.text : '', stageType: s.stageType });
    };
    const ga = root.querySelector('#gAssign'); if (ga) ga.onclick = () => Views.assignDialog(s);
    const ge = root.querySelector('#gEdit'); if (ge) ge.onclick = () => Views.stageDialog(p, s);
    const gd = root.querySelector('#gDeadline');
    if (gd) gd.onclick = () => U.modal({
      title: 'Изменить срок этапа', subtitle: 'Этап ' + s.seq + ': ' + s.name + ' · текущий срок ' + fmtDate(s.deadline, true),
      body: '<div class="form-top-err"></div>' + field('Новый срок', '<input type="date" name="deadline" value="' + s.deadline + '">', { req: true }) + field('Причина переноса', '<textarea name="reason" rows="3"></textarea>', { req: true }),
      okLabel: 'Изменить срок', footNote: 'Исполнитель получит уведомление, перенос запишется в историю.',
      onOk: (m) => { const d = U.readForm(m); A.changeDeadline(s.id, d.deadline, d.reason); U.toast('Срок изменён'); window.App.refresh(); }
    });
    const gc = root.querySelector('#gCancel');
    if (gc) gc.onclick = () => {
      const deps = db().stages.filter(d => (d.dependsOn || []).includes(s.id));
      U.modal({
        title: 'Отменить приёмку этапа?', subtitle: 'Этап ' + s.seq + ': ' + s.name,
        body: '<div class="form-top-err"></div>' + U.alertBox('warn', 'Этап вернётся в статус «На доработке». ' + (deps.length ? 'Будут заблокированы зависимые этапы: ' + deps.map(d => d.seq + '. ' + esc(d.name)).join('; ') + '.' : 'Зависимых этапов нет.') + ' Принятые версии и история проверок сохраняются.') +
          field('Причина отмены (будет записана в историю)', '<textarea name="reason" rows="3"></textarea>', { req: true }),
        okLabel: 'Отменить приёмку', okClass: 'danger',
        onOk: (m) => { const d = U.readForm(m); A.cancelAcceptance(s.id, d.reason); U.toast('Приёмка отменена, зависимые этапы заблокированы'); window.App.refresh(); }
      });
    };
    const ap = root.querySelector('#apForm');
    if (ap) ap.onsubmit = (e) => { e.preventDefault(); try { A.setApproval(s.id, U.readForm(ap)); U.toast('Статус согласования сохранён'); window.App.refresh(); } catch (er) { U.handleError(er, ap); } };
    const ext = root.querySelector('#extRemark');
    if (ext) ext.onclick = () => {
      const vers = db().versions.filter(v => v.stageId && A.find('stages', v.stageId).projectId === p.id).sort((a, b) => b.date.localeCompare(a.date));
      const execs = Array.from(new Set(A.stagesOf(p.id).map(x => x.executorId).filter(Boolean))).map(A.userById);
      U.modal({
        title: 'Внешнее замечание', subtitle: 'Замечание согласующей стороны · ' + p.name, wide: true,
        body: '<div class="form-top-err"></div><div class="form-grid">' + field('Текст замечания', '<textarea name="text" rows="3"></textarea>', { req: true, cls: 'full' }) +
          field('Документ и версия', '<select name="versionId">' + options(vers.map(v => [v.id, A.find('documents', v.documentId).title + ', v' + v.no]), '', '— выберите —') + '</select>', { req: true }) +
          field('Раздел или лист', '<input name="section">', { req: true }) +
          field('Ответственный исполнитель', '<select name="executorId">' + options(execs.map(x => [x.id, x.fullName]), '', '— выберите —') + '</select>', { req: true }) +
          field('Критичность', '<select name="severity">' + options(Object.keys(A.SEVERITY).map(k => [k, A.SEVERITY[k][0]]), '', '— выберите —') + '</select>', { req: true }) +
          field('Срок ответа', '<input type="date" name="deadline">') + '</div>',
        okLabel: 'Зарегистрировать',
        onOk: (m) => { const d = U.readForm(m); d.versionId = Number(d.versionId) || null; d.executorId = Number(d.executorId) || null; const r = A.registerExternalRemark(s.id, d); U.toast('Внешнее замечание ' + r.number + ' зарегистрировано'); window.App.refresh(); }
      });
    };
  }

  /* ---------- Загрузка исходных документов проекта ---------- */
  Views.uploadDialog = function (opts) {
    const docs = opts.documents || [];
    U.modal({
      title: 'Загрузить документ', subtitle: opts.project.name + ' · исходные материалы', foot: false,
      body: '<form id="upForm" novalidate><div class="form-top-err"></div>' +
        (docs.length ? field('Документ', '<select name="documentId"><option value="">+ Новый документ</option>' + options(docs.map(d => [d.id, d.title + ' — новая версия'])) + '</select>') : '<input type="hidden" name="documentId" value="">') +
        '<div id="newDocFields" class="form-grid">' + field('Название документа', '<input name="title">', { req: true }) + field('Тип документа', '<select name="type">' + options(A.DOC_TYPES, 'Задание') + '</select>') + '</div>' +
        '<div class="drop" id="drop" tabindex="0" role="button">' + icon('upload', 22) + '<div><b>Перетащите файл</b> или нажмите для выбора</div><div class="small">PDF, DOCX, XLSX, DWG, DXF · до 25 МБ</div><div id="fileInfo" class="small"></div></div><input type="file" name="file" id="fileInp" class="hidden" accept=".pdf,.docx,.xlsx,.dwg,.dxf">' +
        field('Комментарий', '<textarea name="comment" rows="2"></textarea>') + '<div id="upProgress" class="small muted"></div><div class="modal-foot"><button type="button" class="btn" data-close>Отмена</button><button class="btn primary" type="submit">Загрузить документ</button></div></form>',
      onMount: (m, close) => {
        const sel = m.querySelector('select[name=documentId]');
        bindUpload(m, () => { close(); window.App.refresh(); }, (o) => A.uploadSourceDoc(opts.project.id, o));
        if (sel) sel.onchange = () => m.querySelector('#newDocFields').classList.toggle('hidden', !!sel.value);
      }
    });
  };

  /* ---------- Боковая панель ИИ-помощника ---------- */
  Views.aiPanel = function (opts) {
    opts = opts || {};
    U.modal({
      title: 'ИИ-помощник', subtitle: 'Поиск похожих замечаний в архиве', wide: true, cancelLabel: 'Закрыть',
      body: U.alertBox('warn', '<b>Подсказка носит справочный характер и требует проверки специалистом.</b> Помощник не проверяет чертежи, не принимает результаты и не создаёт замечания без вашего подтверждения.') +
        '<form id="aiF" class="form-grid" novalidate><div class="form-top-err full"></div>' + field('Опишите замечание или вставьте текст для поиска похожих случаев', '<textarea name="query" rows="3">' + esc(opts.query || '') + '</textarea>', { cls: 'full' }) +
        field('Тип этапа', '<select name="stageType">' + options(A.STAGE_TYPES, opts.stageType || '', 'Любой') + '</select>') + field('Тип документа', '<select name="docType">' + options(A.DOC_TYPES, '', 'Любой') + '</select>') +
        '<div class="full"><button class="btn primary" type="submit">' + icon('search', 16) + 'Найти похожие замечания</button></div></form><div id="aiRes" style="margin-top:16px"></div>',
      onMount: (m, close) => {
        const f = m.querySelector('#aiF');
        f.onsubmit = (e) => { e.preventDefault(); Views.runAi(f, m.querySelector('#aiRes'), opts.onDraft ? (rec) => { opts.onDraft(rec); close(); } : null); };
        if (opts.query) f.onsubmit(new Event('submit'));
      }
    });
  };
})();

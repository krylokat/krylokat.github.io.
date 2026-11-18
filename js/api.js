/*
 * Слой бизнес-логики («сервер» прототипа).
 * Все изменяющие операции проходят через функции этого модуля: здесь проверяются права роли,
 * переходы статусов, зависимости этапов, обязательные поля; здесь же пишется журнал аудита
 * и создаются уведомления. Интерфейс только вызывает эти функции — скрытие кнопок не заменяет проверку.
 */
(function () {
  'use strict';
  const S = window.PozhStore;
  const db = () => S.db;

  class ApiError extends Error { constructor(msg, fields) { super(msg); this.fields = fields || null; this.isApi = true; } }
  const fail = (msg, fields) => { throw new ApiError(msg, fields); };

  /* ---------- Справочники ---------- */
  const ROLES = {
    director: 'Директор', gip: 'ГИП', designer: 'Проектировщик', calculator: 'Расчётчик',
    expert: 'Эксперт', estimator: 'Сметчик', manager: 'Менеджер по согласованию'
  };
  const ROLES_FULL = Object.assign({}, ROLES, { gip: 'Главный инженер проекта (ГИП)' });
  const EXECUTOR_ROLES = ['designer', 'calculator', 'estimator', 'manager'];
  const PROJECT_STATUS = {
    draft: ['Черновик', 'gray'], in_work: ['В работе', 'blue'], approval: ['На согласовании', 'amber'],
    done: ['Завершён', 'green'], archived: ['В архиве', 'gray']
  };
  const STAGE_STATE = {
    accepted: ['Принят', 'green'], review: ['Ожидает проверки', 'amber'], rework: ['На доработке', 'blue'],
    in_work: ['В работе', 'blue'], blocked: ['Заблокирован', 'gray'], unassigned: ['Не назначен', 'gray'], draft: ['Не начат', 'gray']
  };
  const VERSION_STATUS = {
    uploaded: ['Загружена', 'gray'], submitted: ['Ожидает проверки', 'amber'], accepted: ['Принята', 'green'], returned: ['Возвращена', 'red']
  };
  const REMARK_STATUS = {
    open: ['Открыто', 'gray'], rework: ['На доработке', 'blue'], fixed: ['Исправлено, ожидает проверки', 'amber'],
    accepted: ['Принято', 'green'], irrelevant: ['Неактуально', 'gray']
  };
  const SEVERITY = { critical: ['Критическое', 'red'], major: ['Существенное', 'amber'], minor: ['Незначительное', 'gray'] };
  const USER_STATUS = { active: ['Активна', 'green'], blocked: ['Заблокирована', 'amber'], deactivated: ['Деактивирована', 'gray'] };
  const AI_STATUS = { included: ['В архиве ИИ', 'green'], pending: ['Кандидат в архив ИИ', 'amber'], excluded: ['Исключено', 'gray'], rejected: ['Не включать', 'gray'] };
  const REMARK_CATEGORIES = ['Нормативные требования', 'Комплектность', 'Оформление', 'Согласованность разделов', 'Расчётная ошибка', 'Сметная ошибка', 'Внешнее замечание (надзорный орган)'];
  const STAGE_TYPES = ['Обследование', 'Расчёт', 'Схема', 'План', 'Спецификация', 'Смета', 'Пояснительная записка', 'Согласование'];
  const DOC_TYPES = ['Задание', 'План', 'Схема', 'Расчёт', 'Спецификация', 'Смета', 'Пояснительная записка', 'Отчёт', 'Письмо', 'Прочее'];
  const ALLOWED_EXT = ['pdf', 'docx', 'xlsx', 'dwg', 'dxf'];
  const MAX_SIZE = 25 * 1024 * 1024;
  const FORBIDDEN_EXT = ['exe', 'bat', 'cmd', 'com', 'msi', 'js', 'vbs', 'ps1', 'sh', 'jar', 'scr', 'dll', 'apk', 'html', 'htm'];
  const NOTE_TYPES = {
    assign: 'Назначение', deadline: 'Приближение срока', overdue: 'Просрочка', review: 'Результат на проверке',
    returned: 'Возврат на доработку', accepted: 'Результат принят', reassign: 'Изменение назначения', info: 'Событие', unblocked: 'Этап доступен'
  };

  /* ---------- Даты ---------- */
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function daysTo(dateStr) {
    if (!dateStr) return null;
    const a = new Date(today() + 'T12:00:00'), b = new Date(dateStr + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }
  const nowIso = () => new Date().toISOString();

  /* ---------- Доступ к таблицам ---------- */
  const find = (table, id) => db()[table].find(x => x.id === Number(id)) || null;
  const userById = (id) => find('users', id);
  const userName = (id) => { const u = userById(id); return u ? u.fullName : '—'; };
  const projectOf = (stage) => find('projects', stage.projectId);
  const stagesOf = (projectId) => db().stages.filter(s => s.projectId === Number(projectId)).sort((a, b) => a.seq - b.seq);

  /* ---------- Сессия ---------- */
  function me() {
    const s = S.Session.get();
    if (!s) return null;
    const u = userById(s.userId);
    if (!u || u.status !== 'active') { S.Session.clear(); return null; }
    return u;
  }
  function requireUser() { const u = me(); if (!u) fail('Сеанс завершён. Войдите в систему снова.'); return u; }

  /* ---------- Журнал аудита и уведомления ---------- */
  function audit(action, objType, objId, projectId, description, oldValue, newValue, userId) {
    const u = me();
    db().audit.push({
      id: S.nextId('audit'), userId: userId || (u ? u.id : null), action, objType, objId, projectId: projectId || null,
      date: nowIso(), description, oldValue: oldValue == null ? null : String(oldValue), newValue: newValue == null ? null : String(newValue)
    });
  }
  function notify(userId, type, text, link) {
    if (!userId) return;
    db().notifications.push({ id: S.nextId('notifications'), userId, type, text, link, date: nowIso(), readAt: null });
  }

  /* ---------- Права ---------- */
  const isDirector = (u) => u && u.role === 'director';
  const canManageUsers = (u) => !!u && (u.role === 'director' || u.canManageUsers);
  const canManageClients = (u) => !!u && (u.role === 'director' || u.canManageClients);
  const canCreateProject = (u) => !!u && (u.role === 'gip' || (u.role === 'director' && u.canManageProjects));
  const canManageProject = (u, p) => !!u && !!p && ((u.role === 'gip' && p.gipId === u.id) || (u.role === 'director' && u.canManageProjects));
  const canManageAiArchive = (u) => !!u && (u.role === 'director' || u.role === 'expert');
  function canViewProject(u, p) {
    if (!u || !p) return false;
    if (u.role === 'director') return true;
    if (p.gipId === u.id) return true;
    return db().stages.some(s => s.projectId === p.id && (s.executorId === u.id || s.reviewerId === u.id));
  }
  function canViewStage(u, s) {
    if (!u || !s) return false;
    const p = projectOf(s);
    if (u.role === 'director' || (p && p.gipId === u.id)) return true;
    return s.executorId === u.id || s.reviewerId === u.id;
  }
  function canViewDocument(u, d) {
    if (!d) return false;
    if (d.stageId) return canViewStage(u, find('stages', d.stageId));
    return canViewProject(u, find('projects', d.projectId));
  }
  function canViewRemark(u, r) {
    if (!u || !r) return false;
    const p = find('projects', r.projectId);
    if (u.role === 'director' || (p && p.gipId === u.id)) return true;
    if (r.executorId === u.id || r.authorId === u.id) return true;
    const s = find('stages', r.stageId);
    return !!s && s.reviewerId === u.id;
  }
  const visibleProjects = (u) => db().projects.filter(p => canViewProject(u, p));
  const visibleStages = (u) => db().stages.filter(s => canViewStage(u, s));
  const visibleDocuments = (u) => db().documents.filter(d => canViewDocument(u, d));
  const visibleRemarks = (u) => db().remarks.filter(r => canViewRemark(u, r));

  /* ---------- Состояние этапа ---------- */
  function unmetDeps(s) { return (s.dependsOn || []).map(id => find('stages', id)).filter(d => d && d.status !== 'accepted'); }
  function stageState(s) {
    if (s.status === 'accepted') return 'accepted';
    const p = projectOf(s);
    if (p && p.status === 'draft') return 'draft';
    if (unmetDeps(s).length) return 'blocked';
    if (s.status === 'review') return 'review';
    if (s.status === 'rework') return 'rework';
    if (!s.executorId) return 'unassigned';
    return 'in_work';
  }
  function blockReason(s) {
    const un = unmetDeps(s);
    if (!un.length) return '';
    const nums = un.map(d => d.seq);
    return nums.length === 1 ? 'Ждёт принятия этапа ' + nums[0] : 'Ждёт принятия этапов ' + nums.slice(0, -1).join(', ') + ' и ' + nums[nums.length - 1];
  }
  const isStageOverdue = (s) => s.status !== 'accepted' && s.deadline && daysTo(s.deadline) < 0 && projectOf(s).status !== 'draft';
  function projectProgress(p) {
    const st = stagesOf(p.id);
    const acc = st.filter(s => s.status === 'accepted').length;
    return { total: st.length, accepted: acc, pct: st.length ? Math.round(acc * 100 / st.length) : 0 };
  }
  function projectCounters(p) {
    const c = { review: 0, rework: 0, accepted: 0, blocked: 0, in_work: 0 };
    stagesOf(p.id).forEach(s => { const st = stageState(s); if (c[st] != null) c[st]++; });
    return c;
  }
  function nearestStageDeadline(p) {
    const open = stagesOf(p.id).filter(s => s.status !== 'accepted' && s.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
    return open[0] || null;
  }
  function isProjectOverdue(p) {
    if (!['in_work', 'approval'].includes(p.status)) return false;
    return daysTo(p.endDate) < 0 || stagesOf(p.id).some(isStageOverdue);
  }
  function stageVersions(stageId) {
    const docIds = db().documents.filter(d => d.stageId === Number(stageId)).map(d => d.id);
    return db().versions.filter(v => docIds.includes(v.documentId)).sort((a, b) => b.date.localeCompare(a.date));
  }
  function docVersions(docId) { return db().versions.filter(v => v.documentId === Number(docId)).sort((a, b) => b.no - a.no); }

  /* ---------- Загрузка сотрудников ---------- */
  function workload(userId, periodDays) {
    periodDays = periodDays || 14;
    const active = db().stages.filter(s => s.executorId === userId && s.status !== 'accepted' && ['in_work', 'approval'].includes(projectOf(s).status));
    const working = active.filter(s => ['in_work', 'rework', 'review'].includes(stageState(s)));
    let hours = 0, approx = false;
    working.forEach(s => {
      if (stageState(s) === 'review') return;
      if (s.effortHours) hours += s.effortHours; else { hours += 16; approx = true; }
    });
    const capacity = periodDays / 7 * 40;
    const pct = Math.round(hours * 100 / capacity);
    const deadlines = active.filter(s => s.deadline).map(s => s.deadline).sort();
    const overdue = active.some(isStageOverdue);
    const overload = pct >= 85 || active.length > 5;
    return { active: active.length, hours, pct, approx, nearest: deadlines[0] || null, overdue, overload };
  }

  /* ---------- Вход и учётная запись ---------- */
  const NEUTRAL_LOGIN_ERROR = 'Не удалось войти. Проверьте данные или обратитесь к директору';
  function login(email, password) {
    email = String(email || '').trim().toLowerCase();
    if (!email || !password) fail('Заполните рабочую почту и пароль', { email: !email ? 'Укажите рабочую почту' : null, password: !password ? 'Введите пароль' : null });
    const att = db().loginAttempts[email] || { count: 0, until: null };
    if (att.until && new Date(att.until) > new Date()) {
      const min = Math.ceil((new Date(att.until) - new Date()) / 60000);
      fail('Вход временно заблокирован после 5 неудачных попыток. Повторите через ' + min + ' мин. или обратитесь к директору.');
    }
    const u = db().users.find(x => x.email.toLowerCase() === email);
    const ok = u && u.status === 'active' && S.hashPassword(password, u.salt) === u.passwordHash;
    if (!ok) {
      att.count = (att.until && new Date(att.until) <= new Date()) ? 1 : att.count + 1;
      att.until = null;
      if (att.count >= 5) { att.until = new Date(Date.now() + 15 * 60000).toISOString(); att.count = 0; }
      db().loginAttempts[email] = att; S.save();
      fail(NEUTRAL_LOGIN_ERROR);
    }
    delete db().loginAttempts[email];
    u.lastLogin = nowIso();
    S.Session.set({ userId: u.id, at: nowIso() });
    audit('auth.login', 'user', u.id, null, 'Вход в систему', null, null, u.id);
    S.save();
    generateDeadlineNotifications();
    return u;
  }
  function logout() { const u = me(); if (u) { audit('auth.logout', 'user', u.id, null, 'Выход из системы'); S.save(); } S.Session.clear(); }
  function changePassword(oldPw, newPw, newPw2) {
    const u = requireUser();
    const f = {};
    if (!u.mustChangePassword && S.hashPassword(oldPw || '', u.salt) !== u.passwordHash) f.old = 'Текущий пароль указан неверно';
    if (!newPw || newPw.length < 8) f.new1 = 'Новый пароль — не менее 8 символов';
    if (newPw !== newPw2) f.new2 = 'Пароли не совпадают';
    if (Object.keys(f).length) fail('Пароль не изменён: исправьте отмеченные поля', f);
    u.salt = S.newSalt(); u.passwordHash = S.hashPassword(newPw, u.salt); u.mustChangePassword = false;
    audit('user.password', 'user', u.id, null, 'Пользователь сменил пароль');
    S.save();
  }

  /* ---------- Сотрудники ---------- */
  function tempPassword() {
    const a = 'abcdefghjkmnpqrstuvwxyz23456789';
    const r = new Uint8Array(10); crypto.getRandomValues(r);
    return Array.from(r, x => a[x % a.length]).join('');
  }
  function validateUser(data, id) {
    const f = {};
    if (!data.fullName || data.fullName.trim().length < 3) f.fullName = 'Укажите ФИО (не менее 3 символов)';
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) f.email = 'Укажите корректную рабочую почту';
    else if (db().users.some(x => x.email.toLowerCase() === email && x.id !== id)) f.email = 'Сотрудник с такой почтой уже есть';
    if (!ROLES[data.role]) f.role = 'Выберите роль';
    if (Object.keys(f).length) fail('Проверьте отмеченные поля', f);
    return email;
  }
  function createUser(data) {
    const u = requireUser();
    if (!canManageUsers(u)) fail('Доступ запрещён: создавать учётные записи может директор или уполномоченный им сотрудник');
    const email = validateUser(data, null);
    const pw = tempPassword(); const salt = S.newSalt();
    const nu = {
      id: S.nextId('users'), fullName: data.fullName.trim(), email, role: data.role, department: (data.department || '').trim(), phone: (data.phone || '').trim(),
      status: 'active', salt, passwordHash: S.hashPassword(pw, salt), mustChangePassword: true,
      canManageUsers: false, canManageClients: !!data.canManageClients, canManageProjects: false, lastLogin: null, createdAt: nowIso(), isTest: !!db().meta.demo
    };
    db().users.push(nu);
    audit('user.create', 'user', nu.id, null, 'Создана учётная запись ' + nu.fullName + ' (' + ROLES[nu.role] + ')');
    S.save();
    return { user: nu, tempPassword: pw };
  }
  function updateUser(id, data) {
    const u = requireUser();
    if (!canManageUsers(u)) fail('Доступ запрещён');
    const t = userById(id); if (!t) fail('Сотрудник не найден');
    const email = validateUser(Object.assign({}, t, data, { role: t.role }), t.id);
    const changes = [];
    if (t.fullName !== data.fullName.trim()) changes.push('ФИО');
    if (t.email !== email) changes.push('почта');
    if ((t.department || '') !== (data.department || '')) changes.push('подразделение');
    if ((t.phone || '') !== (data.phone || '')) changes.push('телефон');
    if (!!t.canManageClients !== !!data.canManageClients) changes.push('право ведения клиентов');
    Object.assign(t, { fullName: data.fullName.trim(), email, department: data.department || '', phone: data.phone || '', canManageClients: !!data.canManageClients });
    audit('user.update', 'user', t.id, null, 'Изменены данные ' + t.fullName + (changes.length ? ': ' + changes.join(', ') : ''));
    S.save();
  }
  function changeRole(id, role) {
    const u = requireUser();
    if (!canManageUsers(u)) fail('Доступ запрещён');
    const t = userById(id); if (!t) fail('Сотрудник не найден');
    if (!ROLES[role]) fail('Выберите роль');
    if (t.id === u.id) fail('Нельзя изменить собственную роль');
    const old = t.role; t.role = role;
    audit('user.role', 'user', t.id, null, 'Роль ' + t.fullName + ' изменена', ROLES[old], ROLES[role]);
    S.save();
  }
  function resetAccess(id) {
    const u = requireUser();
    if (!canManageUsers(u)) fail('Доступ запрещён');
    const t = userById(id); if (!t) fail('Сотрудник не найден');
    const pw = tempPassword(); t.salt = S.newSalt(); t.passwordHash = S.hashPassword(pw, t.salt); t.mustChangePassword = true;
    delete db().loginAttempts[t.email];
    audit('user.reset', 'user', t.id, null, 'Сброшен доступ (выдан временный пароль) для ' + t.fullName);
    S.save();
    return pw;
  }
  function setUserStatus(id, status) {
    const u = requireUser();
    if (!canManageUsers(u)) fail('Доступ запрещён');
    const t = userById(id); if (!t) fail('Сотрудник не найден');
    if (t.id === u.id) fail('Нельзя заблокировать или деактивировать собственную учётную запись');
    if (!USER_STATUS[status]) fail('Неизвестный статус');
    const old = t.status; t.status = status;
    const verb = { active: 'Восстановлена', blocked: 'Заблокирована', deactivated: 'Деактивирована' }[status];
    audit('user.status', 'user', t.id, null, verb + ' учётная запись ' + t.fullName, USER_STATUS[old][0], USER_STATUS[status][0]);
    S.save();
  }

  /* ---------- Клиенты ---------- */
  function normName(s) { return String(s || '').toLowerCase().replace(/[«»"'.,]/g, '').replace(/\b(ооо|ао|пао|ип|мбоу)\b/g, '').replace(/\s+/g, ' ').trim(); }
  function findClientDuplicate(data, id) {
    const n = normName(data.name);
    return db().clients.find(c => c.id !== id && ((n && normName(c.name) === n) || (data.inn && c.inn && c.inn === data.inn))) || null;
  }
  function saveClient(data, id, force) {
    const u = requireUser();
    if (!canManageClients(u)) fail('Доступ запрещён: справочник клиентов ведёт директор или уполномоченный сотрудник');
    const f = {};
    if (!data.name || data.name.trim().length < 2) f.name = 'Укажите название организации или ФИО';
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) f.email = 'Некорректная почта';
    if (!data.source || !data.source.trim()) f.source = 'Укажите источник сведений';
    if (Object.keys(f).length) fail('Проверьте отмеченные поля', f);
    const dup = findClientDuplicate(data, id ? Number(id) : null);
    if (dup && !force) { const e = new ApiError('Похожий клиент уже есть в справочнике: ' + dup.name); e.duplicate = dup; throw e; }
    const fields = ['name', 'type', 'contactPerson', 'phone', 'email', 'address', 'note', 'inn', 'source'];
    if (id) {
      const c = find('clients', id); if (!c) fail('Клиент не найден');
      const changed = fields.filter(k => (c[k] || '') !== (data[k] || '').trim());
      fields.forEach(k => { c[k] = (data[k] || '').trim(); });
      c.updatedAt = nowIso(); c.updatedBy = u.id;
      c.changes = (c.changes || []).concat([{ date: nowIso(), userId: u.id, fields: changed }]);
      audit('client.update', 'client', c.id, null, 'Изменён клиент ' + c.name + (changed.length ? ' (поля: ' + changed.join(', ') + ')' : ''));
      S.save(); return c;
    }
    const c = { id: S.nextId('clients'), status: 'active', createdAt: nowIso(), updatedAt: nowIso(), updatedBy: u.id, isTest: !!db().meta.demo, changes: [] };
    fields.forEach(k => { c[k] = (data[k] || '').trim(); });
    db().clients.push(c);
    audit('client.create', 'client', c.id, null, 'Добавлен клиент ' + c.name);
    S.save(); return c;
  }
  function setClientStatus(id, status) {
    const u = requireUser();
    if (!canManageClients(u)) fail('Доступ запрещён');
    const c = find('clients', id); if (!c) fail('Клиент не найден');
    c.status = status; c.updatedAt = nowIso(); c.updatedBy = u.id;
    audit('client.status', 'client', c.id, null, (status === 'archived' ? 'Клиент переведён в архив: ' : 'Клиент восстановлен: ') + c.name);
    S.save();
  }
  function deleteClient(id) {
    const u = requireUser();
    if (!canManageClients(u)) fail('Доступ запрещён');
    const c = find('clients', id); if (!c) fail('Клиент не найден');
    if (db().projects.some(p => p.clientId === c.id)) fail('Клиента со связанными проектами удалить нельзя — переведите его в архив');
    db().clients = db().clients.filter(x => x.id !== c.id);
    audit('client.delete', 'client', c.id, null, 'Удалён клиент без проектов: ' + c.name);
    S.save();
  }

  /* ---------- Проекты ---------- */
  function validateProject(data) {
    const f = {};
    const name = (data.name || '').trim();
    if (name.length < 3 || name.length > 200) f.name = 'Название — от 3 до 200 символов';
    const c = find('clients', data.clientId);
    if (!c) f.clientId = 'Выберите заказчика из справочника';
    else if (c.status !== 'active') f.clientId = 'Клиент в архиве — выберите активного';
    const g = userById(data.gipId);
    if (!g || g.status !== 'active' || g.role !== 'gip') f.gipId = 'Выберите активного ГИПа';
    if (!data.startDate) f.startDate = 'Укажите дату начала';
    if (!data.endDate) f.endDate = 'Укажите плановую дату окончания';
    else if (data.startDate && data.endDate < data.startDate) f.endDate = 'Дата окончания не может быть раньше даты начала';
    if (Object.keys(f).length) fail('Проект не сохранён: исправьте отмеченные поля', f);
  }
  function nextProjectNumber() {
    const y = new Date().getFullYear();
    const nums = db().projects.map(p => p.number).filter(n => n.startsWith('ПБ-' + y + '-')).map(n => Number(n.split('-')[2]));
    return 'ПБ-' + y + '-' + String((nums.length ? Math.max.apply(null, nums) : 0) + 1).padStart(3, '0');
  }
  function createProject(data) {
    const u = requireUser();
    if (!canCreateProject(u)) fail('Доступ запрещён: создавать проекты может ГИП');
    if (u.role === 'gip') data.gipId = u.id;
    validateProject(data);
    const p = {
      id: S.nextId('projects'), number: nextProjectNumber(), name: data.name.trim(), clientId: Number(data.clientId), gipId: Number(data.gipId),
      status: 'draft', description: (data.description || '').trim(), objectAddress: (data.objectAddress || '').trim(),
      startDate: data.startDate, endDate: data.endDate, createdAt: nowIso(), createdBy: u.id, isTest: !!db().meta.demo
    };
    db().projects.push(p);
    audit('project.create', 'project', p.id, p.id, 'Создан проект «' + p.name + '» (' + p.number + '), статус «Черновик»');
    S.save(); return p;
  }
  function projectEditImpact(p, data) {
    const started = stagesOf(p.id).some(s => ['in_work', 'review', 'rework', 'accepted'].includes(stageState(s)) || s.status === 'accepted');
    const keyChanged = p.name !== (data.name || '').trim() || p.clientId !== Number(data.clientId) || p.startDate !== data.startDate || p.endDate !== data.endDate;
    return started && keyChanged && p.status !== 'draft';
  }
  function updateProject(id, data, reason) {
    const u = requireUser();
    const p = find('projects', id); if (!p) fail('Проект не найден');
    if (!canManageProject(u, p)) fail('Доступ запрещён: изменять проект может его ГИП');
    data.gipId = data.gipId || p.gipId;
    validateProject(data);
    if (projectEditImpact(p, data) && !(reason || '').trim()) fail('Изменение затрагивает начатые или принятые этапы — укажите причину', { reason: 'Укажите причину изменения' });
    const labels = { name: 'Название', clientId: 'Заказчик', startDate: 'Дата начала', endDate: 'Плановая дата окончания', description: 'Описание', objectAddress: 'Объект', gipId: 'ГИП' };
    const changes = [];
    Object.keys(labels).forEach(k => {
      let nv = data[k]; if (k === 'clientId' || k === 'gipId') nv = Number(nv); if (typeof nv === 'string') nv = nv.trim();
      if ((p[k] || '') !== (nv || '')) {
        const fmt = (k2, v) => k2 === 'clientId' ? (find('clients', v) || {}).name : k2 === 'gipId' ? userName(v) : v;
        changes.push({ k: labels[k], o: fmt(k, p[k]), n: fmt(k, nv) }); p[k] = nv;
      }
    });
    changes.forEach(c => audit('project.update', 'project', p.id, p.id, 'Изменено поле «' + c.k + '»' + (reason ? '. Причина: ' + reason : ''), c.o, c.n));
    S.save(); return changes.length;
  }
  function startProject(id) {
    const u = requireUser();
    const p = find('projects', id); if (!p) fail('Проект не найден');
    if (!canManageProject(u, p)) fail('Доступ запрещён');
    if (p.status !== 'draft') fail('Запустить можно только проект в статусе «Черновик»');
    const st = stagesOf(p.id);
    if (!st.length) fail('Добавьте хотя бы один этап перед запуском проекта');
    p.status = 'in_work';
    st.forEach(s => {
      if (stageState(s) === 'in_work') { s.status = 'in_work'; notify(s.executorId, 'assign', p.name + ': этап ' + s.seq + ' «' + s.name + '» доступен для работы', '#/stage/' + s.id); }
    });
    audit('project.start', 'project', p.id, p.id, 'Проект запущен в работу', 'Черновик', 'В работе');
    S.save();
  }
  function setProjectStatus(id, status) {
    const u = requireUser();
    const p = find('projects', id); if (!p) fail('Проект не найден');
    if (!canManageProject(u, p)) fail('Доступ запрещён');
    if (status === 'done' && stagesOf(p.id).some(s => s.status !== 'accepted')) fail('Завершить проект можно после принятия всех этапов');
    if (status === 'archived' && p.status !== 'done') fail('В архив переводится завершённый проект');
    if (status === 'approval' && p.status !== 'in_work') fail('На согласование передаётся проект в работе');
    if (status === 'in_work' && p.status !== 'approval') fail('Недопустимый переход статуса');
    const old = p.status; p.status = status;
    audit('project.status', 'project', p.id, p.id, 'Изменён статус проекта', PROJECT_STATUS[old][0], PROJECT_STATUS[status][0]);
    S.save();
  }

  /* ---------- Этапы ---------- */
  function wouldCycle(stageId, deps) {
    // есть ли путь от любой зависимости обратно к stageId
    const seen = new Set();
    const stack = deps.slice();
    while (stack.length) {
      const id = stack.pop();
      if (id === stageId) return true;
      if (seen.has(id)) continue; seen.add(id);
      const s = find('stages', id); if (s) stack.push.apply(stack, s.dependsOn || []);
    }
    return false;
  }
  const A_ROLES_OK = (r) => EXECUTOR_ROLES.includes(r);
  function saveStage(projectId, data, stageId, reason) {
    const u = requireUser();
    const p = find('projects', projectId); if (!p) fail('Проект не найден');
    if (!canManageProject(u, p)) fail('Доступ запрещён: этапы формирует ГИП проекта');
    const f = {};
    if (!data.name || data.name.trim().length < 3) f.name = 'Название этапа — не менее 3 символов';
    if (!data.startDate) f.startDate = 'Укажите плановую дату начала';
    if (!data.deadline) f.deadline = 'Укажите плановую дату завершения';
    else if (data.startDate && data.deadline < data.startDate) f.deadline = 'Срок не может быть раньше даты начала';
    const exec = data.executorId ? userById(data.executorId) : null;
    const rev = data.reviewerId ? userById(data.reviewerId) : null;
    if (exec && exec.status !== 'active') f.executorId = 'Исполнитель должен быть активным сотрудником';
    if (!rev) f.reviewerId = 'Назначьте проверяющего';
    else if (rev.status !== 'active') f.reviewerId = 'Проверяющий должен быть активным сотрудником';
    if (exec && rev && exec.id === rev.id) f.reviewerId = 'Исполнитель не может проверять собственный результат';
    const deps = (data.dependsOn || []).map(Number);
    const own = stagesOf(p.id).map(s => s.id);
    if (deps.some(d => !own.includes(d))) f.dependsOn = 'Зависимость указывает на несуществующий этап';
    if (stageId && deps.includes(Number(stageId))) f.dependsOn = 'Этап не может зависеть сам от себя';
    else if (stageId && wouldCycle(Number(stageId), deps)) f.dependsOn = 'Циклическая зависимость: выбранный этап уже зависит от текущего';
    if (data.effortHours && (isNaN(data.effortHours) || Number(data.effortHours) <= 0)) f.effortHours = 'Трудоёмкость — положительное число часов';
    if (Object.keys(f).length) fail('Этап не сохранён: исправьте отмеченные поля', f);
    const clean = {
      name: data.name.trim(), description: (data.description || '').trim(), stageType: data.stageType || 'Прочее',
      startDate: data.startDate, deadline: data.deadline, executorId: exec ? exec.id : null, reviewerId: rev.id,
      dependsOn: deps, fileRequired: !!data.fileRequired, effortHours: data.effortHours ? Number(data.effortHours) : null,
      expectedResult: (data.expectedResult || '').trim(), executorRole: A_ROLES_OK(data.executorRole) ? data.executorRole : null
    };
    if (stageId) {
      const s = find('stages', stageId); if (!s) fail('Этап не найден');
      const startedOrAccepted = ['in_work', 'review', 'rework', 'accepted'].includes(stageState(s)) && p.status !== 'draft';
      const changed = Object.keys(clean).filter(k => JSON.stringify(s[k]) !== JSON.stringify(clean[k]));
      if (startedOrAccepted && changed.length && !(reason || '').trim()) fail('Этап уже начат или принят — укажите причину изменения', { reason: 'Укажите причину' });
      if (s.deadline !== clean.deadline) audit('stage.deadline', 'stage', s.id, p.id, 'Изменён срок этапа ' + s.seq + (reason ? '. Причина: ' + reason : ''), s.deadline, clean.deadline);
      if (s.executorId !== clean.executorId) {
        audit('stage.assign', 'stage', s.id, p.id, 'Изменён исполнитель этапа ' + s.seq, userName(s.executorId), userName(clean.executorId));
        if (s.executorId) notify(s.executorId, 'reassign', p.name + ': вы сняты с этапа ' + s.seq + ' «' + s.name + '»', '#/project/' + p.id);
        if (clean.executorId) notify(clean.executorId, 'assign', p.name + ': вам назначен этап ' + s.seq + ' «' + clean.name + '»', '#/stage/' + s.id);
        s.assignHistory = (s.assignHistory || []).concat([{ date: nowIso(), by: u.id, from: s.executorId, to: clean.executorId, reason: reason || '' }]);
      }
      Object.assign(s, clean);
      audit('stage.update', 'stage', s.id, p.id, 'Изменён этап ' + s.seq + ' «' + s.name + '»' + (changed.length ? ' (' + changed.join(', ') + ')' : '') + (reason ? '. Причина: ' + reason : ''));
      S.save(); return s;
    }
    const seqNo = (stagesOf(p.id).reduce((m, s) => Math.max(m, s.seq), 0)) + 1;
    const s = Object.assign({ id: S.nextId('stages'), projectId: p.id, seq: seqNo, status: 'new', factEnd: null, approval: null, createdAt: nowIso(), assignHistory: [] }, clean);
    db().stages.push(s);
    audit('stage.create', 'stage', s.id, p.id, 'Добавлен этап ' + s.seq + ' «' + s.name + '»');
    if (s.executorId) notify(s.executorId, 'assign', p.name + ': вам назначен этап ' + s.seq + ' «' + s.name + '»', '#/stage/' + s.id);
    S.save(); return s;
  }
  function assignStage(stageId, executorId, reviewerId, reason) {
    const u = requireUser();
    const s = find('stages', stageId); if (!s) fail('Этап не найден');
    const p = projectOf(s);
    if (!canManageProject(u, p)) fail('Доступ запрещён: назначать исполнителей может ГИП проекта');
    if (s.status === 'accepted') fail('Этап уже принят — переназначение невозможно');
    const ex = userById(executorId), rv = userById(reviewerId);
    const f = {};
    if (!ex || ex.status !== 'active' || !EXECUTOR_ROLES.includes(ex.role)) f.executorId = 'Выберите активного исполнителя';
    if (!rv || rv.status !== 'active') f.reviewerId = 'Выберите проверяющего';
    if (ex && rv && ex.id === rv.id) f.reviewerId = 'Исполнитель не может быть проверяющим своего результата';
    if (Object.keys(f).length) fail('Назначение не сохранено', f);
    const wl = workload(ex.id);
    if (wl.overload && !(reason || '').trim()) fail('Сотрудник перегружен — укажите причину выбора', { reason: 'Укажите причину' });
    const prev = s.executorId;
    s.assignHistory = (s.assignHistory || []).concat([{ date: nowIso(), by: u.id, from: prev, to: ex.id, reason: reason || '' }]);
    s.executorId = ex.id; s.reviewerId = rv.id;
    audit('stage.assign', 'stage', s.id, p.id, 'Назначен исполнитель этапа ' + s.seq + ' «' + s.name + '»' + (reason ? '. Причина выбора: ' + reason : ''), userName(prev), ex.fullName);
    notify(ex.id, 'assign', p.name + ': вам назначен этап ' + s.seq + ' «' + s.name + '»', '#/stage/' + s.id);
    if (prev && prev !== ex.id) notify(prev, 'reassign', p.name + ': этап ' + s.seq + ' передан другому исполнителю', '#/project/' + p.id);
    S.save();
  }
  function changeDeadline(stageId, newDate, reason) {
    const u = requireUser();
    const s = find('stages', stageId); if (!s) fail('Этап не найден');
    const p = projectOf(s);
    if (!canManageProject(u, p)) fail('Доступ запрещён: переносить сроки может ГИП проекта');
    const f = {};
    if (!newDate) f.deadline = 'Укажите новый срок';
    else if (newDate < s.startDate) f.deadline = 'Срок не может быть раньше даты начала этапа (' + s.startDate + ')';
    if (!(reason || '').trim()) f.reason = 'Укажите причину переноса';
    if (Object.keys(f).length) fail('Срок не изменён', f);
    const old = s.deadline; s.deadline = newDate;
    audit('stage.deadline', 'stage', s.id, p.id, 'Перенесён срок этапа ' + s.seq + ' «' + s.name + '». Причина: ' + reason, old, newDate);
    notify(s.executorId, 'deadline', p.name + ': срок этапа ' + s.seq + ' перенесён на ' + newDate, '#/stage/' + s.id);
    S.save();
  }

  /* ---------- Документы и версии ---------- */
  function checkFile(file) {
    if (!file) return 'Выберите файл';
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (FORBIDDEN_EXT.includes(ext)) return 'Файл не загружен: формат .' + ext + ' запрещён (исполняемые и скриптовые файлы). Выберите PDF, DOCX, XLSX, DWG или DXF';
    if (!ALLOWED_EXT.includes(ext)) return 'Файл не загружен: формат .' + ext + ' не поддерживается. Выберите PDF, DOCX, XLSX, DWG или DXF';
    if (file.size > MAX_SIZE) return 'Файл не загружен: размер ' + (file.size / 1048576).toFixed(1) + ' МБ превышает лимит 25 МБ';
    if (file.size === 0) return 'Файл пустой';
    return null;
  }
  function uploadCheck(u, s) {
    if (!u) return 'Войдите в систему';
    if (!s) return 'Этап не найден';
    if (s.executorId !== u.id) return 'Загружать результат может только исполнитель этапа';
    const st = stageState(s);
    if (st === 'draft') return 'Проект ещё не запущен';
    if (st === 'blocked') return 'Этап заблокирован: ' + blockReason(s).toLowerCase();
    if (st === 'review') return 'Версия передана на проверку и зафиксирована — дождитесь решения проверяющего';
    if (st === 'accepted') return 'Этап принят — изменения вносятся только после отмены приёмки ГИПом';
    if (!['in_work', 'approval'].includes(projectOf(s).status)) return 'Проект не в работе';
    return null;
  }
  async function uploadVersion(stageId, opts) {
    const u = requireUser();
    const s = find('stages', stageId);
    const why = uploadCheck(u, s); if (why) fail(why);
    const f = {};
    const ferr = checkFile(opts.file); if (ferr) f.file = ferr;
    let doc = opts.documentId ? find('documents', opts.documentId) : null;
    if (opts.documentId && (!doc || doc.stageId !== s.id)) fail('Документ не относится к этому этапу');
    if (!doc && !(opts.title || '').trim()) f.title = 'Укажите название документа';
    const no = doc ? docVersions(doc.id).length + 1 : 1;
    if (no > 1 && !(opts.comment || '').trim()) f.comment = 'Опишите, что изменено в новой версии';
    if (Object.keys(f).length) fail(f.file || 'Проверьте отмеченные поля', f);
    if (!doc) {
      doc = { id: S.nextId('documents'), projectId: s.projectId, stageId: s.id, kind: 'result', type: opts.type || 'Прочее', title: opts.title.trim(), createdAt: nowIso(), createdBy: u.id };
      db().documents.push(doc);
    }
    const ext = opts.file.name.split('.').pop().toLowerCase();
    const v = {
      id: S.nextId('versions'), documentId: doc.id, stageId: s.id, no, fileName: opts.file.name, size: opts.file.size, ext,
      fileKey: null, demoFile: false, authorId: u.id, date: nowIso(), comment: (opts.comment || '').trim(), status: 'uploaded', submittedAt: null
    };
    v.fileKey = 'v' + v.id + '_' + Date.now();
    await S.Files.put(v.fileKey, opts.file);
    db().versions.push(v);
    if (s.status === 'new') s.status = 'in_work';
    audit('version.upload', 'version', v.id, s.projectId, 'Загружена версия ' + no + ' «' + v.fileName + '» (документ «' + doc.title + '»)');
    S.save(); return v;
  }
  async function uploadSourceDoc(projectId, opts) {
    const u = requireUser();
    const p = find('projects', projectId); if (!p) fail('Проект не найден');
    if (!canManageProject(u, p)) fail('Доступ запрещён: исходные документы загружает ГИП проекта');
    const f = {};
    const ferr = checkFile(opts.file); if (ferr) f.file = ferr;
    let doc = opts.documentId ? find('documents', opts.documentId) : null;
    if (!doc && !(opts.title || '').trim()) f.title = 'Укажите название документа';
    const no = doc ? docVersions(doc.id).length + 1 : 1;
    if (no > 1 && !(opts.comment || '').trim()) f.comment = 'Опишите, что изменено';
    if (Object.keys(f).length) fail(f.file || 'Проверьте отмеченные поля', f);
    if (!doc) {
      doc = { id: S.nextId('documents'), projectId: p.id, stageId: null, kind: 'source', type: opts.type || 'Задание', title: opts.title.trim(), createdAt: nowIso(), createdBy: u.id };
      db().documents.push(doc);
    }
    const v = { id: S.nextId('versions'), documentId: doc.id, stageId: null, no, fileName: opts.file.name, size: opts.file.size, ext: opts.file.name.split('.').pop().toLowerCase(), fileKey: null, demoFile: false, authorId: u.id, date: nowIso(), comment: (opts.comment || '').trim(), status: 'uploaded', submittedAt: null };
    v.fileKey = 'v' + v.id + '_' + Date.now();
    await S.Files.put(v.fileKey, opts.file);
    db().versions.push(v);
    audit('version.upload', 'version', v.id, p.id, 'Загружен исходный документ «' + doc.title + '», версия ' + no);
    S.save(); return v;
  }
  function submitCheck(u, s) {
    const up = uploadCheck(u, s); if (up) return up;
    const fresh = stageVersions(s.id).filter(v => v.status === 'uploaded');
    if (s.fileRequired && !fresh.length) {
      return stageState(s) === 'rework' ? 'Загрузите новую версию с исправлениями — без неё передача на проверку недоступна' : 'Загрузите результат — для этого этапа файл обязателен';
    }
    if (!s.reviewerId) return 'Проверяющий не назначен — обратитесь к ГИПу';
    return null;
  }
  function submitStage(stageId, comment) {
    const u = requireUser();
    const s = find('stages', stageId);
    const why = submitCheck(u, s); if (why) fail(why);
    const p = projectOf(s);
    const fresh = stageVersions(s.id).filter(v => v.status === 'uploaded');
    fresh.forEach(v => { v.status = 'submitted'; v.submittedAt = nowIso(); });
    s.status = 'review'; s.submittedAt = nowIso(); s.submitComment = (comment || '').trim();
    db().remarks.filter(r => r.stageId === s.id && ['open', 'rework'].includes(r.status)).forEach(r => {
      r.status = 'fixed';
      r.history.push({ date: nowIso(), userId: u.id, status: 'fixed', comment: 'Передана новая версия на проверку' });
    });
    const vtxt = fresh.length ? 'версия ' + fresh.map(v => v.no).join(', ') : 'результат без файла';
    audit('version.submit', 'stage', s.id, p.id, 'Этап ' + s.seq + ' «' + s.name + '» передан на проверку (' + vtxt + ')');
    notify(s.reviewerId, 'review', p.name + ': этап ' + s.seq + ' «' + s.name + '», ' + vtxt + ' — на проверке', '#/stage/' + s.id);
    S.save();
  }
  function reviewCheck(u, s) {
    if (!u || !s) return 'Этап не найден';
    if (s.executorId === u.id) return 'Исполнитель не может принять собственный результат';
    if (s.reviewerId !== u.id) return 'Решение принимает только назначенный проверяющий этапа';
    if (stageState(s) === 'blocked') return 'Этап заблокирован зависимостью: ' + blockReason(s).toLowerCase();
    if (s.status !== 'review') return 'Результат не передан на проверку';
    return null;
  }
  function addToAiCandidates(r) {
    if (db().aiArchive.some(a => a.sourceRemarkId === r.id)) return;
    const s = find('stages', r.stageId), p = find('projects', r.projectId), d = find('documents', r.documentId);
    r.aiStatus = 'candidate';
    db().aiArchive.push({
      id: S.nextId('aiArchive'), title: r.text.slice(0, 70), text: r.text, category: r.category, stageType: s ? s.stageType : '', docType: d ? d.type : '',
      fix: '', sourceRemarkId: r.id, sourceProjectId: r.projectId, sourceLabel: (p ? p.number : '') + ' · этап «' + (s ? s.name : '') + '»',
      status: 'pending', checkedBy: null, checkedAt: null, createdAt: nowIso(), indexedAt: null, isTest: !!db().meta.demo
    });
  }
  function acceptStage(stageId, comment) {
    const u = requireUser();
    const s = find('stages', stageId);
    const why = reviewCheck(u, s); if (why) fail(why);
    const p = projectOf(s);
    const notFixed = db().remarks.filter(r => r.stageId === s.id && r.status === 'rework');
    if (notFixed.length) fail('Есть замечания с отметкой «Не исправлено» (' + notFixed.map(r => r.number).join(', ') + ') — верните результат на доработку');
    const subm = stageVersions(s.id).filter(v => v.status === 'submitted');
    subm.forEach(v => {
      v.status = 'accepted';
      db().reviews.push({ id: S.nextId('reviews'), versionId: v.id, stageId: s.id, reviewerId: u.id, decision: 'accepted', date: nowIso(), comment: (comment || '').trim() });
    });
    if (!subm.length) db().reviews.push({ id: S.nextId('reviews'), versionId: null, stageId: s.id, reviewerId: u.id, decision: 'accepted', date: nowIso(), comment: (comment || '').trim() });
    db().remarks.filter(r => r.stageId === s.id && r.status === 'fixed').forEach(r => {
      r.status = 'accepted'; r.resolvedAt = nowIso();
      r.history.push({ date: nowIso(), userId: u.id, status: 'accepted', comment: 'Исправление принято при приёмке результата' });
      addToAiCandidates(r);
    });
    s.status = 'accepted'; s.factEnd = today();
    audit('review.accept', 'stage', s.id, p.id, 'Принят результат этапа ' + s.seq + ' «' + s.name + '»' + (subm.length ? ', версия ' + subm.map(v => v.no).join(', ') : '') + (comment ? '. Комментарий: ' + comment : ''));
    notify(s.executorId, 'accepted', p.name + ': результат этапа ' + s.seq + ' «' + s.name + '» принят', '#/stage/' + s.id);
    notify(p.gipId, 'accepted', p.name + ': этап ' + s.seq + ' принят', '#/project/' + p.id);
    db().stages.filter(d => (d.dependsOn || []).includes(s.id)).forEach(d => {
      if (stageState(d) === 'in_work' && d.executorId) { if (d.status === 'new') d.status = 'in_work'; notify(d.executorId, 'unblocked', p.name + ': этап ' + d.seq + ' «' + d.name + '» разблокирован и доступен для работы', '#/stage/' + d.id); }
    });
    S.save();
  }
  function validateRemark(r) {
    const f = {};
    if (!r.text || r.text.trim().length < 5) f.text = 'Опишите проблему (не менее 5 символов)';
    if (!r.section || !r.section.trim()) f.section = 'Укажите раздел или лист';
    if (!SEVERITY[r.severity]) f.severity = 'Выберите критичность';
    if (!r.versionId) f.versionId = 'Выберите документ и версию';
    if (!r.category) f.category = 'Выберите категорию';
    return f;
  }
  function nextRemarkNumber() { db().meta.remarkNo = (db().meta.remarkNo || 0) + 1; return 'Р-' + String(db().meta.remarkNo).padStart(3, '0'); }
  function createRemarkRecord(u, s, data) {
    const v = find('versions', data.versionId);
    const r = {
      id: S.nextId('remarks'), number: nextRemarkNumber(), projectId: s.projectId, stageId: s.id, documentId: v ? v.documentId : null, versionId: v ? v.id : null,
      section: data.section.trim(), text: data.text.trim(), category: data.category, severity: data.severity, authorId: u.id, executorId: data.executorId || s.executorId,
      deadline: data.deadline || null, status: 'open', createdAt: nowIso(), history: [{ date: nowIso(), userId: u.id, status: 'open', comment: data.fromAi ? 'Замечание создано (текст основан на подсказке ИИ и проверен специалистом)' : 'Замечание создано' }],
      comments: [], aiStatus: null, isTest: !!db().meta.demo
    };
    db().remarks.push(r);
    return r;
  }
  function returnStage(stageId, newRemark, comment) {
    const u = requireUser();
    const s = find('stages', stageId);
    const why = reviewCheck(u, s); if (why) fail(why);
    const p = projectOf(s);
    const undecided = db().remarks.filter(r => r.stageId === s.id && r.status === 'fixed');
    if (undecided.length) fail('Сначала отметьте по каждому прежнему замечанию «Принять исправление» или «Не исправлено»: ' + undecided.map(r => r.number).join(', '));
    const notFixed = db().remarks.filter(r => r.stageId === s.id && r.status === 'rework');
    const hasNew = newRemark && (newRemark.text || '').trim();
    if (!hasNew && !notFixed.length) fail('При возврате обязательно замечание: заполните текст, раздел, критичность и версию', { text: 'Опишите проблему' });
    let created = null;
    if (hasNew) {
      const f = validateRemark(newRemark);
      if (Object.keys(f).length) fail('Замечание не заполнено: исправьте отмеченные поля', f);
      const v = find('versions', newRemark.versionId);
      if (!v || v.stageId !== s.id) fail('Выбранная версия не относится к этапу');
      created = createRemarkRecord(u, s, newRemark);
    }
    const subm = stageVersions(s.id).filter(v => v.status === 'submitted');
    subm.forEach(v => {
      v.status = 'returned';
      db().reviews.push({ id: S.nextId('reviews'), versionId: v.id, stageId: s.id, reviewerId: u.id, decision: 'returned', date: nowIso(), comment: (comment || '').trim() });
    });
    s.status = 'rework';
    const nums = (created ? [created.number] : []).concat(notFixed.map(r => r.number));
    audit('review.return', 'stage', s.id, p.id, 'Этап ' + s.seq + ' «' + s.name + '» возвращён на доработку, замечания: ' + nums.join(', '));
    if (created) audit('remark.create', 'remark', created.id, p.id, 'Создано замечание ' + created.number + ' к версии ' + (find('versions', created.versionId) || {}).no);
    notify(s.executorId, 'returned', p.name + ': этап ' + s.seq + ' «' + s.name + '» возвращён на доработку (' + nums.join(', ') + ')', '#/stage/' + s.id);
    notify(p.gipId, 'returned', p.name + ': этап ' + s.seq + ' возвращён на доработку', '#/project/' + p.id);
    S.save(); return created;
  }
  function remarkDecision(remarkId, decision, comment) {
    const u = requireUser();
    const r = find('remarks', remarkId); if (!r) fail('Замечание не найдено');
    const s = find('stages', r.stageId);
    if (!s || s.reviewerId !== u.id) fail('Решение по исправлению принимает проверяющий этапа');
    if (s.executorId === u.id) fail('Исполнитель не может принять собственное исправление');
    if (r.status !== 'fixed') fail('Замечание не ожидает повторной проверки');
    if (s.status !== 'review') fail('Новая версия ещё не передана на проверку');
    if (decision === 'accept') {
      r.status = 'accepted'; r.resolvedAt = nowIso();
      r.history.push({ date: nowIso(), userId: u.id, status: 'accepted', comment: comment || 'Исправление принято' });
      addToAiCandidates(r);
      audit('remark.status', 'remark', r.id, r.projectId, 'Замечание ' + r.number + ': исправление принято', 'Исправлено, ожидает проверки', 'Принято');
    } else {
      r.status = 'rework';
      r.history.push({ date: nowIso(), userId: u.id, status: 'rework', comment: comment || 'Не исправлено' });
      audit('remark.status', 'remark', r.id, r.projectId, 'Замечание ' + r.number + ': не исправлено', 'Исправлено, ожидает проверки', 'На доработке');
    }
    S.save();
  }
  function markRemarkIrrelevant(remarkId, reason) {
    const u = requireUser();
    const r = find('remarks', remarkId); if (!r) fail('Замечание не найдено');
    const p = find('projects', r.projectId);
    if (!(u.role === 'director' || canManageProject(u, p) || r.authorId === u.id)) fail('Отметить замечание неактуальным может ГИП проекта, директор или автор замечания');
    if (['accepted', 'irrelevant'].includes(r.status)) fail('Замечание уже закрыто');
    if (!(reason || '').trim()) fail('Укажите объяснение', { reason: 'Объяснение обязательно' });
    const old = r.status; r.status = 'irrelevant'; r.resolvedAt = nowIso();
    r.history.push({ date: nowIso(), userId: u.id, status: 'irrelevant', comment: reason });
    audit('remark.status', 'remark', r.id, r.projectId, 'Замечание ' + r.number + ' отмечено неактуальным. Причина: ' + reason, REMARK_STATUS[old][0], 'Неактуально');
    notify(r.executorId, 'info', 'Замечание ' + r.number + ' отмечено неактуальным', '#/remark/' + r.id);
    S.save();
  }
  function commentRemark(remarkId, text) {
    const u = requireUser();
    const r = find('remarks', remarkId);
    if (!canViewRemark(u, r)) fail('Доступ запрещён');
    if (!(text || '').trim()) fail('Введите текст сообщения', { text: 'Пустое сообщение' });
    r.comments.push({ date: nowIso(), userId: u.id, text: text.trim() });
    const to = u.id === r.executorId ? r.authorId : r.executorId;
    notify(to, 'info', 'Новое сообщение по замечанию ' + r.number, '#/remark/' + r.id);
    S.save();
  }
  function registerExternalRemark(stageId, data) {
    const u = requireUser();
    const s = find('stages', stageId); if (!s) fail('Этап не найден');
    const p = projectOf(s);
    if (!(u.role === 'manager' && s.executorId === u.id) && !canManageProject(u, p)) fail('Внешние замечания регистрирует менеджер по согласованию этапа или ГИП');
    const f = validateRemark(Object.assign({ category: 'Внешнее замечание (надзорный орган)' }, data));
    if (!data.executorId) f.executorId = 'Выберите ответственного исполнителя';
    if (Object.keys(f).length) fail('Замечание не сохранено', f);
    const v = find('versions', data.versionId);
    if (!v || v.stageId == null || find('stages', v.stageId).projectId !== p.id) fail('Версия должна относиться к документу этого проекта');
    const target = find('stages', v.stageId);
    const r = createRemarkRecord(u, target, Object.assign({}, data, { category: 'Внешнее замечание (надзорный орган)' }));
    r.external = true;
    audit('remark.create', 'remark', r.id, p.id, 'Зарегистрировано внешнее замечание ' + r.number);
    notify(r.executorId, 'returned', p.name + ': внешнее замечание ' + r.number, '#/remark/' + r.id);
    notify(p.gipId, 'info', p.name + ': зарегистрировано внешнее замечание ' + r.number, '#/remark/' + r.id);
    S.save(); return r;
  }
  function setApproval(stageId, data) {
    const u = requireUser();
    const s = find('stages', stageId); if (!s) fail('Этап не найден');
    if (s.executorId !== u.id) fail('Статус согласования указывает исполнитель этапа');
    if (!data.status) fail('Выберите статус согласования', { status: 'Выберите статус' });
    if (!data.date) fail('Укажите дату', { date: 'Укажите дату' });
    const old = s.approval ? s.approval.status : '—';
    s.approval = { status: data.status, date: data.date, note: (data.note || '').trim(), by: u.id };
    if (s.status === 'new') s.status = 'in_work';
    audit('stage.approval', 'stage', s.id, s.projectId, 'Статус внешнего согласования этапа ' + s.seq + (data.note ? ': ' + data.note : ''), old, data.status);
    S.save();
  }
  function cancelAcceptance(stageId, reason) {
    const u = requireUser();
    const s = find('stages', stageId); if (!s) fail('Этап не найден');
    const p = projectOf(s);
    if (!canManageProject(u, p)) fail('Отменить приёмку может только ГИП проекта');
    if (s.status !== 'accepted') fail('Этап не принят');
    if (!(reason || '').trim()) fail('Укажите причину отмены приёмки', { reason: 'Причина обязательна' });
    s.status = 'rework'; s.factEnd = null;
    db().reviews.push({ id: S.nextId('reviews'), versionId: null, stageId: s.id, reviewerId: u.id, decision: 'cancelled', date: nowIso(), comment: reason });
    audit('review.cancel', 'stage', s.id, p.id, 'Отменена приёмка этапа ' + s.seq + ' «' + s.name + '». Причина: ' + reason, 'Принят', 'На доработке');
    notify(s.executorId, 'returned', p.name + ': приёмка этапа ' + s.seq + ' отменена ГИПом — ' + reason, '#/stage/' + s.id);
    const blocked = db().stages.filter(d => (d.dependsOn || []).includes(s.id));
    blocked.forEach(d => notify(d.executorId, 'info', p.name + ': этап ' + d.seq + ' заблокирован — отменена приёмка этапа ' + s.seq, '#/stage/' + d.id));
    S.save(); return blocked.length;
  }

  /* ---------- Уведомления ---------- */
  function myNotifications() { const u = requireUser(); return db().notifications.filter(n => n.userId === u.id).sort((a, b) => b.date.localeCompare(a.date)); }
  function markRead(id) { const u = requireUser(); const n = find('notifications', id); if (n && n.userId === u.id && !n.readAt) { n.readAt = nowIso(); S.save(); } }
  function markAllRead() { const u = requireUser(); db().notifications.filter(n => n.userId === u.id && !n.readAt).forEach(n => { n.readAt = nowIso(); }); S.save(); }
  /** Автоматические уведомления о приближении срока и просрочке (раз в день на этап). */
  function generateDeadlineNotifications() {
    const t = today();
    db().stages.forEach(s => {
      const p = projectOf(s);
      if (!s.executorId || s.status === 'accepted' || !p || p.status !== 'in_work' || stageState(s) === 'blocked') return;
      const d = daysTo(s.deadline);
      const key = 'dl_' + t;
      if (s._notified === key) return;
      if (d < 0) { notify(s.executorId, 'overdue', p.name + ': срок этапа ' + s.seq + ' «' + s.name + '» просрочен на ' + (-d) + ' дн.', '#/stage/' + s.id); s._notified = key; }
      else if (d <= 2) { notify(s.executorId, 'deadline', p.name + ': до срока этапа ' + s.seq + ' «' + s.name + '» осталось ' + d + ' дн.', '#/stage/' + s.id); s._notified = key; }
    });
    S.save();
  }

  /* ---------- Файлы: скачивание через проверку прав ---------- */
  function demoPdf(title) {
    const tr = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
    const t = String(title).split('').map(ch => { const l = ch.toLowerCase(); if (tr[l] == null) return ch; const r = tr[l]; return ch !== l ? r.charAt(0).toUpperCase() + r.slice(1) : r; }).join('').replace(/[^\x20-\x7E]/g, '_').replace(/[()\\]/g, '');
    const body = 'BT /F1 18 Tf 60 760 Td (PozhExpert+ demo file) Tj 0 -30 Td /F1 12 Tf (' + t + ') Tj 0 -24 Td (Demonstration data of the training prototype. Real file was not uploaded.) Tj ET';
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const x = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
    return new Blob([out], { type: 'application/pdf' });
  }
  async function getVersionFile(versionId) {
    const u = requireUser();
    const v = find('versions', versionId); if (!v) fail('Версия не найдена');
    const d = find('documents', v.documentId);
    if (!canViewDocument(u, d)) fail('Доступ запрещён: у вас нет прав на этот документ');
    audit('file.download', 'version', v.id, d.projectId, 'Открыт/скачан файл «' + v.fileName + '»');
    S.save();
    if (v.fileKey) {
      const blob = await S.Files.get(v.fileKey);
      if (blob) return { blob, name: v.fileName };
      fail('Файл не найден в хранилище браузера (возможно, данные браузера были очищены)');
    }
    if (v.ext === 'pdf') return { blob: demoPdf(v.fileName + ' / version ' + v.no), name: v.fileName, demo: true };
    const txt = 'ПожЭксперт+ — демонстрационный файл учебного прототипа.\r\nДокумент: ' + d.title + '\r\nФайл: ' + v.fileName + ', версия ' + v.no + '\r\nРеальный файл не загружался (демо-данные).';
    return { blob: new Blob(['﻿' + txt], { type: 'text/plain;charset=utf-8' }), name: v.fileName + '.demo.txt', demo: true };
  }

  /* ---------- ИИ-помощник ---------- */
  function aiAllowedRecords(u) {
    // Права проверяются ДО поиска: записи из недоступных проектов в выдачу не попадают
    return db().aiArchive.filter(a => a.status === 'included' && (!a.sourceProjectId || canViewProject(u, find('projects', a.sourceProjectId))));
  }
  function aiSearch(query, ctx) {
    const u = requireUser();
    if (!(query || '').trim()) fail('Опишите замечание или вставьте текст для поиска', { query: 'Введите текст' });
    const recs = aiAllowedRecords(u);
    const res = window.PozhAI.search(query, recs, { threshold: db().meta.aiThreshold, limit: 5, stageType: ctx && ctx.stageType, docType: ctx && ctx.docType });
    audit('ai.search', 'ai', null, null, 'Поиск похожих замечаний (' + res.results.length + ' результатов)');
    S.save();
    return res;
  }
  function aiFeedback(recId, useful, reason, query) {
    const u = requireUser();
    db().aiFeedback.push({ id: S.nextId('aiFeedback'), recId, userId: u.id, useful: !!useful, reason: reason || '', query: query || '', date: nowIso() });
    S.save();
  }
  function aiSetStatus(id, status, data) {
    const u = requireUser();
    if (!canManageAiArchive(u)) fail('Доступ запрещён: архивом ИИ управляет директор или эксперт');
    const a = find('aiArchive', id); if (!a) fail('Запись не найдена');
    if (status === 'included') {
      if (data) { a.title = (data.title || a.title).trim(); a.fix = (data.fix || '').trim(); a.category = data.category || a.category; a.text = (data.text || a.text).trim(); }
      if (!a.text || !a.category) fail('Для включения обязательны текст и категория');
      a.checkedBy = u.id; a.checkedAt = nowIso(); a.indexedAt = nowIso();
    }
    const old = a.status; a.status = status;
    const r = a.sourceRemarkId ? find('remarks', a.sourceRemarkId) : null;
    if (r) r.aiStatus = status === 'included' ? 'included' : status === 'pending' ? 'candidate' : 'not_included';
    audit('ai.archive', 'aiArchive', a.id, a.sourceProjectId, 'Архив ИИ: «' + a.title + '»', AI_STATUS[old][0], AI_STATUS[status][0]);
    S.save();
  }
  function aiAddExample(data) {
    const u = requireUser();
    if (!canManageAiArchive(u)) fail('Доступ запрещён');
    const f = {};
    if (!(data.text || '').trim()) f.text = 'Текст примера обязателен';
    if (!data.category) f.category = 'Категория обязательна';
    if (!(data.title || '').trim()) f.title = 'Укажите краткое название';
    if (Object.keys(f).length) fail('Пример не добавлен', f);
    const a = {
      id: S.nextId('aiArchive'), title: data.title.trim(), text: data.text.trim(), category: data.category, stageType: data.stageType || '', docType: data.docType || '',
      fix: (data.fix || '').trim(), sourceRemarkId: null, sourceProjectId: null, sourceLabel: 'Обезличенный пример (добавлен вручную)',
      status: 'pending', checkedBy: null, checkedAt: null, createdAt: nowIso(), indexedAt: null, isTest: !!db().meta.demo
    };
    db().aiArchive.push(a);
    audit('ai.archive', 'aiArchive', a.id, null, 'Добавлен пример в архив ИИ: «' + a.title + '» (ожидает проверки)');
    S.save(); return a;
  }
  function setAiThreshold(v) {
    const u = requireUser();
    if (u.role !== 'director') fail('Порог релевантности настраивает директор');
    const n = Number(v);
    if (isNaN(n) || n < 0.05 || n > 0.9) fail('Порог — число от 0.05 до 0.9');
    const old = db().meta.aiThreshold; db().meta.aiThreshold = n;
    audit('ai.threshold', 'ai', null, null, 'Изменён порог релевантности ИИ', old, n);
    S.save();
  }

  /* ---------- Глобальный поиск ---------- */
  function globalSearch(q) {
    const u = requireUser();
    const n = String(q || '').trim().toLowerCase();
    if (!n) return { projects: [], documents: [], remarks: [] };
    const has = (s) => String(s || '').toLowerCase().includes(n);
    return {
      projects: visibleProjects(u).filter(p => has(p.name) || has(p.number) || has((find('clients', p.clientId) || {}).name)),
      documents: visibleDocuments(u).filter(d => has(d.title) || docVersions(d.id).some(v => has(v.fileName))),
      remarks: visibleRemarks(u).filter(r => has(r.number) || has(r.text))
    };
  }

  window.PozhApi = {
    ApiError, ROLES, ROLES_FULL, EXECUTOR_ROLES, PROJECT_STATUS, STAGE_STATE, VERSION_STATUS, REMARK_STATUS, SEVERITY, USER_STATUS, AI_STATUS,
    REMARK_CATEGORIES, STAGE_TYPES, DOC_TYPES, ALLOWED_EXT, MAX_SIZE, NOTE_TYPES,
    today, daysTo, find, userById, userName, projectOf, stagesOf, stageVersions, docVersions,
    me, login, logout, changePassword,
    canManageUsers, canManageClients, canCreateProject, canManageProject, canManageAiArchive, canViewProject, canViewStage, canViewDocument, canViewRemark, isDirector,
    visibleProjects, visibleStages, visibleDocuments, visibleRemarks,
    stageState, blockReason, unmetDeps, isStageOverdue, projectProgress, projectCounters, nearestStageDeadline, isProjectOverdue, workload,
    createUser, updateUser, changeRole, resetAccess, setUserStatus,
    saveClient, setClientStatus, deleteClient, findClientDuplicate,
    createProject, updateProject, projectEditImpact, startProject, setProjectStatus,
    saveStage, assignStage, changeDeadline, wouldCycle,
    checkFile, uploadCheck, uploadVersion, uploadSourceDoc, submitCheck, submitStage, reviewCheck, acceptStage, returnStage,
    remarkDecision, markRemarkIrrelevant, commentRemark, registerExternalRemark, setApproval, cancelAcceptance,
    myNotifications, markRead, markAllRead, generateDeadlineNotifications, getVersionFile,
    aiSearch, aiFeedback, aiSetStatus, aiAddExample, setAiThreshold, aiAllowedRecords, globalSearch
  };
})();

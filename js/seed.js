/*
 * Демонстрационные данные (п. 8.3 ТЗ). Все записи помечены isTest: true.
 * Это вымышленные данные учебного прототипа, а НЕ сведения ООО «ПожЭксперт+».
 * Даты строятся относительно текущего дня, чтобы сроки и просрочки всегда выглядели правдоподобно.
 * Пароль всех демо-учётных записей описан в README (заменить перед реальным использованием).
 */
(function () {
  'use strict';
  const DEMO_PASSWORD = 'demo2026';

  function day(offset) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function at(offset, hm) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    const [h, m] = (hm || '10:00').split(':').map(Number); d.setHours(h, m, 0, 0);
    return d.toISOString();
  }

  function build() {
    const S = window.PozhStore;
    const db = {
      meta: { version: 1, createdAt: new Date().toISOString(), seq: {}, aiThreshold: 0.12, remarkNo: 40, demo: true },
      users: [], clients: [], projects: [], stages: [], documents: [], versions: [], reviews: [],
      remarks: [], notifications: [], audit: [], aiArchive: [], aiFeedback: [], loginAttempts: {}
    };
    const seq = (t) => { db.meta.seq[t] = (db.meta.seq[t] || 0) + 1; return db.meta.seq[t]; };

    /* ---------- Сотрудники ---------- */
    const U = {};
    function user(key, fullName, email, role, department, status, lastLogin, extra) {
      const salt = S.newSalt();
      const u = Object.assign({
        id: seq('users'), fullName, email, role, department, phone: '', status,
        salt, passwordHash: S.hashPassword(DEMO_PASSWORD, salt), mustChangePassword: false,
        canManageUsers: false, canManageClients: false, canManageProjects: false,
        lastLogin, createdAt: at(-200), isTest: true
      }, extra || {});
      db.users.push(u); U[key] = u.id; return u;
    }
    user('smirnova', 'Смирнова Е. В.', 'smirnova@pozhexpert.example', 'director', 'Руководство', 'active', at(0, '08:55'), { canManageUsers: true, canManageClients: true });
    user('sokolov', 'Соколов О. В.', 'sokolov@pozhexpert.example', 'gip', 'Проектный отдел', 'active', at(0, '09:02'));
    user('lebedeva', 'Лебедева И. А.', 'lebedeva@pozhexpert.example', 'gip', 'Проектный отдел', 'active', at(-1, '18:10'), { canManageClients: true });
    user('petrov', 'Петров А. С.', 'petrov@pozhexpert.example', 'designer', 'Проектный отдел', 'active', at(0, '08:40'));
    user('orlov', 'Орлов Д. И.', 'orlov@pozhexpert.example', 'designer', 'Проектный отдел', 'active', at(0, '09:08'));
    user('frolov', 'Фролов Н. П.', 'frolov@pozhexpert.example', 'designer', 'Проектный отдел', 'active', at(-1, '17:30'));
    user('kozlova', 'Козлова М. Н.', 'kozlova@pozhexpert.example', 'calculator', 'Расчётный отдел', 'active', at(0, '09:12'));
    user('gromov', 'Громов В. К.', 'gromov@pozhexpert.example', 'expert', 'Экспертная группа', 'active', at(0, '08:50'));
    user('ershova', 'Ершова К. С.', 'ershova@pozhexpert.example', 'expert', 'Экспертная группа', 'active', at(-2, '15:20'));
    user('belova', 'Белова Т. Р.', 'belova@pozhexpert.example', 'estimator', 'Сметный отдел', 'active', at(-1, '16:20'));
    user('mikhailova', 'Михайлова С. Е.', 'mikhailova@pozhexpert.example', 'manager', 'Отдел согласований', 'active', at(-1, '11:05'));
    user('yakovleva', 'Яковлева А. Д.', 'yakovleva@pozhexpert.example', 'manager', 'Отдел согласований', 'blocked', at(-15, '11:30'));
    user('nikolaev', 'Николаев П. Р.', 'nikolaev@pozhexpert.example', 'designer', 'Проектный отдел', 'deactivated', at(-67, '17:45'));

    /* ---------- Клиенты ---------- */
    const C = {};
    function client(key, name, type, contactPerson, phone, email, address, status, extra) {
      const c = Object.assign({
        id: seq('clients'), name, type, contactPerson, phone, email, address, note: '', inn: '',
        source: 'Заявка заказчика (демо)', status, createdAt: at(-180), updatedAt: at(-30), updatedBy: U.smirnova, isTest: true
      }, extra || {});
      db.clients.push(c); C[key] = c.id; return c;
    }
    client('sever', 'ООО «Север-Логистика»', 'Юридическое лицо', 'Морозов К. А.', '+7 900 000-00-11', 'office@sever-logistika.example', 'Владимирская обл., г. Александров, ул. Промышленная, 5', 'active');
    client('school', 'МБОУ «Школа № 3» (демо)', 'Юридическое лицо', 'Алексеева Н. В.', '+7 900 000-00-22', 'school3@edu.example', 'г. Александров, ул. Школьная, 12', 'active');
    client('gallery', 'ООО «Галерея-Ритейл»', 'Юридическое лицо', 'Тимофеев Р. С.', '+7 900 000-00-33', 'info@galereya.example', 'г. Александров, пр. Ленина, 40', 'active');
    client('techno', 'ООО «ТехноПарк-А»', 'Юридическое лицо', 'Савельева О. Г.', '+7 900 000-00-44', 'tp@technopark.example', 'г. Струнино, ул. Заводская, 1', 'active');
    client('teplo', 'АО «Теплосеть-Регион»', 'Юридическое лицо', 'Гусев П. Д.', '+7 900 000-00-55', 'teplo@teploset.example', 'г. Карабаново, ул. Котельная, 3', 'active');
    client('kuznecov', 'ИП Кузнецов А. В.', 'Индивидуальный предприниматель', 'Кузнецов А. В.', '+7 900 000-00-66', '', 'г. Александров', 'archived', { note: 'Сотрудничество завершено в 2025 г.' });

    /* ---------- Проекты ---------- */
    const P = {};
    function project(key, number, name, clientKey, gipKey, status, start, end, extra) {
      const p = Object.assign({
        id: seq('projects'), number, name, clientId: C[clientKey], gipId: U[gipKey], status,
        description: '', objectAddress: '', startDate: day(start), endDate: day(end), createdAt: at(start - 3), createdBy: U[gipKey], isTest: true
      }, extra || {});
      db.projects.push(p); P[key] = p.id; return p;
    }
    project('sever', 'ПБ-2026-011', 'Склад «Север»', 'sever', 'sokolov', 'in_work', -80, 27, {
      description: 'Проектирование АПС, СОУЭ и водяного пожаротушения для складского комплекса класса В.',
      objectAddress: 'г. Александров, ул. Промышленная, 5'
    });
    project('school', 'ПБ-2026-014', 'Школа № 3 — АПС и СОУЭ', 'school', 'lebedeva', 'in_work', -30, 40, {
      description: 'Модернизация автоматической пожарной сигнализации и системы оповещения в здании школы.',
      objectAddress: 'г. Александров, ул. Школьная, 12'
    });
    project('gallery', 'ПБ-2026-017', 'ТЦ «Галерея» — пожарная безопасность', 'gallery', 'sokolov', 'draft', 7, 120, {
      description: 'Комплекс систем противопожарной защиты торгового центра. Черновик: этапы формируются.',
      objectAddress: 'г. Александров, пр. Ленина, 40'
    });
    project('techno', 'ПБ-2025-006', 'Офис «ТехноПарк»', 'techno', 'lebedeva', 'done', -260, -150, {
      description: 'АПС и СОУЭ для офисного здания.', objectAddress: 'г. Струнино, ул. Заводская, 1'
    });
    project('teplo', 'ПБ-2026-009', 'Котельная № 2', 'teplo', 'sokolov', 'in_work', -60, -3, {
      description: 'Категорирование помещений и АПС котельной.', objectAddress: 'г. Карабаново, ул. Котельная, 3'
    });

    /* ---------- Этапы ---------- */
    const ST = {};
    function stage(key, projectKey, seqNo, name, stageType, execKey, reviewerKey, start, deadline, status, deps, extra) {
      const s = Object.assign({
        id: seq('stages'), projectId: P[projectKey], seq: seqNo, name, stageType, description: '',
        executorId: execKey ? U[execKey] : null, reviewerId: reviewerKey ? U[reviewerKey] : null,
        startDate: day(start), deadline: day(deadline), factEnd: null, status,
        dependsOn: (deps || []).map(k => ST[k]), fileRequired: true, effortHours: null,
        expectedResult: '', approval: null, createdAt: at(start - 2)
      }, extra || {});
      db.stages.push(s); ST[key] = s.id; return s;
    }
    // Склад «Север» — 9 этапов, как на макете
    stage('s1', 'sever', 1, 'Расчёт категорий помещений', 'Расчёт', 'kozlova', 'gromov', -78, -54, 'accepted', [], { factEnd: day(-55), effortHours: 16, expectedResult: 'Расчёт категорий по взрывопожарной и пожарной опасности (PDF)' });
    stage('s2', 'sever', 2, 'Расчёт эвакуации', 'Расчёт', 'kozlova', 'gromov', -53, -39, 'accepted', ['s1'], { factEnd: day(-40), effortHours: 24, expectedResult: 'Расчёт времени эвакуации' });
    stage('s3', 'sever', 3, 'Схема АПС', 'Схема', 'petrov', 'gromov', -53, -29, 'accepted', ['s1'], { factEnd: day(-30), effortHours: 32, expectedResult: 'Структурная схема АПС, планы размещения извещателей' });
    stage('s4', 'sever', 4, 'Схема СОУЭ', 'Схема', 'orlov', 'gromov', -38, -21, 'accepted', ['s2'], { factEnd: day(-22), effortHours: 24 });
    stage('s5', 'sever', 5, 'Планы расположения оборудования', 'План', 'petrov', 'gromov', -20, -15, 'accepted', ['s3', 's4'], { factEnd: day(-15), effortHours: 16 });
    stage('s6', 'sever', 6, 'Схема водяного пожаротушения', 'Схема', 'orlov', 'gromov', -20, 0, 'review', ['s2'], { effortHours: 40, expectedResult: 'Аксонометрическая схема водяного пожаротушения' });
    stage('s7', 'sever', 7, 'Узлы управления и спецификации', 'Спецификация', 'petrov', 'gromov', -14, -5, 'rework', ['s5'], { effortHours: 40, expectedResult: 'Спецификация оборудования, изделий и материалов' });
    stage('s8', 'sever', 8, 'Сметная документация', 'Смета', 'belova', 'gromov', 1, 12, 'new', ['s6', 's7'], { effortHours: 24 });
    stage('s9', 'sever', 9, 'Пояснительная записка и итоговый комплект', 'Пояснительная записка', null, 'gromov', 5, 22, 'new', ['s6', 's7'], { effortHours: 24, executorRole: 'designer' });
    // Школа № 3
    stage('a1', 'school', 1, 'Обследование объекта', 'Обследование', 'frolov', 'ershova', -28, -18, 'accepted', [], { factEnd: day(-19), effortHours: 16 });
    stage('a2', 'school', 2, 'Расчёт пожарного риска', 'Расчёт', 'kozlova', 'gromov', -17, 3, 'in_work', ['a1'], { effortHours: 32 });
    stage('a3', 'school', 3, 'Схема АПС и СОУЭ', 'Схема', 'frolov', 'ershova', -17, -2, 'in_work', ['a1'], { effortHours: 40 });
    stage('a4', 'school', 4, 'Согласование с надзорным органом', 'Согласование', 'mikhailova', 'lebedeva', 4, 30, 'new', ['a2', 'a3'], { fileRequired: false, effortHours: 8 });
    // ТЦ «Галерея» (черновик)
    stage('g1', 'gallery', 1, 'Обследование и исходные данные', 'Обследование', 'frolov', 'gromov', 7, 20, 'new', [], { effortHours: 24 });
    stage('g2', 'gallery', 2, 'Расчёт категорий помещений', 'Расчёт', null, 'gromov', 21, 35, 'new', ['g1'], { effortHours: 24, executorRole: 'calculator' });
    // Офис «ТехноПарк» (завершён)
    stage('t1', 'techno', 1, 'Схема АПС', 'Схема', 'petrov', 'gromov', -255, -220, 'accepted', [], { factEnd: day(-221) });
    stage('t2', 'techno', 2, 'Спецификации', 'Спецификация', 'orlov', 'gromov', -219, -190, 'accepted', ['t1'], { factEnd: day(-191) });
    stage('t3', 'techno', 3, 'Пояснительная записка', 'Пояснительная записка', 'orlov', 'gromov', -189, -160, 'accepted', ['t2'], { factEnd: day(-161) });
    // Котельная № 2
    stage('k1', 'teplo', 1, 'Расчёт категорий помещений', 'Расчёт', 'kozlova', 'ershova', -58, -40, 'accepted', [], { factEnd: day(-41), effortHours: 16 });
    stage('k2', 'teplo', 2, 'Схема АПС котельной', 'Схема', 'petrov', 'ershova', -39, -8, 'in_work', ['k1'], { effortHours: 32 });
    stage('k3', 'teplo', 3, 'Локальная смета', 'Смета', 'belova', 'ershova', -7, -3, 'new', ['k2'], { effortHours: 12 });

    /* ---------- Документы и версии ---------- */
    const D = {}, V = {};
    function doc(key, projectKey, stageKey, kind, type, title, authorKey, created) {
      const d = { id: seq('documents'), projectId: P[projectKey], stageId: stageKey ? ST[stageKey] : null, kind, type, title, createdAt: at(created), createdBy: U[authorKey] };
      db.documents.push(d); D[key] = d.id; return d;
    }
    function ver(key, docKey, no, fileName, size, authorKey, when, comment, status, extra) {
      const d = db.documents.find(x => x.id === D[docKey]);
      const v = Object.assign({
        id: seq('versions'), documentId: D[docKey], stageId: d.stageId, no, fileName, size,
        ext: fileName.split('.').pop().toLowerCase(), fileKey: null, demoFile: true, authorId: U[authorKey],
        date: when, comment, status, submittedAt: status !== 'uploaded' ? when : null
      }, extra || {});
      db.versions.push(v); V[key] = v.id; return v;
    }
    doc('src1', 'sever', null, 'source', 'Задание', 'Задание заказчика', 'sokolov', -80);
    ver('src1v1', 'src1', 1, 'Задание_Склад_Север.pdf', 412300, 'sokolov', at(-80, '10:15'), 'Исходное задание заказчика', 'uploaded');
    doc('src2', 'sever', null, 'source', 'План', 'Поэтажные планы склада', 'sokolov', -79);
    ver('src2v1', 'src2', 1, 'Планы_склада.dwg', 2843000, 'sokolov', at(-79, '11:00'), 'Планы от заказчика', 'uploaded');

    doc('d1', 'sever', 's1', 'result', 'Расчёт', 'Расчёт категорий помещений', 'kozlova', -60);
    ver('d1v1', 'd1', 1, 'Расчёт_категорий_v1.pdf', 845000, 'kozlova', at(-56, '15:40'), 'Первая редакция', 'accepted');
    doc('d2', 'sever', 's2', 'result', 'Расчёт', 'Расчёт времени эвакуации', 'kozlova', -42);
    ver('d2v1', 'd2', 1, 'Расчёт_эвакуации.pdf', 1204000, 'kozlova', at(-41, '12:10'), 'Расчёт по методике', 'accepted');
    doc('d3', 'sever', 's3', 'result', 'Схема', 'Схема АПС', 'petrov', -35);
    ver('d3v1', 'd3', 1, 'Схема_АПС_v1.dwg', 3120000, 'petrov', at(-33, '16:00'), 'Первая версия схемы', 'returned');
    ver('d3v2', 'd3', 2, 'Схема_АПС_v2.dwg', 3188000, 'petrov', at(-31, '10:20'), 'Исправлены обозначения шлейфов по замечанию Р-012', 'accepted');
    doc('d4', 'sever', 's4', 'result', 'Схема', 'Схема СОУЭ', 'orlov', -24);
    ver('d4v1', 'd4', 1, 'Схема_СОУЭ.pdf', 990000, 'orlov', at(-23, '14:00'), 'Первая версия', 'accepted');
    doc('d5', 'sever', 's5', 'result', 'План', 'Планы расположения оборудования', 'petrov', -17);
    ver('d5v1', 'd5', 1, 'Планы_оборудования.dxf', 1500000, 'petrov', at(-16, '11:30'), 'Первая версия', 'accepted');
    doc('d6', 'sever', 's6', 'result', 'Схема', 'Схема водяного пожаротушения', 'orlov', -8);
    ver('d6v1', 'd6', 1, 'Схема_ВПТ_v1.pdf', 1740000, 'orlov', at(-6, '17:10'), 'Первая версия', 'returned');
    ver('d6v2', 'd6', 2, 'Схема_ВПТ_v2.pdf', 1780000, 'orlov', at(0, '09:20'), 'Указан диаметр магистрали, добавлена насосная в экспликацию', 'submitted');
    doc('d7', 'sever', 's7', 'result', 'Спецификация', 'Спецификация оборудования', 'petrov', -9);
    ver('d7v1', 'd7', 1, 'Спецификация_v1.xlsx', 96000, 'petrov', at(-7, '13:00'), 'Первая версия', 'returned');

    doc('a1d', 'school', 'a1', 'result', 'Отчёт', 'Акт обследования', 'frolov', -20);
    ver('a1v1', 'a1d', 1, 'Акт_обследования.pdf', 510000, 'frolov', at(-20, '12:00'), 'Акт с фотофиксацией', 'accepted');
    doc('a3d', 'school', 'a3', 'result', 'Схема', 'Схема АПС и СОУЭ школы', 'frolov', -5);
    ver('a3v1', 'a3d', 1, 'Схема_АПС_школа.pdf', 1320000, 'frolov', at(-4, '16:45'), 'Черновая версия', 'uploaded');
    doc('srcA', 'school', null, 'source', 'Задание', 'Техническое задание школы', 'lebedeva', -30);
    ver('srcAv1', 'srcA', 1, 'ТЗ_школа.docx', 85000, 'lebedeva', at(-30, '09:00'), 'Исходные данные', 'uploaded');

    doc('t1d', 'techno', 't1', 'result', 'Схема', 'Схема АПС офиса', 'petrov', -225);
    ver('t1v1', 't1d', 1, 'Схема_АПС_офис_v1.pdf', 1200000, 'petrov', at(-224, '10:00'), 'Первая версия', 'returned');
    ver('t1v2', 't1d', 2, 'Схема_АПС_офис_v2.pdf', 1230000, 'petrov', at(-221, '10:00'), 'Исправлено', 'accepted');
    doc('t2d', 'techno', 't2', 'result', 'Спецификация', 'Спецификация офиса', 'orlov', -195);
    ver('t2v1', 't2d', 1, 'Спецификация_офис.xlsx', 70000, 'orlov', at(-192, '10:00'), 'Первая версия', 'accepted');
    doc('t3d', 'techno', 't3', 'result', 'Пояснительная записка', 'Пояснительная записка', 'orlov', -165);
    ver('t3v1', 't3d', 1, 'ПЗ_офис.docx', 230000, 'orlov', at(-162, '10:00'), 'Итоговая версия', 'accepted');

    doc('k1d', 'teplo', 'k1', 'result', 'Расчёт', 'Категорирование котельной', 'kozlova', -42);
    ver('k1v1', 'k1d', 1, 'Категории_котельная.pdf', 640000, 'kozlova', at(-41, '10:00'), 'Расчёт', 'accepted');

    /* ---------- Проверки ---------- */
    function review(verKey, stageKey, reviewerKey, decision, when, comment) {
      db.reviews.push({ id: seq('reviews'), versionId: V[verKey], stageId: ST[stageKey], reviewerId: U[reviewerKey], decision, date: when, comment });
    }
    review('d1v1', 's1', 'gromov', 'accepted', at(-55, '11:00'), 'Принято без замечаний');
    review('d2v1', 's2', 'gromov', 'accepted', at(-40, '10:00'), 'Принято');
    review('d3v1', 's3', 'gromov', 'returned', at(-32, '12:00'), 'Есть замечание к обозначениям');
    review('d3v2', 's3', 'gromov', 'accepted', at(-30, '15:00'), 'Замечание устранено');
    review('d4v1', 's4', 'gromov', 'accepted', at(-22, '10:00'), 'Принято');
    review('d5v1', 's5', 'gromov', 'accepted', at(-15, '16:30'), 'Принято');
    review('d6v1', 's6', 'gromov', 'returned', at(-4, '11:00'), 'Возврат: 2 замечания');
    review('d7v1', 's7', 'gromov', 'returned', at(-3, '14:30'), 'Возврат: 2 замечания');
    review('a1v1', 'a1', 'ershova', 'accepted', at(-19, '10:00'), 'Принято');
    review('t1v1', 't1', 'gromov', 'returned', at(-223, '10:00'), 'Возврат');
    review('t1v2', 't1', 'gromov', 'accepted', at(-220, '10:00'), 'Принято');
    review('t2v1', 't2', 'gromov', 'accepted', at(-190, '10:00'), 'Принято');
    review('t3v1', 't3', 'gromov', 'accepted', at(-160, '10:00'), 'Принято');
    review('k1v1', 'k1', 'ershova', 'accepted', at(-40, '10:00'), 'Принято');

    /* ---------- Замечания ---------- */
    const R = {};
    function remark(key, number, stageKey, docKey, verKey, section, text, category, severity, authorKey, execKey, deadline, status, created, history, extra) {
      const st = db.stages.find(s => s.id === ST[stageKey]);
      const r = Object.assign({
        id: seq('remarks'), number, projectId: st.projectId, stageId: ST[stageKey], documentId: D[docKey], versionId: V[verKey],
        section, text, category, severity, authorId: U[authorKey], executorId: U[execKey], deadline: day(deadline), status,
        createdAt: at(created, '11:00'), history: history || [{ date: at(created, '11:00'), userId: U[authorKey], status: 'open', comment: 'Замечание создано' }],
        comments: [], aiStatus: null, isTest: true
      }, extra || {});
      db.remarks.push(r); R[key] = r.id; return r;
    }
    remark('r12', 'Р-012', 's3', 'd3', 'd3v1', 'Лист 3', 'Обозначения шлейфов на схеме не соответствуют условным обозначениям в легенде.', 'Оформление', 'major', 'gromov', 'petrov', -30, 'accepted', -32, [
      { date: at(-32, '12:00'), userId: U.gromov, status: 'open', comment: 'Замечание создано' },
      { date: at(-31, '10:20'), userId: U.petrov, status: 'fixed', comment: 'Загружена версия 2' },
      { date: at(-30, '15:00'), userId: U.gromov, status: 'accepted', comment: 'Исправление принято' }], { aiStatus: 'candidate', resolvedAt: at(-30, '15:00') });
    remark('r27', 'Р-027', 's6', 'd6', 'd6v1', 'Схема, лист 2', 'На схеме не указан диаметр магистрального трубопровода.', 'Комплектность', 'major', 'gromov', 'orlov', 0, 'fixed', -4, [
      { date: at(-4, '11:00'), userId: U.gromov, status: 'open', comment: 'Замечание создано' },
      { date: at(0, '09:20'), userId: U.orlov, status: 'fixed', comment: 'Передана версия 2' }]);
    remark('r28', 'Р-028', 's6', 'd6', 'd6v1', 'Схема, лист 1', 'Нет обозначения насосной станции в экспликации.', 'Оформление', 'minor', 'gromov', 'orlov', 0, 'fixed', -4, [
      { date: at(-4, '11:00'), userId: U.gromov, status: 'open', comment: 'Замечание создано' },
      { date: at(0, '09:20'), userId: U.orlov, status: 'fixed', comment: 'Передана версия 2' }]);
    remark('r31', 'Р-031', 's7', 'd7', 'd7v1', 'Раздел 3.2, лист 5', 'Не указана категория помещения по пожарной опасности для зоны хранения.', 'Нормативные требования', 'critical', 'gromov', 'petrov', -5, 'open', -3);
    remark('r32', 'Р-032', 's7', 'd7', 'd7v1', 'Лист 7', 'Номенклатура извещателей в спецификации не совпадает со схемой АПС (этап 3).', 'Согласованность разделов', 'major', 'gromov', 'petrov', -5, 'open', -3);
    remark('rt1', 'Р-004', 't1', 't1d', 't1v1', 'Лист 2', 'Расстояние между дымовыми извещателями в коридоре превышает допустимое.', 'Нормативные требования', 'critical', 'gromov', 'petrov', -221, 'accepted', -223, [
      { date: at(-223, '10:00'), userId: U.gromov, status: 'open', comment: 'Замечание создано' },
      { date: at(-221, '10:00'), userId: U.petrov, status: 'fixed', comment: 'Загружена версия 2' },
      { date: at(-220, '10:00'), userId: U.gromov, status: 'accepted', comment: 'Исправление принято' }], { aiStatus: 'included', resolvedAt: at(-220, '10:00') });

    /* ---------- Архив ИИ: вручную подготовленные демонстрационные примеры ---------- */
    function ai(title, text, category, stageType, docType, fix, extra) {
      db.aiArchive.push(Object.assign({
        id: seq('aiArchive'), title, text, category, stageType, docType, fix,
        sourceRemarkId: null, sourceProjectId: null, sourceLabel: 'Демонстрационный пример',
        status: 'included', checkedBy: U.gromov, checkedAt: at(-100), createdAt: at(-110), indexedAt: at(-100), isTest: true
      }, extra || {}));
    }
    ai('Спецификация не соответствует схеме', 'Количество и типы дымовых извещателей в спецификации не совпадают с обозначениями на схеме АПС.', 'Согласованность разделов', 'Спецификация', 'Спецификация', 'Сверили спецификацию со схемой по каждой позиции и загрузили исправленную версию с комментарием.');
    ai('Расхождение между разделами документации', 'Тип оборудования в пояснительной записке указан иначе, чем на схеме.', 'Согласованность разделов', 'Пояснительная записка', 'Пояснительная записка', 'Согласовали обозначения между разделами и добавили перечень условных обозначений.');
    ai('Неполная спецификация', 'В спецификации отсутствуют позиции кабельной продукции, показанные на плане.', 'Комплектность', 'Спецификация', 'Спецификация', 'Дополнили спецификацию недостающими позициями и пересчитали количество.');
    ai('Не указана категория помещения', 'Для складской зоны не указана категория помещения по взрывопожарной и пожарной опасности.', 'Нормативные требования', 'Расчёт', 'Расчёт', 'Выполнили расчёт категории и внесли её в экспликацию помещений и спецификацию.');
    ai('Превышено расстояние между извещателями', 'Расстояние между точечными дымовыми извещателями превышает допустимое значение для высоты помещения.', 'Нормативные требования', 'Схема', 'Схема', 'Добавили извещатели и пересчитали расстановку по таблице свода правил.', { sourceRemarkId: R.rt1, sourceProjectId: P.techno, sourceLabel: 'ПБ-2025-006 · этап «Схема АПС»' });
    ai('Не указан диаметр трубопровода', 'На аксонометрической схеме не указан диаметр подводящего и магистрального трубопровода.', 'Комплектность', 'Схема', 'Схема', 'Указали диаметры всех участков по гидравлическому расчёту.');
    ai('Нет обозначения насосной станции', 'Насосная станция пожаротушения не обозначена в экспликации помещений.', 'Оформление', 'Схема', 'Схема', 'Добавили помещение насосной станции в экспликацию и на план.');
    ai('Не обоснован тип оповещателей', 'Не обоснован выбор типа системы оповещения и управления эвакуацией для здания.', 'Нормативные требования', 'Схема', 'Пояснительная записка', 'Добавили обоснование типа СОУЭ по классу функциональной пожарной опасности.');
    ai('Ошибка в расчёте времени эвакуации', 'В расчёте времени эвакуации неверно принята плотность людского потока на лестнице.', 'Расчётная ошибка', 'Расчёт', 'Расчёт', 'Пересчитали время эвакуации с корректными исходными данными и обновили выводы.');
    ai('Не учтены эвакуационные выходы', 'В расчёте эвакуации не учтён один из эвакуационных выходов второго этажа.', 'Расчётная ошибка', 'Расчёт', 'Расчёт', 'Добавили выход в расчётную схему и пересчитали маршруты.');
    ai('Отсутствует штамп и подписи', 'На листах чертежа отсутствует основная надпись с подписями ответственных лиц.', 'Оформление', 'Схема', 'Схема', 'Оформили основную надпись по ГОСТ и добавили подписи.');
    ai('Неверный масштаб плана', 'Масштаб на плане расположения оборудования не соответствует фактическим размерам.', 'Оформление', 'План', 'План', 'Перевыпустили план в масштабе 1:100 и проверили привязки.');
    ai('Нет привязки оборудования к осям', 'Приборы управления на плане не привязаны к осям здания.', 'Оформление', 'План', 'План', 'Добавили размерные привязки ко всем приборам.');
    ai('Не учтена резервная линия питания', 'В схеме электропитания системы не предусмотрен резервный источник питания.', 'Нормативные требования', 'Схема', 'Схема', 'Добавили резервированный источник питания и расчёт ёмкости аккумуляторов.');
    ai('Ошибки в смете по количеству кабеля', 'Количество кабеля в смете не совпадает с длиной трасс на планах.', 'Сметная ошибка', 'Смета', 'Смета', 'Пересчитали длины трасс и откорректировали объёмы в смете.');
    ai('Устаревшие расценки в смете', 'В локальной смете применены расценки, не соответствующие текущему кварталу.', 'Сметная ошибка', 'Смета', 'Смета', 'Применили актуальные индексы и пересчитали смету.');
    ai('Не указаны зоны защиты', 'На схеме пожаротушения не обозначены границы защищаемых зон.', 'Комплектность', 'Схема', 'Схема', 'Обозначили зоны защиты и их номера на схеме и в спецификации.');
    ai('Не обозначены огнестойкие кабели', 'Для линий СОУЭ не указан огнестойкий тип кабеля.', 'Нормативные требования', 'Спецификация', 'Спецификация', 'Заменили марку кабеля на огнестойкую в спецификации и на схеме.');
    ai('Неполный комплект для согласования', 'В пакете для согласования отсутствует пояснительная записка к разделу.', 'Комплектность', 'Согласование', 'Письмо', 'Дополнили пакет и повторно направили его на согласование.');
    ai('Нет ссылок на нормативы', 'В пояснительной записке отсутствуют ссылки на применённые своды правил.', 'Оформление', 'Пояснительная записка', 'Пояснительная записка', 'Добавили перечень нормативных документов и ссылки в текст.');
    ai('Не указан класс пожарной опасности', 'В расчёте категорий не указан класс функциональной пожарной опасности здания.', 'Нормативные требования', 'Расчёт', 'Расчёт', 'Определили класс функциональной пожарной опасности и внесли в расчёт.');
    ai('Несовпадение адресов извещателей', 'Адреса извещателей в таблице подключения не совпадают с номерами на плане.', 'Согласованность разделов', 'Схема', 'Схема', 'Синхронизировали адресацию в таблице и на плане.');
    ai('Обследование без фотофиксации', 'Акт обследования не содержит фотофиксации существующих систем.', 'Комплектность', 'Обследование', 'Отчёт', 'Дополнили акт фотоматериалами с привязкой к помещениям.');
    // Кандидат, ожидающий проверки специалистом
    db.aiArchive.push({
      id: seq('aiArchive'), title: 'Обозначения шлейфов не соответствуют легенде', text: 'Обозначения шлейфов на схеме не соответствуют условным обозначениям в легенде.',
      category: 'Оформление', stageType: 'Схема', docType: 'Схема', fix: 'Привели обозначения в соответствие с легендой, выпустили версию 2.',
      sourceRemarkId: R.r12, sourceProjectId: P.sever, sourceLabel: 'ПБ-2026-011 · этап «Схема АПС»',
      status: 'pending', checkedBy: null, checkedAt: null, createdAt: at(-30, '15:05'), indexedAt: null, isTest: true
    });

    /* ---------- Уведомления ---------- */
    function note(userKey, type, text, link, when, read) {
      db.notifications.push({ id: seq('notifications'), userId: U[userKey], type, text, link, date: when, readAt: read ? when : null });
    }
    note('gromov', 'review', 'Склад «Север»: этап 6 «Схема водяного пожаротушения», версия 2 передана на проверку', '#/stage/' + ST.s6, at(0, '09:20'));
    note('petrov', 'returned', 'Склад «Север»: этап 7 возвращён на доработку (2 замечания)', '#/stage/' + ST.s7, at(-3, '14:30'));
    note('petrov', 'overdue', 'Склад «Север»: срок этапа 7 «Узлы управления и спецификации» просрочен', '#/stage/' + ST.s7, at(-4, '09:00'));
    note('petrov', 'deadline', 'Котельная № 2: срок этапа «Схема АПС котельной» истёк', '#/stage/' + ST.k2, at(-7, '09:00'), true);
    note('orlov', 'returned', 'Склад «Север»: этап 6 возвращён на доработку (2 замечания)', '#/stage/' + ST.s6, at(-4, '11:00'), true);
    note('sokolov', 'overdue', 'Котельная № 2: плановая дата окончания проекта прошла', '#/project/' + P.teplo, at(-2, '09:00'));
    note('sokolov', 'returned', 'Склад «Север»: этап 7 возвращён на доработку', '#/stage/' + ST.s7, at(-3, '14:30'));
    note('frolov', 'overdue', 'Школа № 3: срок этапа «Схема АПС и СОУЭ» просрочен', '#/stage/' + ST.a3, at(-1, '09:00'));
    note('kozlova', 'deadline', 'Школа № 3: до срока этапа «Расчёт пожарного риска» осталось 3 дня', '#/stage/' + ST.a2, at(0, '08:00'));
    note('smirnova', 'info', 'Создана учётная запись Михайлова С. Е.', '#/users', at(-40, '10:00'), true);

    /* ---------- Журнал аудита ---------- */
    function audit(userKey, action, objType, objId, projectKey, when, description) {
      db.audit.push({ id: seq('audit'), userId: U[userKey], action, objType, objId, projectId: projectKey ? P[projectKey] : null, date: when, description, oldValue: null, newValue: null });
    }
    audit('sokolov', 'project.create', 'project', P.sever, 'sever', at(-83, '10:00'), 'Создан проект «Склад «Север»» (ПБ-2026-011)');
    audit('sokolov', 'project.start', 'project', P.sever, 'sever', at(-80, '09:00'), 'Проект запущен в работу');
    audit('kozlova', 'version.upload', 'version', V.d1v1, 'sever', at(-56, '15:40'), 'Загружена версия 1 «Расчёт_категорий_v1.pdf»');
    audit('gromov', 'review.accept', 'stage', ST.s1, 'sever', at(-55, '11:00'), 'Принят результат этапа 1, версия 1');
    audit('gromov', 'review.return', 'stage', ST.s3, 'sever', at(-32, '12:00'), 'Этап 3 возвращён на доработку, замечание Р-012');
    audit('petrov', 'version.upload', 'version', V.d3v2, 'sever', at(-31, '10:20'), 'Загружена версия 2 «Схема_АПС_v2.dwg»');
    audit('gromov', 'review.accept', 'stage', ST.s3, 'sever', at(-30, '15:00'), 'Принят результат этапа 3, версия 2');
    audit('gromov', 'review.accept', 'stage', ST.s5, 'sever', at(-15, '16:30'), 'Принят результат этапа 5, версия 1');
    audit('sokolov', 'stage.deadline', 'stage', ST.s6, 'sever', at(-10, '12:00'), 'Срок этапа 6 перенесён: причина — уточнение исходных данных от заказчика');
    audit('gromov', 'review.return', 'stage', ST.s6, 'sever', at(-4, '11:00'), 'Этап 6 возвращён на доработку, замечания Р-027, Р-028');
    audit('gromov', 'review.return', 'stage', ST.s7, 'sever', at(-3, '14:30'), 'Этап 7 возвращён на доработку, замечания Р-031, Р-032');
    audit('orlov', 'version.submit', 'version', V.d6v2, 'sever', at(0, '09:20'), 'Версия 2 этапа 6 передана на проверку');
    audit('smirnova', 'user.create', 'user', U.mikhailova, null, at(-40, '10:00'), 'Создана учётная запись Михайлова С. Е. (Менеджер по согласованию)');
    audit('smirnova', 'user.block', 'user', U.yakovleva, null, at(-14, '10:00'), 'Заблокирована учётная запись Яковлева А. Д.');
    audit('lebedeva', 'project.create', 'project', P.school, 'school', at(-33, '10:00'), 'Создан проект «Школа № 3 — АПС и СОУЭ» (ПБ-2026-014)');
    audit('sokolov', 'project.create', 'project', P.gallery, 'gallery', at(-2, '16:00'), 'Создан проект «ТЦ «Галерея»» (черновик)');

    return db;
  }

  window.PozhSeed = { build, DEMO_PASSWORD };
})();

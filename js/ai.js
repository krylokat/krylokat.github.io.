/*
 * ИИ-помощник (п. 5.8 ТЗ): поиск и ранжирование похожих замечаний в архиве.
 * Алгоритм: нормализация текста -> токены (упрощённый русский стемминг) + биграммы ->
 * TF-IDF -> косинусное сходство. Без внешних сервисов: данные не покидают браузер.
 * Интерфейс отделён от алгоритма: модуль можно заменить обучаемой моделью без изменений экранов.
 */
(function () {
  'use strict';
  const STOP = new Set(('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему ' +
    'теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем ' +
    'была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем ' +
    'всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда ' +
    'лучше чуть том нельзя такой им более всегда конечно всю между это также указан указана указано').split(' '));
  const ENDINGS = ['ированиями', 'ованиями', 'ениями', 'ировать', 'ования', 'ование', 'ностью', 'ениях', 'ением', 'ения', 'ение', 'ости', 'ость', 'иями', 'ями', 'ами',
    'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ых', 'их', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях',
    'ов', 'ев', 'ей', 'ию', 'ия', 'ие', 'ии', 'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'];

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function stem(w) {
    if (w.length <= 4) return w;
    for (const e of ENDINGS) {
      if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, w.length - e.length);
    }
    return w;
  }
  /** Возвращает список {term, word}: стемы слов и биграммы стемов. */
  function tokenize(text) {
    const words = normalize(text).split(' ').filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
    const toks = words.map(w => ({ term: stem(w), word: w }));
    const out = toks.slice();
    for (let i = 0; i + 1 < toks.length; i++) out.push({ term: toks[i].term + '_' + toks[i + 1].term, word: toks[i].word + ' ' + toks[i + 1].word, bigram: true });
    return out;
  }
  function tf(tokens) {
    const m = new Map();
    tokens.forEach(t => m.set(t.term, (m.get(t.term) || 0) + 1));
    return m;
  }
  function norm(vec) {
    let s = 0; vec.forEach(v => { s += v * v; }); s = Math.sqrt(s) || 1;
    vec.forEach((v, k) => vec.set(k, v / s));
    return vec;
  }

  /** Строит индекс по разрешённым записям архива (индекс производен и может пересоздаваться). */
  function buildIndex(records) {
    const docs = records.map(r => {
      const toks = tokenize(r.title + ' ' + r.text);
      return { rec: r, toks, tf: tf(toks) };
    });
    const df = new Map();
    docs.forEach(d => d.tf.forEach((_, term) => df.set(term, (df.get(term) || 0) + 1)));
    const N = docs.length;
    const idf = (term) => Math.log((1 + N) / (1 + (df.get(term) || 0))) + 1;
    docs.forEach(d => {
      const v = new Map();
      d.tf.forEach((c, term) => v.set(term, (1 + Math.log(c)) * idf(term)));
      d.vec = norm(v);
    });
    return { docs, idf, N };
  }

  /**
   * Поиск похожих записей.
   * @param query текст замечания/описания
   * @param records ТОЛЬКО доступные пользователю записи (права проверяются до формирования результата)
   * @param opts {threshold, limit, stageType, docType}
   */
  function search(query, records, opts) {
    opts = opts || {};
    const threshold = opts.threshold != null ? opts.threshold : 0.25;
    const limit = opts.limit || 5;
    const qt = tokenize(query);
    if (qt.length === 0) return { results: [], reason: 'empty' };
    const index = buildIndex(records);
    const qtf = tf(qt);
    const qv = new Map();
    qtf.forEach((c, term) => qv.set(term, (1 + Math.log(c)) * index.idf(term)));
    norm(qv);
    const results = index.docs.map(d => {
      let score = 0; const common = new Set();
      qv.forEach((w, term) => {
        const dw = d.vec.get(term);
        if (dw) {
          score += w * dw;
          if (!term.includes('_')) {
            const tok = d.toks.find(t => t.term === term && !t.bigram);
            if (tok) common.add(tok.word);
          }
        }
      });
      const reasons = [];
      if (common.size) reasons.push('общие слова: ' + Array.from(common).slice(0, 5).map(w => '«' + w + '»').join(', '));
      let bonus = 0;
      if (score > 0 && opts.stageType && d.rec.stageType === opts.stageType) { bonus += 0.03; reasons.push('совпадает тип этапа'); }
      if (score > 0 && opts.docType && d.rec.docType === opts.docType) { bonus += 0.03; reasons.push('совпадает тип документа'); }
      return { rec: d.rec, score: Math.min(1, score + bonus), raw: score, common: Array.from(common), reasons };
    }).filter(r => r.raw > 0 && r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { results, reason: results.length ? 'ok' : 'none' };
  }

  window.PozhAI = { search, tokenize, normalize, buildIndex };
})();

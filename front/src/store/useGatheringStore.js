import { create } from 'zustand';
import { buildGathering, EVENTS } from '../lib/data';
import { forecast, counts } from '../lib/forecast';
import { api } from '../lib/api';
import { commit, isOffline, isForbidden } from '../lib/optimistic';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';
import { usePlatformStore } from './usePlatformStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const curLang = () => (isRu() ? 'ru' : 'kz');
const toast = (text) => useUiStore.getState().showToast(text);

let rafId = null;
let cuFallback = null;
let pollTimer = null;
// Поколение правки ответа: быстрые повторные тапы в шторке перекрывают друг друга,
// и откат упавшего запроса не должен вернуть позапрошлое значение поверх нового,
// который сервер уже принял. Ср. guard в rollback у removeParticipant.
const answerGen = new Map();

// marks из отметок явки участников (presence === 'came').
const deriveMarks = (participants = []) => {
  const m = {};
  for (const p of participants) if (p.presence === 'came') m[p.id] = 'came';
  return m;
};

// Слить обновлённые строки (poll) в текущий ростер по id.
// Бэк на любой смене revision отдаёт ВЕСЬ ростер (routes/gatherings.py:poll), значит
// changed — правда о составе: кого в нём нет, того удалили (второй координатор или сам
// волонтёр, отозвав запись). Слияние только по id удалённых не выбрасывало — участник
// оставался призраком до перезагрузки и накручивал counts()/forecast() и список отметки.
// Порядок берём серверный; несинканных гостей (ещё с cmid) сохраняем — бэк их не знает.
const mergeChanged = (current = [], changed = []) => {
  const byId = new Map(current.map((p) => [p.id, p]));
  const alive = new Set(changed.map((c) => c.id));
  return changed
    .map((c) => ({ ...(byId.get(c.id) || {}), ...c }))
    .concat(current.filter((p) => p.cmid && !alive.has(p.id)));
};

// Бэк отдаёт целочисленные id, а экраны работают на строковых id демо-данных:
// usePlatformStore (mapEvent) клеит префикс — 'e' + e.id, loadRegistrations ниже делает то же.
// Поэтому перед запросом префикс нужно снять. Раньше это делал replace(/^\D+/, ''),
// который резал ЛЮБЫЕ буквы: 'a1' (заявка) и 'ed1' (демо-сбор без серверной пары)
// превращались в валидный на вид id 1 — и запрос уходил по чужому сбору.
// Здесь шаблон строгий: только 'e'+цифры или чистое число. Не подошло → null,
// и вызывающий обязан не ходить в API вовсе.
const eventNumericId = (id) => {
  const m = /^e?(\d+)$/.exec(String(id == null ? '' : id));
  return m ? m[1] : null;
};

// Точечная правка ответа на событие ленты; val === null убирает запись.
const withReg = (regs, eventId, val) => {
  const n = { ...regs };
  if (val == null) delete n[eventId]; else n[eventId] = val;
  return n;
};

// --- офлайн-отметка явки: очередь операций + снапшот сбора в localStorage (ТЗ §5.5) ---
const CI_Q = (gid) => `erik-ci-q-${gid}`;   // очередь несинканных отметок
const CI_G = (gid) => `erik-ci-g-${gid}`;   // снапшот сбора (для перезагрузки офлайн)
const readJSON = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (_) { return fb; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* quota */ } };
const dropKey = (k) => { try { localStorage.removeItem(k); } catch (_) { /* noop */ } };
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
// op = { clientMarkId, pid?, present, ts, guestName? }; дедуп по clientMarkId (последнее состояние).
const upsertOp = (queue, op) => {
  const i = queue.findIndex((x) => x.clientMarkId === op.clientMarkId);
  const n = queue.slice();
  if (i >= 0) n[i] = op; else n.push(op);
  return n;
};

// Данные текущего сбора + отметки явки + анимация числа прогноза.
// Оптимистичные мутации: сначала локально, затем в API; при офлайне остаёмся на моках.
export const useGatheringStore = create((set, get) => ({
  gathering: buildGathering(),
  myGatherings: [],   // список своих сборов (для /me), с сервера
  marks: {},
  displayE: null,
  polled: false,
  regs: {}, // ответы на события ленты: { [eventId]: 'yes'|'maybe'|'no' }
  mlForecast: null, // компаньон-прогноз ML: { available, expected, participants[] } | { available:false }
  checkinQueue: [], // несинканные офлайн-отметки явки
  syncing: false,   // идёт batch-синк
  online: isOnline(),
  guestError: null, // гостевой экран: null | 'notfound' (сбора нет) | 'offline' (нет сети)

  // --- производные ---
  forecast: () => forecast(get().gathering.participants || [], get().gathering.ctx),
  counts: () => counts(get().gathering.participants || []),

  // --- загрузка/создание ---
  create: async (form) => {
    const body = {
      what: form.what, where: form.where, date: form.date, time: form.time,
      needed: form.needed, name: (form.name || '').trim() || undefined,
      // Тема и город обязательны в форме (NewGathering.validate) и по ним фильтрует лента
      // (platform.py:_feed_query). Терялись здесь: без КЛЮЧА в теле бэк пишет NULL —
      // одобренный сбор не находился ни под одним чипом темы и не вставал на карту.
      theme: form.theme, cityId: form.cityId,
      // Орг и обложка опциональны: заданы в форме → уходят в тело, иначе undefined и
      // JSON.stringify их выкинет (бэк оставит org_id/image_url прежними/NULL). Имена в
      // ТЕЛЕ запроса — orgId/imageUrl (см. createGathering в lib/api.js).
      orgId: form.orgId, imageUrl: form.imageUrl,
    };
    if (body.name) useSessionStore.getState().setIdentity(body.name, useSessionStore.getState().phone);
    // Успех → { gathering, ... } как раньше. Провал → { error: { offline, forbidden, message } }.
    // Раньше здесь молча патчился демо-сбор и возвращался null — экран принимал это за
    // «создано офлайн» и показывал шторку с чужим демо-кодом PARK18. Сбора не существует,
    // врать про код нельзя: возвращаем различимую ошибку и ничего локально не выдумываем.
    const r = await commit({
      call: () => api.createGathering(body),
      errRu: 'Не удалось создать сбор', errKz: 'Жиынды құру мүмкін болмады',
    });
    if (!r.ok) {
      return { error: { offline: isOffline(r.error), forbidden: isForbidden(r.error), message: r.error && r.error.message } };
    }
    const res = r.data;
    // Первый созданный сбор повышает vol→coord: бэк отдаёт новую роль в res.role, но без
    // применения к сессии UI остаётся с прежней ролью до перезагрузки (известный LOW-баг).
    if (res.role) useSessionStore.getState().setRole(res.role);
    set({ gathering: res.gathering, marks: deriveMarks(res.gathering.participants), displayE: null, polled: false });
    return res;
  },

  loadCoord: async (id) => {
    set({ mlForecast: null }); // сбрасываем ML прошлого сбора
    const numeric = eventNumericId(id); // 'e5' из ленты → '5'
    if (numeric == null) {
      // Демо-сбор без серверной пары ('ed1'): в API не идём — вернулся бы чужой сбор.
      const snap = readJSON(CI_G(String(id)), null);
      if (snap) set({ gathering: snap, marks: deriveMarks(snap.participants), checkinQueue: readJSON(CI_Q(String(id)), []) });
      return;
    }
    try {
      const res = await api.getGathering(numeric);
      const gid = res.gathering.id;
      const queue = readJSON(CI_Q(gid), []);
      // накатываем несинканные офлайн-отметки поверх серверной правды
      let participants = res.gathering.participants;
      for (const op of queue) {
        if (op.pid != null) participants = participants.map((p) => (p.id === op.pid ? { ...p, presence: op.present ? 'came' : null } : p));
      }
      const gathering = { ...res.gathering, participants };
      writeJSON(CI_G(gid), gathering); // снапшот для перезагрузки офлайн
      set({ gathering, marks: deriveMarks(participants), checkinQueue: queue, polled: false });
      if (queue.length) get().flushCheckin();
    } catch (_) {
      // офлайн: восстанавливаем сбор и очередь из localStorage
      const snap = readJSON(CI_G(numeric), null);
      if (snap) set({ gathering: snap, marks: deriveMarks(snap.participants), checkinQueue: readJSON(CI_Q(numeric), []) });
    }
  },

  // Компаньон-прогноз ML (обучаемая модель). Мягко: недоступна → { available:false }.
  loadMlForecast: async () => {
    const numeric = eventNumericId(get().gathering.id);
    if (numeric == null) { set({ mlForecast: { available: false } }); return; }
    try {
      const r = await api.mlForecast(numeric);
      set({ mlForecast: r });
    } catch (_) {
      set({ mlForecast: { available: false } });
    }
  },

  // Список своих сборов для экрана «Мои сборы». Пусто/офлайн — экран падает на демо.
  loadMine: async () => {
    try {
      const res = await api.myGatherings();
      if (Array.isArray(res.gatherings)) set({ myGatherings: res.gatherings });
    } catch (_) {
      /* keep empty → демо-фолбэк на экране */
    }
  },

  loadRegistrations: async () => {
    try {
      const res = await api.myRegistrations();
      const map = {};
      Object.entries(res.registrations || {}).forEach(([gid, ans]) => { map['e' + gid] = ans; });
      if (Object.keys(map).length) set({ regs: map });
    } catch (_) {
      /* keep mock */
    }
  },

  loadGuest: async (code) => {
    // Демо-мок гостю показывать нельзя, но и обнулять gathering тоже: на него без
    // null-guard смотрят соседние экраны (CoordGathering/CheckIn/MyGatherings) — null
    // ронял их в белый экран. Гостю мок и так не мигнёт: GuestGathering прячет тело
    // сбора за booting и guestError, поэтому здесь достаточно сбросить ошибку.
    set({ guestError: null });
    try {
      const res = await api.guestView(code);
      set({ gathering: { ...res.gathering, participants: res.gathering.participants || [] }, guestError: null });
    } catch (err) {
      // Раньше ошибка глоталась и на экране оставался демо-сбор (buildGathering) — фейк
      // выдавался за настоящий. Разводим «нет сети» и «сбора нет»; при guestError экран
      // рисует notfound/offline, а не тело сбора, так что мок гостю не покажется.
      set({ guestError: isOffline(err) ? 'offline' : 'notfound' });
    }
  },

  rsvp: async (code, answer) => {
    try {
      const res = await api.putRsvp(code, answer);
      set((s) => (s.gathering ? { gathering: { ...s.gathering, comingCount: res.comingCount, myAnswer: answer } } : {}));
      return { ok: true, data: res };
    } catch (err) {
      // Не глотаем: возвращаем различимый результат, чтобы экран откатил оптимистичный
      // ответ и показал правду (напр. 409 «Сбор уже завершён»). Ср. commit() в lib/optimistic.
      return { ok: false, error: err };
    }
  },

  // --- мутации сбора (оптимистично + API) ---
  changeAnswerFor: (id, a) => {
    const gid = get().gathering.id;
    const before = get().gathering.participants.find((x) => x.id === id);
    if (!before) return;
    const prevAnswer = before.answer;
    const gen = (answerGen.get(id) || 0) + 1;
    answerGen.set(id, gen);
    // Ответ участника тянет за собой шторку (она держит свою копию) и число прогноза —
    // и при откате их надо вернуть тем же путём, поэтому одна функция на оба направления.
    const writeAnswer = (val) => {
      set((s) => ({
        gathering: {
          ...s.gathering,
          participants: s.gathering.participants.map((p) => (p.id === id ? { ...p, answer: val } : p)),
        },
      }));
      const p = get().gathering.participants.find((x) => x.id === id);
      // Откат прилетает уже после ответа сервера: шторку могли закрыть и открыть на
      // ДРУГОМ участнике (closeSheet не чистит sheetPayload). Пишем payload, только если
      // шторка всё ещё про этого id — иначе подменим карточку чужим человеком.
      const ui = useUiStore.getState();
      if (p && ui.sheet === 'person' && ui.sheetPayload && ui.sheetPayload.id === id) ui.setSheetPayload(p);
      get().animateForecast(false);
    };
    return commit({
      apply: () => writeAnswer(a),
      // Откатываем, только если наш запрос по участнику — последний: более свежий тап
      // уже записал своё значение, и его сервер мог принять.
      rollback: () => { if (answerGen.get(id) === gen) writeAnswer(prevAnswer); },
      call: () => api.setAnswer(gid, id, a),
      errRu: 'Не удалось изменить ответ', errKz: 'Жауапты өзгерту мүмкін болмады',
    });
  },

  // Отметка явки — офлайн-first: пишем в очередь (localStorage), затем пытаемся синкнуть.
  toggleMark: (id) => {
    const willMark = !get().marks[id];
    const gid = get().gathering.id;
    set((s) => {
      const m = { ...s.marks };
      if (willMark) m[id] = 'came'; else delete m[id];
      const participants = s.gathering.participants.map((p) => (p.id === id ? { ...p, presence: willMark ? 'came' : null } : p));
      const q = upsertOp(s.checkinQueue, { clientMarkId: `m-${gid}-${id}`, pid: id, present: willMark, ts: Date.now() });
      writeJSON(CI_Q(gid), q);
      const gathering = { ...s.gathering, participants };
      writeJSON(CI_G(gid), gathering);
      return { marks: m, gathering, checkinQueue: q };
    });
    get().flushCheckin();
  },

  addGuestMark: (name) => {
    const nm = (name || '').trim();
    if (!nm) return;
    const gid = get().gathering.id;
    const tempId = 'g' + Date.now();
    const cmid = 'g-' + tempId;
    set((s) => {
      const q = upsertOp(s.checkinQueue, { clientMarkId: cmid, guestName: nm, present: true, ts: Date.now() });
      writeJSON(CI_Q(gid), q);
      const gathering = {
        ...s.gathering,
        participants: [
          ...s.gathering.participants,
          { id: tempId, name: nm, phone: null, answer: 'yes', presence: 'came', isGuest: true, history: { total: 0, came: 0 }, cmid },
        ],
      };
      writeJSON(CI_G(gid), gathering);
      return { gathering, marks: { ...s.marks, [tempId]: 'came' }, checkinQueue: q };
    });
    toast(isRu() ? 'Добавлен и отмечен' : 'Қосылды және белгіленді');
    get().flushCheckin();
  },

  // Синк очереди отметок идемпотентным batch-эндпоинтом. Гости: temp id → реальный pid.
  flushCheckin: async () => {
    const st = get();
    if (st.syncing || !st.checkinQueue.length || !isOnline()) return;
    const gid = st.gathering.id;
    // Идентичность по ССЫЛКЕ, не по clientMarkId: upsertOp кладёт НОВЫЙ объект на то же
    // место, и перещёлкнутая за время запроса отметка обязана пережить фильтр ниже.
    const sent = new Set(st.checkinQueue);
    set({ syncing: true });
    try {
      const res = await api.presenceBatch(gid, st.checkinQueue, st.gathering.revision);
      // Сервер мог отвергнуть часть очереди: пока мы были офлайн, со-координатор удалил
      // участника (conflicts[].reason === 'not_found'). Ретраить такое незачем, но ростер
      // надо привести к серверной правде — иначе снапшот CI_G сохранит отметку на
      // человеке, которого на сервере уже нет, и finalize уйдёт с враньём.
      const rejected = new Set((res.conflicts || []).map((c) => c.clientMarkId));
      set((s) => {
        let participants = s.gathering.participants;
        const marks = { ...s.marks };
        for (const a of res.applied || []) {
          if (a.clientMarkId && a.clientMarkId.startsWith('g-')) {
            participants = participants.map((p) => (p.cmid === a.clientMarkId ? { ...p, id: a.pid, cmid: undefined } : p));
            const tempId = a.clientMarkId.slice(2);
            if (marks[tempId]) { delete marks[tempId]; marks[a.pid] = 'came'; }
          }
        }
        for (const o of s.checkinQueue) {
          if (!rejected.has(o.clientMarkId)) continue;
          const pid = o.pid != null ? o.pid : o.clientMarkId.slice(2);
          participants = participants.filter((p) => p.id !== pid && p.cmid !== o.clientMarkId);
          delete marks[pid];
        }
        const remaining = s.checkinQueue.filter((o) => !sent.has(o));
        writeJSON(CI_Q(gid), remaining);
        const gathering = { ...s.gathering, participants, revision: typeof res.revision === 'number' ? res.revision : s.gathering.revision };
        writeJSON(CI_G(gid), gathering);
        return { gathering, marks, checkinQueue: remaining, syncing: false };
      });
      if (rejected.size) toast(isRu() ? 'Часть отметок отклонена: участников уже нет в сборе' : 'Кейбір белгілер қабылданбады: қатысушылар жиында жоқ');
      if (get().checkinQueue.length) get().flushCheckin(); // накопилось за время синка
    } catch (_) {
      set({ syncing: false }); // офлайн — очередь ждёт события 'online'
    }
  },

  removeParticipant: (id) => {
    const gid = get().gathering.id;
    const list = get().gathering.participants;
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const removed = list[idx];
    return commit({
      apply: () => set((s) => ({
        gathering: { ...s.gathering, participants: s.gathering.participants.filter((p) => p.id !== id) },
      })),
      // Возвращаем НА ТО ЖЕ МЕСТО: порядок ростера — это порядок ответов, и участник,
      // всплывший в конец списка, читается как «его удалили и добавили заново».
      rollback: () => set((s) => {
        if (s.gathering.participants.some((p) => p.id === id)) return {}; // poll успел вернуть сам
        const parts = s.gathering.participants.slice();
        parts.splice(Math.min(idx, parts.length), 0, removed);
        return { gathering: { ...s.gathering, participants: parts } };
      }),
      call: () => api.removeParticipant(gid, id),
      okRu: 'Убран из сбора', okKz: 'Жиыннан алынды',
      errRu: 'Не удалось убрать участника', errKz: 'Қатысушыны алып тастау мүмкін болмады',
    });
  },

  finishGathering: async () => {
    await get().flushCheckin(); // синкаем отметки ПЕРЕД финализацией
    const gid = get().gathering.id;
    const prevParticipants = get().gathering.participants;
    const prevStatus = get().gathering.status;
    return commit({
      apply: () => set((s) => {
        const parts = s.gathering.participants.map((p) => ({
          ...p,
          presence: s.marks[p.id] ? 'came' : p.answer !== 'no' ? 'missed' : null,
        }));
        return { gathering: { ...s.gathering, participants: parts, status: 'done' } };
      }),
      // finalize не прошёл — статус 'done' и проставленные 'missed' были бы враньём.
      rollback: () => set((s) => ({ gathering: { ...s.gathering, participants: prevParticipants, status: prevStatus } })),
      call: async () => {
        const r = await api.finalize(gid);
        // Офлайн-кэш чистим ТОЛЬКО после успеха: раньше ключи сносились до ответа,
        // и упавший finalize уносил с собой несинканную очередь отметок.
        dropKey(CI_Q(gid)); dropKey(CI_G(gid));
        return r;
      },
      okRu: 'Сбор завершён', okKz: 'Жиын аяқталды',
      errRu: 'Не удалось завершить сбор', errKz: 'Жиынды аяқтау мүмкін болмады',
    });
  },

  deleteGathering: () => {
    const gid = get().gathering.id;
    const same = (x) => String(x) === String(gid) || 'e' + x === String(gid) || x === 'e' + gid;
    // Снапшот ЦЕЛЫХ массивов для отката не годится: пока DELETE в полёте, списки успевают
    // перезагрузиться (navigate('/me') после шторки запускает loadMine) или потерять ДРУГОЙ
    // сбор — откат воскресил бы его вместе с нашим. Помним ровно свои строки и их места.
    const mine = get().myGatherings;
    const mineIdx = mine.findIndex((x) => same(x.id));
    const mineRow = mineIdx >= 0 ? mine[mineIdx] : null;
    // Демо-ленту не трогаем вовсе: настоящего сбора в ней нет, а любой filter вернул бы
    // НОВЫЙ массив и сломал сентинел events === EVENTS, по которому useOrganizerStore
    // отличает демо от сервера — демо-'e5' снова ушёл бы заявкой на ЧУЖОЙ сбор №5.
    const feedIsDemo = usePlatformStore.getState().events === EVENTS;
    const evs = usePlatformStore.getState().events;
    const evIdx = feedIsDemo ? -1 : evs.findIndex((e) => same(e.id));
    const evRow = evIdx >= 0 ? evs[evIdx] : null;
    return commit({
      // Раньше сбор только тостился как удалённый, но оставался в списках до перезагрузки.
      // Чистим обе витрины: «Мои сборы» и ленту платформы (там id с префиксом 'e').
      apply: () => {
        set((s) => ({ myGatherings: s.myGatherings.filter((g) => !same(g.id)) }));
        if (!feedIsDemo) usePlatformStore.setState((s) => ({ events: s.events.filter((e) => !same(e.id)) }));
      },
      // Возвращаем НА ТО ЖЕ МЕСТО и только свою строку — как в rollback у removeParticipant.
      rollback: () => {
        if (mineRow) set((s) => {
          if (s.myGatherings.some((x) => same(x.id))) return {}; // loadMine успел вернуть сам
          const l = s.myGatherings.slice();
          l.splice(Math.min(mineIdx, l.length), 0, mineRow);
          return { myGatherings: l };
        });
        if (evRow) usePlatformStore.setState((s) => {
          if (s.events.some((e) => same(e.id))) return {};
          const l = s.events.slice();
          l.splice(Math.min(evIdx, l.length), 0, evRow);
          return { events: l };
        });
      },
      call: async () => {
        const r = await api.deleteGathering(gid);
        dropKey(CI_Q(gid)); dropKey(CI_G(gid)); // сбора больше нет — офлайн-кэш ни к чему
        return r;
      },
      okRu: 'Сбор удалён', okKz: 'Жиын жойылды',
      errRu: 'Не удалось удалить сбор', errKz: 'Жиынды жою мүмкін болмады',
    });
  },

  saveGathering: () => {
    const g = get().gathering;
    // titleKz/placeKz раньше отбрасывались — казахская версия сбора после любой правки
    // откатывалась к тому, что лежало на сервере. Бэк принимает обе пары, шлём обе.
    // Отката нет намеренно: серверных значений на руках нет, а стирать набранный
    // текст на ошибке сохранения — хуже, чем оставить его в форме с честным тостом.
    return commit({
      call: () => api.patchGathering(g.id, {
        what: g.titleRu, where: g.placeRu,
        titleKz: g.titleKz, placeKz: g.placeKz,
        needed: g.needed,
        // Тема/город/орг/обложка правятся в шторке настроек — без них PATCH откатывал бы
        // их к серверным. Имена в ТЕЛЕ — theme/cityId/orgId/imageUrl (см. patchGathering),
        // а в объекте gathering обложка лежит под image (serialize_gathering_owner).
        theme: g.theme, cityId: g.cityId, orgId: g.orgId, imageUrl: g.image,
      }),
      okRu: 'Изменения сохранены', okKz: 'Өзгерістер сақталды',
      errRu: 'Не удалось сохранить изменения', errKz: 'Өзгерістерді сақтау мүмкін болмады',
    });
  },

  // text — строка (уйдёт в оба языка) либо { ru, kz } с раздельными текстами.
  // Одинаковый text_ru/text_kz — это не перевод, а заглушка: пока шторка даёт одно поле,
  // дублируем честно, но контракт уже принимает пару и переводить ничего не придумывает.
  remind: async (text, audience = 'maybe') => {
    const ru = typeof text === 'string' ? text : (text && text.ru) || '';
    const kz = typeof text === 'string' ? text : (text && text.kz) || ru;
    try {
      return await api.remind(get().gathering.id, { audience, text_ru: ru, text_kz: kz });
    } catch (_) {
      return null; // вызывающий обязан проверить результат — «отправлено» на null это ложь
    }
  },

  setNeeded: (n) => set((s) => ({ gathering: { ...s.gathering, needed: Math.max(1, Math.min(200, n)) } })),
  incNeeded: () => set((s) => ({ gathering: { ...s.gathering, needed: Math.min(200, s.gathering.needed + 1) } })),
  decNeeded: () => set((s) => ({ gathering: { ...s.gathering, needed: Math.max(1, s.gathering.needed - 1) } })),
  // Правка идёт в поле активного языка (lang можно задать явно). Раньше одна строка
  // писалась сразу в оба: правка названия при KZ-интерфейсе затирала русское, и наоборот.
  // Шторка настроек показывает isRu ? titleRu : titleKz — так что правка возвращается туда же.
  setTitle: (v, lang) => set((s) => ({ gathering: { ...s.gathering, [(lang || curLang()) === 'ru' ? 'titleRu' : 'titleKz']: v } })),
  setPlace: (v, lang) => set((s) => ({ gathering: { ...s.gathering, [(lang || curLang()) === 'ru' ? 'placeRu' : 'placeKz']: v } })),
  // Тема/город/орг/обложка — единые для обоих языков, правятся в шторке настроек и уходят
  // в saveGathering. Имена полей — как их отдаёт serialize_gathering_owner: theme/cityId/
  // orgId/image (обложка именно image, не imageUrl — imageUrl только в теле запроса).
  setTheme: (v) => set((s) => ({ gathering: { ...s.gathering, theme: v } })),
  setCity: (v) => set((s) => ({ gathering: { ...s.gathering, cityId: v } })),
  setOrg: (v) => set((s) => ({ gathering: { ...s.gathering, orgId: v } })),
  setImage: (v) => set((s) => ({ gathering: { ...s.gathering, image: v } })),

  registerEvent: (eventId, a) => {
    const numeric = eventNumericId(eventId);
    if (numeric == null) {
      toast(isRu() ? 'Этот сбор недоступен для записи' : 'Бұл жиынға жазылу мүмкін емес');
      return;
    }
    const prev = get().regs[eventId];
    return commit({
      apply: () => set((s) => ({ regs: withReg(s.regs, eventId, a) })),
      // Откатываем, только если наш ответ ещё стоит: пока PUT летел, пользователь мог
      // выбрать другой (и тот уже сохранился) — иначе сотрём чужую запись насовсем.
      rollback: () => set((s) => (s.regs[eventId] === a ? { regs: withReg(s.regs, eventId, prev) } : {})),
      call: () => api.setEventReg(numeric, a),
      okRu: 'Ответ сохранён', okKz: 'Жауап сақталды',
      errRu: 'Не удалось сохранить ответ', errKz: 'Жауапты сақтау мүмкін болмады',
    });
  },

  unregisterEvent: (eventId) => {
    const numeric = eventNumericId(eventId);
    if (numeric == null) {
      toast(isRu() ? 'Этот сбор недоступен для записи' : 'Бұл жиынға жазылу мүмкін емес');
      return;
    }
    const prev = get().regs[eventId];
    return commit({
      apply: () => set((s) => ({ regs: withReg(s.regs, eventId, null) })),
      // Тот же guard, что в registerEvent: записи может уже не быть нашей — apply писал
      // null, поэтому откатываем, только пока ключ так и остаётся снятым.
      rollback: () => set((s) => (s.regs[eventId] == null ? { regs: withReg(s.regs, eventId, prev) } : {})),
      call: () => api.deleteEventReg(numeric),
      okRu: 'Запись отменена', okKz: 'Жазылу тоқтатылды',
      errRu: 'Не удалось отменить запись', errKz: 'Жазылуды тоқтату мүмкін болмады',
    });
  },

  // --- анимация числа прогноза ---
  animateForecast: (fromZero) => {
    const target = get().forecast().E;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      set({ displayE: target });
      return;
    }
    if (rafId) cancelAnimationFrame(rafId);
    if (cuFallback) clearTimeout(cuFallback);
    const cur = get().displayE;
    const from = fromZero ? 0 : cur == null ? target : cur;
    const dur = fromZero ? 640 : 420;
    const start = performance.now();
    set({ displayE: from });
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      if (p >= 1) set({ displayE: target });
      else {
        set({ displayE: from + (target - from) * e });
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    cuFallback = setTimeout(() => set({ displayE: target }), dur + 240);
  },

  // --- реальный polling каждые 10с (delta по revision) ---
  startPoll: () => {
    if (pollTimer) clearTimeout(pollTimer);
    const tick = async () => {
      const g = get().gathering;
      const since = g.revision == null ? -1 : g.revision;
      try {
        const res = await api.poll(g.id, since);
        if (res && res.changed && res.changed.length) {
          set((s) => ({
            gathering: { ...s.gathering, participants: mergeChanged(s.gathering.participants, res.changed), revision: res.revision },
          }));
          get().animateForecast(false);
        } else if (res && typeof res.revision === 'number') {
          set((s) => ({ gathering: { ...s.gathering, revision: res.revision } }));
        }
      } catch (_) {
        /* офлайн — тихо ждём следующего тика */
      }
      pollTimer = setTimeout(tick, 10000);
    };
    pollTimer = setTimeout(tick, 10000);
  },
  stopPoll: () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  },
}));

// Появилась сеть → флашим офлайн-очередь отметок; пропала → помечаем офлайн.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useGatheringStore.setState({ online: true });
    useGatheringStore.getState().flushCheckin();
  });
  window.addEventListener('offline', () => useGatheringStore.setState({ online: false }));
}

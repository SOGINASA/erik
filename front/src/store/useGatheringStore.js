import { create } from 'zustand';
import { buildGathering, EVENTS } from '../lib/data';
import { counts } from '../lib/forecast';
import { fromServer, fromParticipants } from '../lib/forecastView';
import { api } from '../lib/api';
import { commit, isOffline, isForbidden } from '../lib/optimistic';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';
import { usePlatformStore } from './usePlatformStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const curLang = () => (isRu() ? 'ru' : 'kz');
const toast = (text) => useUiStore.getState().showToast(text);

// Столько же, сколько GATHERING_ROLE_MAX на бэке (models.py). Лишние строки бэк молча
// отбрасывает, но давать их набрать в шторке — врать про то, что они сохранятся.
const ROLES_MAX = 8;

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

// Числовой id события ТОЛЬКО если лента реально серверная. Пока usePlatformStore.events —
// та же ссылка, что мок EVENTS (офлайн/сбой загрузки), демо-'e4' численно совпадает с
// реальным сбором №4, и RSVP ушёл бы на ЧУЖОЙ настоящий сбор. Тот же признак источника,
// что и feedGatheringId в Event.jsx / useOrganizerStore.
const serverEventId = (id) => {
  if (usePlatformStore.getState().events === EVENTS) return null;
  return eventNumericId(id);
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

// Прогноз из офлайн-снапшота: в localStorage лежит весь ответ сервера, включая
// forecast. Показываем его помеченным stale, а не подменяем молча локальной
// формулой — молчаливая подмена и есть та проблема, за которую критиковали.
const staleForecast = (snap) => (snap && snap.forecast ? fromServer(snap.forecast, { stale: true }) : null);

// Данные текущего сбора + отметки явки + анимация числа прогноза.
// Оптимистичные мутации: сначала локально, затем в API; при офлайне остаёмся на моках.
// Подправить счётчик «идут» у события ленты (usePlatformStore): going считает только 'yes'.
const bumpGoing = (eventId, d) => {
  if (!d) return;
  const ev = usePlatformStore.getState().events.find((e) => e.id === eventId);
  if (ev && typeof ev.going === 'number') usePlatformStore.getState().setEventGoing(eventId, Math.max(0, ev.going + d));
};

export const useGatheringStore = create((set, get) => ({
  gathering: buildGathering(),
  myGatherings: [],   // список своих сборов (для /me), с сервера
  marks: {},
  displayE: null,
  polled: false,
  regs: {}, // ответы на события ленты: { [eventId]: 'yes'|'maybe'|'no' }
  // Прогноз с сервера — ЕДИНСТВЕННЫЙ источник числа на экране. Считается моделью
  // (source:'model'); формула включается, только если модель недоступна, и тогда
  // это видно в подписи. null = ещё не приезжал (показываем скелетон, не выдумку).
  serverForecast: null,
  mlForecast: null, // поимённая раскладка модели: { available, participants[] } | { available:false }
  checkinQueue: [], // несинканные офлайн-отметки явки
  syncing: false,   // идёт batch-синк
  online: isOnline(),
  guestError: null, // гостевой экран: null | 'notfound' (сбора нет) | 'offline' (нет сети)
  // Черновик ролей для НЕсозданного сбора (форма NewGathering). Живёт здесь, а не в
  // useState шторки: диспетчер шторок размонтирует компонент при закрытии (Sheets.jsx),
  // и тап по бэкдропу или Esc стёр бы весь набор, пока форма создания остаётся открытой.
  // Строка: {titleRu, titleKz, capacity, newbie, preset}.
  draftRoles: [],

  // --- производные ---
  // Прогноз: серверный, если он есть. Фолбэк на локальную формулу — только когда
  // сервера нет вовсе (демо-сбор без пары, офлайн без кэша), и он честно помечен.
  forecastView: () => {
    const s = get();
    if (s.serverForecast) return s.serverForecast;
    const g = s.gathering || {};
    return fromParticipants(g.participants || [], g.ctx, g.needed, {
      demo: !!g.demo, reason: 'no_server_forecast',
    });
  },
  counts: () => {
    const s = get();
    if (s.serverForecast && s.serverForecast.counts) return s.serverForecast.counts;
    return counts(get().gathering.participants || []);
  },

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
      // Роли — из черновика шторки, а не из form: набор правится в RolesSheet и живёт
      // срезом стора. Ключ перечисляем ЯВНО, как и всё остальное тело: забыть его здесь
      // значит молча создать сбор без ролей (тот же класс потери, что был с theme/cityId).
      roles: get().draftRoles.length ? get().draftRoles : undefined,
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
    // Черновик ролей сбрасываем ТОЛЬКО после успешного создания: стор переживает
    // навигацию, и без этого следующий сбор унаследовал бы роли предыдущего. При провале
    // набор остаётся — форма открыта, человек повторит отправку.
    set({ gathering: res.gathering, marks: deriveMarks(res.gathering.participants), displayE: null, polled: false,
          serverForecast: fromServer(res.gathering.forecast), draftRoles: [] });
    return res;
  },

  // --- черновик ролей (форма создания сбора) ---
  setDraftRoles: (rows) => set({ draftRoles: rows.slice(0, ROLES_MAX) }),
  addDraftRole: (row) => set((s) => (
    s.draftRoles.length >= ROLES_MAX || !row.titleRu.trim()
      // Дубликат по названию — не ошибка ввода, а повторный тап по чипу пресета:
      // молча игнорируем, иначе бэк вернул бы 400 на ровном месте.
      || s.draftRoles.some((r) => r.titleRu.trim().toLowerCase() === row.titleRu.trim().toLowerCase())
      ? {}
      : { draftRoles: [...s.draftRoles, row] }
  )),
  patchDraftRole: (i, patch) => set((s) => ({
    draftRoles: s.draftRoles.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
  })),
  removeDraftRole: (i) => set((s) => ({ draftRoles: s.draftRoles.filter((_, idx) => idx !== i) })),
  resetDraftRoles: () => set({ draftRoles: [] }),

  // --- роли существующего сбора ---
  // force=true подтверждает удаление роли, на которой есть люди. Возвращаем сырой
  // результат commit: шторке нужен 409 с conflicts, чтобы спросить подтверждение.
  saveRoles: async (roles, force = false) => {
    const id = get().gathering.id;
    const numeric = eventNumericId(id);
    if (numeric == null) {
      toast(isRu() ? 'Роли доступны только на реальном сборе' : 'Рөлдер тек нақты жиында қолжетімді');
      return { ok: false };
    }
    const r = await commit({
      call: () => api.setGatheringRoles(numeric, roles, force),
      okRu: 'Роли сохранены', okKz: 'Рөлдер сақталды',
      errRu: 'Не удалось сохранить роли', errKz: 'Рөлдерді сақтау мүмкін болмады',
      // 409 = «на роль записались» либо «вместимость ниже занятого»: это не сбой, а
      // вопрос к координатору. Тост тут только помешает — шторка покажет своё.
      silent: (err) => err && err.status === 409,
    });
    if (r.ok && r.data) set((s) => ({ gathering: { ...s.gathering, roles: r.data.roles } }));
    return r;
  },

  // Координатор ставит участнику роль (PersonSheet). Вместимость на бэке здесь мягкая:
  // он видит человека перед собой, и отказ «мест нет» ему возвращать поздно — роль честно
  // нарисуется «3 из 2». Обновляем и ростер, и счётчики ролей из ответа.
  setParticipantRole: async (pid, roleId) => {
    const gid = get().gathering.id;
    const numeric = eventNumericId(gid);
    if (numeric == null) return { ok: false };
    const r = await commit({
      call: () => api.setParticipantRole(numeric, pid, roleId),
      errRu: 'Не удалось изменить роль', errKz: 'Рөлді өзгерту мүмкін болмады',
    });
    if (r.ok && r.data) {
      set((s) => ({
        gathering: {
          ...s.gathering,
          roles: r.data.roles,
          participants: s.gathering.participants.map((x) => (x.id === pid ? { ...x, ...r.data.participant } : x)),
        },
      }));
    }
    return r;
  },

  loadCoord: async (id) => {
    set({ mlForecast: null, serverForecast: null }); // сбрасываем прогноз прошлого сбора
    const numeric = eventNumericId(id); // 'e5' из ленты → '5'
    if (numeric == null) {
      // Демо-сбор без серверной пары ('ed1'): в API не идём — вернулся бы чужой сбор.
      const snap = readJSON(CI_G(String(id)), null);
      if (snap) set({ gathering: snap, marks: deriveMarks(snap.participants), checkinQueue: readJSON(CI_Q(String(id)), []), serverForecast: staleForecast(snap) });
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
      writeJSON(CI_G(gid), gathering); // снапшот для перезагрузки офлайн (вместе с forecast и p_i)
      set({ gathering, marks: deriveMarks(participants), checkinQueue: queue, polled: false,
            serverForecast: fromServer(res.gathering.forecast) });
      if (queue.length) get().flushCheckin();
    } catch (_) {
      // офлайн: восстанавливаем сбор и очередь из localStorage. Прогноз из снапшота
      // помечаем stale — показывать вчерашнее число как живое нельзя.
      const snap = readJSON(CI_G(numeric), null);
      if (snap) set({ gathering: snap, marks: deriveMarks(snap.participants), checkinQueue: readJSON(CI_Q(numeric), []), serverForecast: staleForecast(snap) });
    }
  },

  // Перечитать прогноз после ручной правки ростера: модель пересчитывает не только
  // сумму, но и вероятность каждого — ждать следующего тика поллинга (до 10 с) на
  // экране, где координатор только что изменил ответ, было бы враньём.
  refreshForecast: async () => {
    const numeric = eventNumericId(get().gathering.id);
    if (numeric == null) return;
    try {
      const f = await api.forecast(numeric);
      set({ serverForecast: fromServer(f) });
      get().animateForecast(false);
    } catch (_) {
      /* офлайн — на экране остаётся прошлое число, поллинг догонит */
    }
  },

  // Полная поимённая раскладка модели (вероятность КАЖДОГО участника, не только
  // «на грани»). Экрану координатора это больше не нужно: агрегат, сегменты и список
  // для напоминания приезжают вместе со сбором, а p_i — прямо в participants[].p.
  // Оставлено как точка для отладки и будущих экранов; автоматически НЕ вызывается,
  // чтобы не делать лишний запрос на каждое открытие сбора.
  loadMlForecast: async () => {
    const numeric = eventNumericId(get().gathering.id);
    if (numeric == null) { set({ mlForecast: { available: false, reason: 'demo' } }); return; }
    try {
      const r = await api.mlForecast(numeric);
      set({ mlForecast: r });
    } catch (err) {
      set({ mlForecast: { available: false, reason: (err && err.status === 403) ? 'forbidden' : 'offline' } });
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
      set((s) => (s.gathering ? { gathering: {
        ...s.gathering, comingCount: res.comingCount, myAnswer: answer,
        // Ответ 'no' освобождает место — сервер уже это сделал, отражаем и локально,
        // иначе блок выбора роли остался бы с чужой подписью.
        roles: res.roles || s.gathering.roles, myRoleId: res.roleId,
      } } : {}));
      return { ok: true, data: res };
    } catch (err) {
      // Не глотаем: возвращаем различимый результат, чтобы экран откатил оптимистичный
      // ответ и показал правду (напр. 409 «Сбор уже завершён»). Ср. commit() в lib/optimistic.
      return { ok: false, error: err };
    }
  },

  // Выбор роли на гостевом экране — ПОСЛЕ того, как запись уже прошла. Отдельным PUT,
  // потому что RSVP остаётся одно-тапным и роль не должна его задерживать.
  // Идёт через commit: без него офлайн-провал выглядел бы успехом (роль видна локально,
  // сервер о ней не знает) — ровно тот класс бага, что уже чинили в этом сторе.
  pickGuestRole: async (code, roleId) => {
    const answer = (get().gathering && get().gathering.myAnswer) || 'yes';
    const r = await commit({
      call: () => api.putRsvp(code, answer, { roleId }),
      okRu: 'Роль выбрана', okKz: 'Рөл таңдалды',
      errRu: 'Не удалось выбрать роль', errKz: 'Рөлді таңдау мүмкін болмады',
      silent: (err) => err && err.status === 409,   // «роль разобрали» — экран скажет сам
    });
    // Актуальные роли приходят и в успехе, и в теле 409: перерисовываем остатки сразу.
    const fresh = r.ok ? (r.data && r.data.roles) : (r.error && r.error.data && r.error.data.roles);
    set((s) => (s.gathering ? { gathering: {
      ...s.gathering,
      roles: fresh || s.gathering.roles,
      myRoleId: r.ok ? roleId : s.gathering.myRoleId,
    } } : {}));
    return r;
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
      apply: () => { writeAnswer(a); get().refreshForecast(); },
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
      // staleBase — сигнал бэка, что наш baseRevision отстал (со-координатор изменил ростер).
      // Перечитываем сбор, чтобы чужие добавления/удаления доехали (на экране отметки поллинга
      // нет). Очередь после успешного синка пуста, поэтому loadCoord не зациклит flushCheckin.
      if (res.staleBase && !get().checkinQueue.length) get().loadCoord(String(gid));
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
      apply: () => {
        set((s) => ({
          gathering: { ...s.gathering, participants: s.gathering.participants.filter((p) => p.id !== id) },
        }));
        get().refreshForecast();
      },
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
      // Норма (needed) участвует в вердикте и в «не хватит N» — эти поля считает
      // сервер, поэтому после сохранения прогноз надо перечитать, иначе степпер в
      // шторке уже показывает новое число, а строка нормы держит старое.
      call: async () => {
        const r = await api.patchGathering(g.id, {
          what: g.titleRu, where: g.placeRu,
          titleKz: g.titleKz, placeKz: g.placeKz,
          needed: g.needed,
          // Тема/город/орг/обложка правятся в шторке настроек — без них PATCH откатывал бы
          // их к серверным. Имена в ТЕЛЕ — theme/cityId/orgId/imageUrl (см. patchGathering),
          // а в объекте gathering обложка лежит под image (serialize_gathering_owner).
          theme: g.theme, cityId: g.cityId, orgId: g.orgId, imageUrl: g.image,
        });
        // Тема сбора — тоже вход модели (event_type), так что перечитываем и после её правки.
        get().refreshForecast();
        return r;
      },
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

  // roleId (необязателен) — роль волонтёра на сборе. Обычный путь ленты его НЕ шлёт:
  // запись остаётся одно-тапной, а роль досылается вторым вызовом уже после успеха
  // (см. pickEventRole). Возвращаем результат commit наружу — вызывающему экрану надо
  // знать, что запись реально прошла, прежде чем предлагать выбрать роль.
  registerEvent: (eventId, a, roleId) => {
    const numeric = serverEventId(eventId);
    if (numeric == null) {
      toast(isRu() ? 'Этот сбор недоступен для записи' : 'Бұл жиынға жазылу мүмкін емес');
      // Раньше возвращалось undefined, и вызывающий не мог отличить «не отправляли»
      // от успеха — на демо-ленте это открывало бы шторку роли поверх несуществующей записи.
      return Promise.resolve({ ok: false });
    }
    const prev = get().regs[eventId];
    // «идут» считает только 'yes' — счётчик двигаем по переходу prev → a (оптимистично,
    // с откатом при ошибке). Фронт и бэк считают одинаково, поэтому дельта точная.
    const delta = (a === 'yes' ? 1 : 0) - (prev === 'yes' ? 1 : 0);
    return commit({
      apply: () => { set((s) => ({ regs: withReg(s.regs, eventId, a) })); bumpGoing(eventId, delta); },
      // Откатываем, только если наш ответ ещё стоит: пока PUT летел, пользователь мог
      // выбрать другой (и тот уже сохранился) — иначе сотрём чужую запись насовсем.
      rollback: () => { if (get().regs[eventId] !== a) return; bumpGoing(eventId, -delta); set((s) => ({ regs: withReg(s.regs, eventId, prev) })); },
      call: () => api.setEventReg(numeric, a, roleId ? { roleId } : {}),
      okRu: 'Ответ сохранён', okKz: 'Жауап сақталды',
      errRu: 'Не удалось сохранить ответ', errKz: 'Жауапты сақтау мүмкін болмады',
    });
  },

  // Выбор роли ПОСЛЕ записи (событие ленты). Отдельный вызов, а не часть registerEvent:
  // запись должна состояться даже если человек роль не выберет, а роль — не должна
  // блокировать запись. Идёт через commit, поэтому офлайн честно откатится и стостится:
  // без этого человек видел бы выбранную роль локально, а сервер о ней не знал.
  pickEventRole: async (eventId, roleId) => {
    const numeric = serverEventId(eventId);
    if (numeric == null) return { ok: false };
    const answer = get().regs[eventId] || 'yes';
    const r = await commit({
      call: () => api.setEventReg(numeric, answer, { roleId }),
      okRu: 'Роль выбрана', okKz: 'Рөл таңдалды',
      errRu: 'Не удалось выбрать роль', errKz: 'Рөлді таңдау мүмкін болмады',
      // 409 «роль уже разобрали» — не сбой связи, а гонка за место: экран покажет свой
      // текст и перерисует остатки из тела ответа.
      silent: (err) => err && err.status === 409,
    });
    // Свежие роли (с актуальным taken) приезжают и в успехе, и в 409 — кладём их в ленту,
    // чтобы счётчики «3 из 5» не остались устаревшими на карточке события.
    const fresh = r.ok ? (r.data && r.data.roles) : (r.error && r.error.data && r.error.data.roles);
    if (fresh) usePlatformStore.getState().patchEventRoles(eventId, fresh, r.ok ? roleId : undefined);
    return r;
  },

  unregisterEvent: (eventId) => {
    const numeric = serverEventId(eventId);
    if (numeric == null) {
      toast(isRu() ? 'Этот сбор недоступен для записи' : 'Бұл жиынға жазылу мүмкін емес');
      return;
    }
    const prev = get().regs[eventId];
    const delta = prev === 'yes' ? -1 : 0;   // снятие 'yes' уменьшает «идут»
    return commit({
      apply: () => { set((s) => ({ regs: withReg(s.regs, eventId, null) })); bumpGoing(eventId, delta); },
      // Тот же guard, что в registerEvent: записи может уже не быть нашей — apply писал
      // null, поэтому откатываем, только пока ключ так и остаётся снятым.
      rollback: () => { if (get().regs[eventId] != null) return; bumpGoing(eventId, -delta); set((s) => ({ regs: withReg(s.regs, eventId, prev) })); },
      call: () => api.deleteEventReg(numeric),
      okRu: 'Запись отменена', okKz: 'Жазылу тоқтатылды',
      errRu: 'Не удалось отменить запись', errKz: 'Жазылуды тоқтату мүмкін болмады',
    });
  },

  // --- анимация числа прогноза ---
  animateForecast: (fromZero) => {
    const view = get().forecastView();
    const target = view ? view.expected : 0;
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
        // Свежий серверный прогноз приезжает В КАЖДОМ тике поллинга — отдельного
        // запроса не нужно. Раньше это поле молча выбрасывалось, и число на экране
        // жило своей жизнью от клиентской формулы.
        if (res && res.forecast) set({ serverForecast: fromServer(res.forecast) });
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

import { create } from 'zustand';
import { buildOrgEvents, buildApplications, buildOrgVolunteers, estimateAttendance, plural, EVENTS } from '../lib/data';
import { api } from '../lib/api';
import { commit } from '../lib/optimistic';
import { useUiStore } from './useUiStore';
import { useSessionStore } from './useSessionStore';
import { usePlatformStore } from './usePlatformStore';
import { useGatheringStore } from './useGatheringStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);

// Кто сейчас в сессии. Токен в признак НЕ входит: onAuthRefresh молча меняет его
// посреди сессии, и сброс штаба по нему стирал бы данные без повторной загрузки.
const identityOf = (s) => [s.loggedIn ? 1 : 0, s.userType || '', s.role || '', s.name || ''].join('|');

// Лента платформы держит id событий как 'e'+<число> и для сервера, и для демо
// (usePlatformStore.mapEvent), поэтому по одному id реальный сбор от выдуманного не
// отличить. Признак — сама коллекция: пока events это ТА ЖЕ ссылка, что мок EVENTS,
// ответ сервера ещё не приходил и слать заявку некуда. Раньше здесь стоял
// replace(/^\D+/, ''), и демо-'e9' уходил заявкой на ЧУЖОЙ настоящий сбор №9.
const feedGatheringId = (eventId) => {
  if (usePlatformStore.getState().events === EVENTS) return null;
  const m = /^e(\d+)$/.exec(String(eventId));
  return m ? m[1] : null;
};

// accept и decline отличаются только статусом, счётчиком yes и текстами.
const DECISION = {
  accept: {
    status: 'accepted', yes: 1,
    okRu: 'Заявка принята', okKz: 'Өтінім қабылданды',
    errRu: 'Не удалось принять заявку', errKz: 'Өтінімді қабылдау мүмкін болмады',
  },
  decline: {
    status: 'declined', yes: 0,
    okRu: 'Заявка отклонена', okKz: 'Өтінім қабылданбады',
    errRu: 'Не удалось отклонить заявку', errKz: 'Өтінімнен бас тарту мүмкін болмады',
  },
};

// Решение по заявке: оптимистично локально → API → откат при ошибке.
async function decide(set, get, id, action) {
  const d = DECISION[action];
  const prevApp = get().applications.find((x) => x.id === id);
  if (!prevApp) return { ok: false };
  const prevEvent = get().events.find((e) => e.id === prevApp.eventId) || null;

  const apply = () => set((s) => ({
    applications: s.applications.map((x) => (x.id === id ? { ...x, status: d.status } : x)),
    // принятый волонтёр пополняет «подтвердивших» своего сбора, заявка уходит из ожидающих
    events: prevEvent
      ? s.events.map((e) => (e.id === prevEvent.id ? { ...e, yes: e.yes + d.yes, applied: Math.max(0, e.applied - 1) } : e))
      : s.events,
  }));
  // Откат точечный: заявке возвращаем снимок ДО, а счётчикам сбора — ОБРАТНУЮ
  // дельту, а не снимок объекта. Снимок затёр бы решение по соседней заявке того же
  // сбора, принятое пока летел запрос: его +1 yes / -1 applied пропали бы вместе с
  // объектом (свой rollback у него не сработал бы — запрос прошёл успешно).
  const rollback = () => set((s) => ({
    applications: s.applications.map((x) => (x.id === id ? prevApp : x)),
    events: prevEvent
      ? s.events.map((e) => (e.id === prevEvent.id ? { ...e, yes: Math.max(0, e.yes - d.yes), applied: e.applied + 1 } : e))
      : s.events,
  }));

  useUiStore.getState().closeSheet();

  // Демо: за 'a1' нет серверной заявки. Раньше id резался до '1' и решение уходило
  // POST /applications/1/<action> — по ЧУЖОЙ настоящей заявке. Меняем только локально.
  if (get().source === 'demo') {
    apply();
    toast(isRu() ? d.okRu : d.okKz);
    return { ok: true };
  }
  // id вербатим — он серверный (serialize_application отдаёт целое число).
  return commit({
    apply, rollback,
    call: () => api.actOnApplication(id, action),
    okRu: d.okRu, okKz: d.okKz, errRu: d.errRu, errKz: d.errKz,
  });
}

// Честная пометка источника для экранов штаба. null — показывать нечего.
// Гостю не показываем: он смотрит демо-витрину, для него это норма.
export function orgNotice(source, status, isRuLang, loggedIn) {
  if (!loggedIn) return null;
  if (status === 'error') {
    return {
      tone: 'error',
      text: source === 'demo'
        ? (isRuLang ? 'Не удалось загрузить данные штаба — на экране демо-данные' : 'Штаб деректерін жүктеу мүмкін болмады — экранда демо-деректер')
        : (isRuLang ? 'Не удалось обновить данные — на экране последние загруженные' : 'Деректерді жаңарту мүмкін болмады — экранда соңғы жүктелгені'),
      retry: true,
    };
  }
  if (source === 'demo' && status !== 'loading') {
    return {
      tone: 'demo',
      text: isRuLang
        ? 'Демо-данные: сборы, заявки и волонтёры придуманы для показа'
        : 'Демо-деректер: жиындар, өтінімдер мен волонтёрлер көрсетілім үшін ойдан шығарылған',
      retry: false,
    };
  }
  return null;
}

// Штаб организатора: его сборы, входящие заявки волонтёров и база волонтёров.
// Источник данных явный: source='demo' — встроенная синтетика lib/data,
// source='server' — ответ API. Мутации по демо-данным НИКОГДА не уходят в сеть,
// мутации по серверным идут с id ВЕРБАТИМ — снятия мок-префиксов здесь нет.
export const useOrganizerStore = create((set, get) => ({
  events: buildOrgEvents(),
  applications: buildApplications(),
  volunteers: buildOrgVolunteers(),
  // Признак один на все три коллекции: они грузятся одним load() и ссылаются друг на
  // друга (заявка → eventId сбора). Смесь реальных заявок с демо-сборами дала бы
  // битые заголовки и правку счётчиков не того сбора.
  source: 'demo',            // 'demo' | 'server'
  status: 'idle',            // 'idle' | 'loading' | 'ready' | 'error'
  error: null,
  analytics: null,           // ответ /me/org/analytics: настоящие часы и точность прогноза
  analyticsStatus: 'idle',   // 'idle' | 'loading' | 'ready' | 'error'
  volSort: 'reliability', // 'reliability' | 'hours' | 'events'
  reqFilter: 'pending',   // 'pending' | 'all' | 'done'

  // --- производные ---
  // Заявки, ждущие решения организатора.
  pendingCount: () => get().applications.filter((a) => a.status === 'pending').length,

  // Прогноз явки по одному сбору (агрегатная оценка).
  forecastFor: (e) => estimateAttendance(e.yes, e.maybe),

  setVolSort: (volSort) => set({ volSort }),
  setReqFilter: (reqFilter) => set({ reqFilter }),

  // --- загрузка ---
  // Успех ставим КАК ЕСТЬ, даже если массив пустой: пустой ответ — это честное
  // «сборов пока нет», а не повод показать шесть выдуманных (раньше проверка
  // res.X.length гасила пустой ответ, и организатор без сборов видел демо).
  load: async () => {
    set({ status: 'loading', error: null });
    const [ev, ap, vol] = await Promise.allSettled([api.orgEvents(), api.myApplications(), api.orgVolunteers()]);
    const failed = [ev, ap, vol].find((r) => r.status === 'rejected');
    if (failed) {
      // Всё или ничего: половину реальных данных с половиной демо мешать нельзя.
      // Остаёмся на том, что уже показано, и говорим об ошибке.
      set({ status: 'error', error: failed.reason || null });
      return;
    }
    const arr = (r, key) => (r.value && Array.isArray(r.value[key]) ? r.value[key] : []);
    set({
      events: arr(ev, 'events'),
      applications: arr(ap, 'applications'),
      volunteers: arr(vol, 'volunteers'),
      source: 'server', status: 'ready', error: null,
    });
  },

  // Аналитика штаба: hoursTotal — РЕАЛЬНАЯ сумма AttendanceRecord.hours_credited
  // (на дашборде вместо прежнего выдуманного came × 4). На демо-данных не спрашиваем:
  // серверные числа не про эти придуманные сборы, лучше прочерк.
  loadAnalytics: async () => {
    if (get().source !== 'server') {
      set({ analytics: null, analyticsStatus: 'idle' });
      return;
    }
    set({ analyticsStatus: 'loading' });
    try {
      const res = await api.orgAnalytics();
      const a = (res && res.analytics) || null;
      set({ analytics: a, analyticsStatus: a ? 'ready' : 'error' });
    } catch (_) {
      set({ analytics: null, analyticsStatus: 'error' }); // покажем прочерк, выдумывать нечего
    }
  },

  // --- решения по заявкам ---
  acceptApplication: (id) => decide(set, get, id, 'accept'),
  declineApplication: (id) => decide(set, get, id, 'decline'),

  // Массовое решение (accept|decline) пачкой заявок. Локально — те же статус и
  // счётчики сбора, что и одиночное decide(): accept добавляет yes и убавляет
  // applied, decline только убавляет applied. Отличие в ответе: он частичный
  // ({updated:[id], failed:[{id, error}]}), поэтому commit() ловит лишь полный
  // провал запроса (сеть/403 — целиком откатит и тостит сам), а НЕ проведённые
  // заявки (failed) откатываем поштучно и объясняем тостом уже после ответа.
  bulkDecide: async (ids, action) => {
    const d = DECISION[action];
    if (!d) return { updated: [], failed: [] };

    // Берём только заявки, реально лежащие в штабе; дубли id схлопываем — иначе одна
    // заявка задвоила бы дельту счётчиков своего сбора.
    const seen = new Set();
    const targets = [];
    for (const id of ids || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const prevApp = get().applications.find((x) => x.id === id);
      if (prevApp) targets.push({ id, prevApp, eventId: prevApp.eventId });
    }
    if (targets.length === 0) return { updated: [], failed: [] };

    // Провести (forward) или откатить (forward=false) решение для подмножества
    // заявок: статусу — целевой либо снимок ДО, счётчикам сбора — СУММАРНАЯ дельта
    // по его заявкам из подмножества (обратная дельта, а не снимок объекта — по той
    // же причине, что в decide(): не затереть решение по соседней заявке того же сбора).
    const mutate = (idSet, forward) => set((s) => {
      const pick = targets.filter((t) => idSet.has(t.id));
      if (pick.length === 0) return {};
      const delta = new Map(); // eventId -> { yes, applied }
      pick.forEach((t) => {
        const cur = delta.get(t.eventId) || { yes: 0, applied: 0 };
        cur.yes += forward ? d.yes : -d.yes;
        cur.applied += forward ? -1 : 1;
        delta.set(t.eventId, cur);
      });
      const byId = new Map(pick.map((t) => [t.id, t]));
      return {
        applications: s.applications.map((x) => {
          const t = byId.get(x.id);
          if (!t) return x;
          return forward ? { ...x, status: d.status } : t.prevApp;
        }),
        events: s.events.map((e) => {
          const dd = delta.get(e.id);
          return dd ? { ...e, yes: Math.max(0, e.yes + dd.yes), applied: Math.max(0, e.applied + dd.applied) } : e;
        }),
      };
    });

    const allIds = new Set(targets.map((t) => t.id));
    const apply = () => mutate(allIds, true);
    const rollback = () => mutate(allIds, false);

    // Демо: серверных заявок за этими id нет — меняем только локально, как decide().
    if (get().source === 'demo') {
      apply();
      toast(isRu() ? d.okRu : d.okKz);
      return { updated: [...allIds], failed: [] };
    }

    // Полный провал запроса (сеть/403/500) commit() откатит целиком и тостит сам.
    const r = await commit({
      apply, rollback,
      call: () => api.bulkApplications([...allIds], action), // id вербатим — серверные
      errRu: d.errRu, errKz: d.errKz,
    });
    if (!r.ok) return { updated: [], failed: [...allIds].map((id) => ({ id, error: r.error })) };

    // Ответ 200, но, возможно, частичный: чужую/закрытую заявку сервер вернёт в
    // failed. Такие откатываем поштучно, updated оставляем применёнными.
    const res = r.data || {};
    const updated = Array.isArray(res.updated) ? res.updated : [];
    const failed = Array.isArray(res.failed) ? res.failed : [];
    const failIds = new Set(failed.map((f) => (f && typeof f === 'object' ? f.id : f)));
    const revert = new Set(targets.filter((t) => failIds.has(t.id)).map((t) => t.id));
    if (revert.size > 0) mutate(revert, false);

    if (failed.length > 0) {
      const n = failed.length;
      // причины бэк отдаёт по-русски — в KZ не подмешиваем, там только счётчик.
      const reasons = [...new Set(failed.map((f) => f && f.error).filter(Boolean))];
      toast(isRu()
        ? `Не удалось обработать ${n} ${plural(n, ['заявку', 'заявки', 'заявок'])}${reasons.length ? ': ' + reasons.join(', ') : ''}`
        : `${n} өтінім өңделмеді`);
    } else {
      toast(isRu() ? d.okRu : d.okKz);
    }
    return { updated, failed };
  },

  // Найти/создать диалог с волонтёром. Возвращает id диалога или null (тост уже показан) —
  // навигацию делает экран, стор о роутере не знает.
  openConversationWith: async (v) => {
    // Демо: 'ov1' резался до '1' и открывал чат со СЛУЧАЙНЫМ настоящим юзером.
    if (get().source === 'demo') {
      toast(isRu()
        ? 'Это демо-данные — чат с этим волонтёром не открыть'
        : 'Бұл демо-деректер — бұл волонтёрмен чат ашылмайды');
      return null;
    }
    // commit без apply/rollback: локально менять нечего, нужен только честный тост ошибки.
    const r = await commit({
      call: () => api.createConversation(v.id), // id вербатим (serialize_org_volunteer → User.id)
      errRu: 'Не удалось открыть чат', errKz: 'Чатты ашу мүмкін болмады',
    });
    if (!r.ok) return null; // причину уже показал commit
    const c = r.data && r.data.conversation;
    if (!c || c.id == null) {
      // ответ без диалога — молча уходить некуда, честнее сказать
      toast(isRu() ? 'Не удалось открыть чат' : 'Чатты ашу мүмкін болмады');
      return null;
    }
    return c.id;
  },

  // «Напомнить» из карточки внимания: шторка напоминания работает с useGatheringStore,
  // поэтому сначала грузим туда сбор, потом открываем шторку. Раньше кнопка только
  // уводила на /c/<id>, а обещанную шторку не открывала.
  remindFor: async (eventId) => {
    if (get().source === 'demo') {
      toast(isRu()
        ? 'Это демо-сбор — напоминание отправляется только по настоящему'
        : 'Бұл демо-жиын — еске салу тек нақты жиын бойынша жіберіледі');
      return false;
    }
    await useGatheringStore.getState().loadCoord(eventId);
    // loadCoord глотает ошибку и оставляет прошлый сбор — напомнили бы не про тот.
    if (String(useGatheringStore.getState().gathering.id) !== String(eventId)) {
      toast(isRu() ? 'Не удалось открыть сбор — попробуйте ещё раз' : 'Жиынды ашу мүмкін болмады — қайталап көріңіз');
      return false;
    }
    useUiStore.getState().openSheet('remind');
    return true;
  },

  // Пересдать отклонённый сбор: на бэке 'rejected' → 'pending', причина сбрасывается.
  // Оптимистично уводим карточку из «отклонённых» в активные, при успехе перечитываем
  // список (статус/поля берём авторитетно с сервера), при ошибке — откат (стиль decide()).
  resubmit: async (id) => {
    const prev = get().events.find((e) => e.id === id);
    if (!prev) return { ok: false };
    // Демо: за таким сбором сервера нет — как в remindFor/openConversationWith.
    if (get().source === 'demo') {
      toast(isRu()
        ? 'Это демо-сбор — пересдать можно только настоящий'
        : 'Бұл демо-жиын — тек нақты жиынды қайта тапсыруға болады');
      return { ok: false };
    }
    const apply = () => set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, status: 'pending', rejectReason: null } : e)),
    }));
    const rollback = () => set((s) => ({
      events: s.events.map((e) => (e.id === id ? prev : e)),
    }));
    const r = await commit({
      apply, rollback,
      call: () => api.resubmitGathering(id), // id вербатим — серверный
      okRu: 'Сбор отправлен на повторную модерацию', okKz: 'Жиын қайта модерацияға жіберілді',
      errRu: 'Не удалось пересдать сбор', errKz: 'Жиынды қайта тапсыру мүмкін болмады',
    });
    if (r.ok) get().load(); // перечитываем список — отклонённый уходит, статус актуален
    return r;
  },

  // Заявка волонтёра из карточки события (встречный поток). В коллекцию штаба её НЕ
  // кладём: applications — это ВХОДЯЩИЕ заявки на СВОИ сборы (/me/org/applications),
  // а тут исходящая на ЧУЖОЙ. Раньше строка ленты ('e42' / 'a<ts>') падала прямо в штаб
  // мимо get().source — и по ней шли решения: при source='demo' decide() «принимал»
  // НАСТОЯЩУЮ заявку локально, не отправив ничего на сервер, а при source='server'
  // в реальный список входящих попадал фантом с пустым заголовком и вечным 403.
  // Имя/телефон/город сюда больше не нужны: PII берёт сервер из профиля.
  addApplication: async ({ eventId, skills, message }) => {
    const gid = feedGatheringId(eventId);
    if (gid === null) return { ok: true }; // демо-лента: за этим id сервера нет
    return commit({
      call: () => api.createApplication(gid, { skills: skills || [], message }),
      errRu: 'Заявку не удалось отправить', errKz: 'Өтінімді жіберу мүмкін болмады',
    });
  },

  // Сброс штаба при смене личности (вход/выход/другая демо-персона). Без него
  // коллекции остаются от ПРЕДЫДУЩЕГО организатора и показываются молча: source уже
  // 'server', поэтому booting ложно (скелетона нет), а orgNotice для server+loading
  // возвращает null. Возвращаем ровно начальное состояние — дальше mount /manage
  // вызовет load(), и на время загрузки снова будет честный скелетон.
  reset: () => set({
    events: buildOrgEvents(),
    applications: buildApplications(),
    volunteers: buildOrgVolunteers(),
    source: 'demo', status: 'idle', error: null,
    analytics: null, analyticsStatus: 'idle',
  }),
}));

// Сброс вешаем подпиской здесь, а не вызовами из useSessionStore: тот про штаб не
// знает, а обратный импорт замкнул бы модули. До ответа boot() молчим — он доставляет
// userType/role/имя ТОЙ ЖЕ личности уже после mount-а /manage, и сброс на этот ответ
// снёс бы только что загруженные настоящие данные.
let prevIdentity = identityOf(useSessionStore.getState());
useSessionStore.subscribe((s) => {
  const next = identityOf(s);
  if (next === prevIdentity) return;
  prevIdentity = next;
  if (s.booted) useOrganizerStore.getState().reset();
});

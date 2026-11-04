// Reference catalogs, formatting helpers and empty initial state.

// Темы инициатив: подложка (tint) и цвет текста (ink).
export const THEMES = {
  eco: { ru: 'Экология', kz: 'Экология', tint: '#E8F1EB', ink: '#2F6F4F' },
  elderly: { ru: 'Помощь пожилым', kz: 'Қарттарға көмек', tint: '#EDE6E8', ink: '#6b4550' },
  animals: { ru: 'Приюты', kz: 'Баспаналар', tint: '#ECE7DE', ink: '#7a5a2e' },
  blood: { ru: 'Донорство', kz: 'Донорлық', tint: '#F3E3E1', ink: '#9a3b34' },
  edu: { ru: 'Образование', kz: 'Білім', tint: '#E4EAEE', ink: '#3d5566' },
  trees: { ru: 'Озеленение', kz: 'Көгалдандыру', tint: '#E9EAE2', ink: '#565b40' },
  homeless: { ru: 'Бездомным', kz: 'Панасыздарға', tint: '#E3EBEA', ink: '#356058' },
  medical: { ru: 'Медпомощь', kz: 'Медкөмек', tint: '#E1ECEE', ink: '#2d6674' },
  disaster: { ru: 'Помощь при ЧС', kz: 'ТЖ көмегі', tint: '#F5E9DB', ink: '#9a5a24' },
  sport: { ru: 'Спорт', kz: 'Спорт', tint: '#E6E7F1', ink: '#464a82' },
  culture: { ru: 'Культура', kz: 'Мәдениет', tint: '#EEE6EF', ink: '#6f4a72' },
  it: { ru: 'IT-волонтёрство', kz: 'IT-волонтёрлік', tint: '#E3E6EE', ink: '#3a4a6b' },
};

export const CITIES = [
  { id: 'ast', ru: 'Астана', kz: 'Астана', x: 53, y: 33, active: 0, vol: 0 },
  { id: 'alm', ru: 'Алматы', kz: 'Алматы', x: 71, y: 75, active: 0, vol: 0 },
  { id: 'shy', ru: 'Шымкент', kz: 'Шымкент', x: 52, y: 88, active: 0, vol: 0 },
  { id: 'kar', ru: 'Караганда', kz: 'Қарағанды', x: 56, y: 47, active: 0, vol: 0 },
  { id: 'pet', ru: 'Петропавловск', kz: 'Петропавл', x: 47, y: 9, active: 0, vol: 0 },
  { id: 'akt', ru: 'Актобе', kz: 'Ақтөбе', x: 19, y: 43, active: 0, vol: 0 },
  { id: 'pav', ru: 'Павлодар', kz: 'Павлодар', x: 65, y: 28, active: 0, vol: 0 },
  { id: 'tar', ru: 'Тараз', kz: 'Тараз', x: 58, y: 84, active: 0, vol: 0 },
  { id: 'ukk', ru: 'Усть-Каменогорск', kz: 'Өскемен', x: 84, y: 38, active: 0, vol: 0 },
];

const COVERS = '/assets/covers';
const THEMES_WITH_COVER = ['eco', 'elderly', 'animals', 'blood', 'edu', 'trees',
  'homeless', 'medical', 'disaster', 'sport', 'culture', 'it'];
export const themeImage = (theme) => `${COVERS}/${THEMES_WITH_COVER.includes(theme) ? theme : 'eco'}.jpg`;

const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// ISO-дата «сегодня + shift дней» в локальной зоне пользователя.
function isoShift(shift) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + shift);
  return isoOf(d);
}

// Настоящее «сегодня» в ISO. Функция, а не константа: вкладку могут не закрывать сутками.
export function todayISO() {
  return isoShift(0);
}

export const EVENTS = []; // Legacy identity guard; no synthetic feed.
export const ME = { id: null, name: '', city: '', hours: 0, events: 0, reliability: 0, rank: null, skills: [], historyRu: [], badges: [] };

export const BADGES = [
  { id: 'first', ru: 'Первый выход', kz: 'Алғашқы шығу', glyph: '1' },
  { id: 'ten', ru: '10 сборов', kz: '10 жиын', glyph: '10' },
  { id: 'reliable', ru: 'Надёжный', kz: 'Сенімді', glyph: '✓' },
  { id: 'eco', ru: 'Эко-герой', kz: 'Эко-батыр', glyph: '♻' },
  { id: 'night', ru: 'Ночная смена', kz: 'Түнгі ауысым', glyph: '☾' },
  { id: 'lead', ru: 'Координатор', kz: 'Үйлестіруші', glyph: '★' },
];

export function buildGathering() {
  return { id: null, code: null, titleRu: '', titleKz: '', placeRu: '', placeKz: '', dateRu: '', dateKz: '', time: '', needed: 0, participants: [], roles: [] };
}

const AVATAR_TINTS = [
  ['#E6EBE6', '#3f5a49'], ['#ECE7DE', '#7a5a2e'], ['#E4EAEE', '#3d5566'],
  ['#EDE6E8', '#6b4550'], ['#E9EAE2', '#565b40'], ['#E3EBEA', '#356058'],
];
export function avatarOf(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % 6;
  return AVATAR_TINTS[h];
}
export function initialOf(name) {
  return ((name || '').trim()[0] || '?').toUpperCase();
}

// Русская плюрализация: forms = [один, два-четыре, пять].
export function plural(n, forms) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return forms[0];
  if (a >= 2 && a <= 4 && !(b >= 12 && b <= 14)) return forms[1];
  return forms[2];
}

/* ------------------------------------------------------------------ *
 *  Данные роли «организатор волонтёрских мероприятий» (штаб)          *
 *  Синтетика демо, честно помечена в README. Организатор в демо —     *
 *  Асхат Жумабеков, координатор НКО «Чистый двор» (Петропавловск).    *
 * ------------------------------------------------------------------ */

// Совместимый экспорт: раньше — замороженная константа '2026-07-18'.
// Вычисляется один раз при загрузке модуля; в новом коде берите todayISO().
export const TODAY_ISO = todayISO();

// Навыки волонтёров: тег для заявок и базы. glyph — короткая иконка-буква.
export const SKILLS = {
  org: { ru: 'Организация', kz: 'Ұйымдастыру' },
  firstAid: { ru: 'Первая помощь', kz: 'Алғашқы көмек' },
  driver: { ru: 'Водитель', kz: 'Жүргізуші' },
  photo: { ru: 'Фото', kz: 'Фото' },
  heavy: { ru: 'Тяжёлая работа', kz: 'Ауыр жұмыс' },
  kids: { ru: 'Работа с детьми', kz: 'Балалармен жұмыс' },
  cook: { ru: 'Кейтеринг', kz: 'Тамақтандыру' },
  media: { ru: 'СММ и медиа', kz: 'СММ және медиа' },
};
export const SKILL_LIST = Object.keys(SKILLS);
export function skillLabel(id, isRu) {
  const s = SKILLS[id];
  return s ? (isRu ? s.ru : s.kz) : id;
}

// ── Роли волонтёров на сборе: пресеты по теме ──
// Пресет — это ТОЛЬКО заготовка для чипов в модалке координатора: тап создаёт строку с
// готовым названием и вместимостью, дальше роль живёт своей строкой в gathering_roles со
// своими title_ru/title_kz. По ключу пресета никто ничего не ищет и FK на него нет,
// поэтому справочник живёт здесь, рядом со SKILLS, а не таблицей на бэке: печатать
// названия ролей с телефона никто не будет, а лишний запрос на открытие шторки в режиме
// черновика (сбора ещё нет) — это лишняя точка отказа.
// Ключ уезжает на сервер с неймспейсом темы ('eco:photo'): 'photo' встречается в разных
// темах, и без префикса будущая аналитика по ролям смешала бы разное.
// [key, ru, kz, вместимость по умолчанию, «можно без опыта»]
export const ROLE_PRESETS = {
  eco: [
    ['bags', 'Раздача мешков и перчаток', 'Қап пен қолғап тарату', 4, true],
    ['sort', 'Сортировка мусора', 'Қоқысты сұрыптау', 8, true],
    ['heavy', 'Погрузка тяжёлого', 'Ауыр жүкті тиеу', 4, false],
    ['photo', 'Фотограф', 'Фотограф', 1, false],
    ['reg', 'Регистрация на входе', 'Кірісте тіркеу', 2, false],
  ],
  elderly: [
    ['talk', 'Просто поговорить', 'Жай әңгімелесу', 4, true],
    ['bring', 'Донести продукты', 'Азық-түлік жеткізу', 3, true],
    ['clean', 'Помочь по дому', 'Үй шаруасына көмек', 3, false],
    ['med', 'Сопровождение к врачу', 'Дәрігерге алып бару', 2, false],
  ],
  animals: [
    ['walk', 'Выгул собак', 'Иттерді серуендету', 4, true],
    ['clean', 'Уборка вольеров', 'Вольерлерді тазалау', 4, true],
    ['feed', 'Кормление', 'Тамақтандыру', 2, true],
    ['photo', 'Фотограф', 'Фотограф', 1, false],
  ],
  blood: [
    ['reg', 'Регистрация доноров', 'Донорларды тіркеу', 2, true],
    ['nav', 'Навигация по пунктам', 'Пункттер бойынша бағдар', 3, true],
    ['tea', 'Чай и печенье после сдачи', 'Тапсырғаннан кейін шай', 2, true],
  ],
  edu: [
    ['helper', 'Помощник ведущего', 'Жүргізушінің көмекшісі', 3, true],
    ['kids', 'Занятия с детьми', 'Балалармен сабақ', 4, false],
    ['tech', 'Техника и проектор', 'Техника мен проектор', 1, false],
    ['photo', 'Фотограф', 'Фотограф', 1, false],
  ],
  trees: [
    ['dig', 'Копать лунки', 'Шұңқыр қазу', 6, true],
    ['plant', 'Посадка саженцев', 'Көшет отырғызу', 8, true],
    ['water', 'Полив', 'Суару', 4, true],
  ],
  homeless: [
    ['serve', 'Раздача еды', 'Тамақ тарату', 5, true],
    ['cook', 'Готовка', 'Ас дайындау', 3, false],
    ['clothes', 'Сортировка вещей', 'Киім сұрыптау', 4, true],
  ],
  medical: [
    ['reg', 'Регистрация на входе', 'Кірісте тіркеу', 2, true],
    ['nav', 'Сопровождение по кабинетам', 'Кабинеттер бойынша алып жүру', 4, true],
    ['doc', 'Помощь с документами', 'Құжаттармен көмек', 2, false],
  ],
  disaster: [
    ['pack', 'Сбор и упаковка', 'Жинау мен қаптау', 6, true],
    ['load', 'Погрузка', 'Тиеу', 4, false],
    ['drive', 'Развоз на машине', 'Көлікпен жеткізу', 2, false],
  ],
  sport: [
    ['start', 'Старт и финиш', 'Старт пен мәре', 3, true],
    ['water', 'Пункт воды', 'Су пункті', 3, true],
    ['route', 'Разметка трассы', 'Трассаны белгілеу', 4, false],
    ['photo', 'Фотограф', 'Фотограф', 1, false],
  ],
  culture: [
    ['reg', 'Встреча гостей', 'Қонақтарды қарсы алу', 3, true],
    ['hall', 'Помощь в зале', 'Залдағы көмек', 4, true],
    ['photo', 'Фотограф', 'Фотограф', 1, false],
  ],
  it: [
    ['mentor', 'Ментор', 'Ментор', 3, false],
    ['support', 'Техподдержка', 'Техқолдау', 2, false],
    ['reg', 'Регистрация участников', 'Қатысушыларды тіркеу', 2, true],
  ],
};

// Тема не выбрана или неизвестна — общий набор, подходящий любому сбору.
export const ROLE_PRESETS_DEFAULT = [
  ['helper', 'Общая помощь', 'Жалпы көмек', 0, true],   // 0 = без ограничения
  ['reg', 'Регистрация на входе', 'Кірісте тіркеу', 2, false],
  ['photo', 'Фотограф', 'Фотограф', 1, false],
];

// Пресеты для темы → [{preset, ru, kz, capacity, newbie}] с неймспейсом в ключе.
export function rolePresets(theme) {
  const rows = ROLE_PRESETS[theme] || ROLE_PRESETS_DEFAULT;
  const ns = ROLE_PRESETS[theme] ? theme : 'any';
  return rows.map(([key, ru, kz, capacity, newbie]) => ({
    preset: `${ns}:${key}`, ru, kz, capacity, newbie,
  }));
}

// estimateAttendance(yes, maybe) = 0.62·yes + 0.24·maybe — УДАЛЕНА намеренно.
//
// Это была вторая, отдельная формула прогноза (без истории людей, оптимистичнее
// основной), и именно она рисовала «прогноз» в штабе организатора. На типичном
// раскладе ответов (maybe ≈ 1.5·yes) она давала ровно число подтвердивших:
// на демо-сборе PARK18 «прогноз ≈ 14 · 14 подтвердили» — две одинаковые цифры в
// одной строке. Отсюда и вывод, что прогноз просто повторяет счётчик.
//
// Теперь прогноз для каждого сбора считает сервер моделью и отдаёт в поле
// forecast (см. serialize_org_event / GET /me/org/events). Если поля нет —
// показываем «—», а не выдуманное число.

// Разница в днях от настоящего сегодня до ISO-даты (может быть отрицательной).
// Дефолт вычисляется на каждом вызове — метка «через N дней» не устаревает в открытой вкладке.
export function daysFromToday(iso, todayIso = todayISO()) {
  const day = 86400000;
  return Math.round((new Date(iso + 'T00:00:00') - new Date(todayIso + 'T00:00:00')) / day);
}

// Демо-данные платформы, перенесены из дизайн-прототипа.
// На хакатоне это синтетика (честно указано в README и на защите).

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
  { id: 'ast', ru: 'Астана', kz: 'Астана', x: 53, y: 33, active: 24, vol: 4200 },
  { id: 'alm', ru: 'Алматы', kz: 'Алматы', x: 71, y: 75, active: 38, vol: 6100 },
  { id: 'shy', ru: 'Шымкент', kz: 'Шымкент', x: 52, y: 88, active: 19, vol: 2800 },
  { id: 'kar', ru: 'Караганда', kz: 'Қарағанды', x: 56, y: 47, active: 12, vol: 1600 },
  { id: 'pet', ru: 'Петропавловск', kz: 'Петропавл', x: 47, y: 9, active: 9, vol: 900 },
  { id: 'akt', ru: 'Актобе', kz: 'Ақтөбе', x: 19, y: 43, active: 11, vol: 1400 },
  { id: 'pav', ru: 'Павлодар', kz: 'Павлодар', x: 65, y: 28, active: 8, vol: 1100 },
  { id: 'tar', ru: 'Тараз', kz: 'Тараз', x: 58, y: 84, active: 10, vol: 1200 },
  { id: 'ukk', ru: 'Усть-Каменогорск', kz: 'Өскемен', x: 84, y: 38, active: 9, vol: 1000 },
];

export const ORGS = [
  { id: 'o1', name: 'Чистый двор', cat: 'eco', city: 'Петропавловск', verified: true, aboutRu: 'Соседские субботники, уборка дворов, парков и берегов рек.', aboutKz: 'Көршілік сенбіліктер, аула мен саябақтарды тазалау.', events: 14, vol: 320 },
  { id: 'o2', name: 'Серебряный возраст', cat: 'elderly', city: 'Астана', verified: true, aboutRu: 'Помощь одиноким пожилым: продукты, уборка, общение.', aboutKz: 'Жалғызбасты қарттарға көмек: азық-түлік, тазалық, қарым-қатынас.', events: 31, vol: 540 },
  { id: 'o3', name: 'Лапа помощи', cat: 'animals', city: 'Алматы', verified: true, aboutRu: 'Уход за животными в приютах, пристрой, выгул, корм.', aboutKz: 'Баспаналардағы жануарларға күтім, серуен, жем.', events: 22, vol: 410 },
  { id: 'o4', name: 'Кровь героев', cat: 'blood', city: 'Караганда', verified: false, aboutRu: 'Дни донора и экстренные сборы крови по больницам.', aboutKz: 'Донор күндері және шұғыл қан жинау.', events: 9, vol: 260 },
  { id: 'o5', name: 'Дети будущего', cat: 'edu', city: 'Шымкент', verified: true, aboutRu: 'Наставничество и репетиторство для сельских школьников.', aboutKz: 'Ауыл оқушыларына тәлімгерлік және репетиторлық.', events: 18, vol: 380 },
];

const ev = (id, code, ru, kz, orgId, cityId, theme, placeRu, placeKz, dateRu, dateKz, time, format, needed, going, mine) =>
  ({ id, code, titleRu: ru, titleKz: kz, orgId, cityId, theme, placeRu, placeKz, dateRu, dateKz, time, format, needed, going, mine: !!mine });

export const EVENTS = [
  ev('e1', 'PARK18', 'Уборка парка на Набережной', 'Жағалау саябағын тазалау', 'o1', 'pet', 'eco', 'Парк на Набережной, вход у фонтана', 'Жағалау саябағы, фонтан жанындағы кіреберіс', 'суббота, 18 июля', 'сенбі, 18 шілде', '10:00', 'one', 20, 15, true),
  ev('e2', 'ELD19', 'Навестить одиноких пожилых', 'Жалғыз қарттарды аралау', 'o2', 'ast', 'elderly', 'ул. Кенесары 40, сбор у входа', 'Кенесары к. 40', 'воскресенье, 19 июля', 'жексенбі, 19 шілде', '11:00', 'reg', 12, 8),
  ev('e3', 'PAW20', 'День в приюте «Лапа»', 'Баспанадағы күн', 'o3', 'alm', 'animals', 'Приют «Лапа», Наурызбайский р-н', '«Лапа» баспанасы', 'понедельник, 20 июля', 'дүйсенбі, 20 шілде', '09:00', 'one', 15, 11),
  ev('e4', 'BLD21', 'День донора', 'Донор күні', 'o4', 'kar', 'blood', 'Центр крови, пр. Бухар-жырау 12', 'Қан орталығы', 'вторник, 21 июля', 'сейсенбі, 21 шілде', '08:30', 'one', 30, 22),
  ev('e5', 'EDU24', 'Репетиторство детям', 'Балаларға репетиторлық', 'o5', 'shy', 'edu', 'Школа №12, кабинет 3', '№12 мектеп', 'пятница, 24 июля', 'жұма, 24 шілде', '15:00', 'reg', 8, 5),
  ev('e6', 'TRE25', 'Посадка деревьев в сквере', 'Скверде ағаш отырғызу', 'o1', 'ast', 'trees', 'Сквер у ТРЦ «Керуен»', '«Керуен» жанындағы сквер', 'суббота, 25 июля', 'сенбі, 25 шілде', '10:00', 'one', 40, 27),
  ev('e7', 'WRM26', 'Сбор тёплых вещей', 'Жылы киім жинау', 'o2', 'alm', 'homeless', 'Пункт сбора, ул. Абая 90', 'Абай к. 90', 'воскресенье, 26 июля', 'жексенбі, 26 шілде', '12:00', 'reg', 10, 6),
  ev('e8', 'RIV27', 'Уборка берега Ишима', 'Есіл жағасын тазалау', 'o1', 'ast', 'eco', 'Набережная Ишима, левый берег', 'Есіл жағалауы', 'понедельник, 27 июля', 'дүйсенбі, 27 шілде', '09:30', 'one', 25, 14),
];

const mkVol = (id, name, city, hours, events, rel) => ({ id, name, city, hours, events, rel });
export const VOLUNTEERS = [
  mkVol('v1', 'Аружан Сапарова', 'Алматы', 186, 41, 96),
  mkVol('v2', 'Ерлан Мұратов', 'Астана', 174, 38, 93),
  mkVol('v3', 'Динара Ким', 'Шымкент', 159, 35, 90),
  mkVol('v4', 'Тимур Ли', 'Алматы', 148, 33, 88),
  mkVol('v5', 'Гүлнара Ахметова', 'Караганда', 132, 29, 91),
  mkVol('v6', 'Данияр Оспанов', 'Астана', 121, 27, 85),
  mkVol('v7', 'Мария Волкова', 'Петропавловск', 108, 24, 89),
  mkVol('v8', 'Санжар Тлеу', 'Тараз', 97, 22, 82),
];

export const ME = {
  id: 'me', name: 'Асхат Жумабеков', city: 'Петропавловск', hours: 47, events: 12, reliability: 91, rank: 34,
  skills: ['Организация', 'Первая помощь', 'Водитель кат. B', 'Фото'],
  historyRu: [
    { t: 'Уборка парка на Набережной', d: '11 июля', came: true },
    { t: 'Помощь в приюте «Лапа»', d: '28 июня', came: true },
    { t: 'День донора', d: '14 июня', came: false },
    { t: 'Посадка деревьев', d: '31 мая', came: true },
  ],
  badges: ['first', 'ten', 'reliable', 'eco'],
};

export const BADGES = [
  { id: 'first', ru: 'Первый выход', kz: 'Алғашқы шығу', glyph: '1' },
  { id: 'ten', ru: '10 сборов', kz: '10 жиын', glyph: '10' },
  { id: 'reliable', ru: 'Надёжный', kz: 'Сенімді', glyph: '✓' },
  { id: 'eco', ru: 'Эко-герой', kz: 'Эко-батыр', glyph: '♻' },
  { id: 'night', ru: 'Ночная смена', kz: 'Түнгі ауысым', glyph: '☾' },
  { id: 'lead', ru: 'Координатор', kz: 'Үйлестіруші', glyph: '★' },
];

export const NOTIFS = [
  { id: 'n1', type: 'answer', ru: 'Айгерім ответила «Приду» на «Уборка парка»', kz: 'Айгерім «Келемін» деп жауап берді', time: '5 мин', read: false },
  { id: 'n2', type: 'reminder', ru: 'Завтра в 10:00 — «Уборка парка на Набережной»', kz: 'Ертең 10:00 — «Жағалау саябағын тазалау»', time: '1 ч', read: false },
  { id: 'n3', type: 'badge', ru: 'Вы получили бейдж «Эко-герой»', kz: '«Эко-батыр» бейджін алдыңыз', time: '3 ч', read: false },
  { id: 'n4', type: 'event', ru: '«Дети будущего» открыли новый сбор рядом', kz: '«Дети будущего» жақын жерде жаңа жиын ашты', time: 'вчера', read: true },
  { id: 'n5', type: 'system', ru: 'НКО «Чистый двор» подтвердила ваши 6 часов', kz: '«Чистый двор» 6 сағатыңызды растады', time: '2 дн', read: true },
];

export const CONVOS = [
  { id: 'c1', name: 'Чистый двор', role: 'НКО', msgs: [{ me: false, txt: 'Здравствуйте! Спасибо, что записались на субботник 🙌', t: '10:02' }, { me: true, txt: 'Привет! Во сколько сбор?', t: '10:05' }, { me: false, txt: 'В 10:00 у фонтана. Перчатки и мешки будут наши.', t: '10:06' }, { me: true, txt: 'Отлично, буду!', t: '10:07' }] },
  { id: 'c2', name: 'Ерлан (координатор)', role: 'Координатор', msgs: [{ me: false, txt: 'Можешь взять с собой ещё пару человек?', t: 'вчера' }, { me: true, txt: 'Да, позову соседей', t: 'вчера' }] },
  { id: 'c3', name: 'Лапа помощи', role: 'НКО', msgs: [{ me: false, txt: 'Напоминаем: выгул собак в 9:00', t: '2 дн' }] },
  { id: 'c4', name: 'Серебряный возраст', role: 'НКО', msgs: [{ me: false, txt: 'Апа передаёт вам огромное спасибо ❤', t: '3 дн' }] },
];

export const CHARITY = [
  { id: 'ch1', titleRu: 'Инвентарь для субботников', titleKz: 'Сенбілікке құрал-жабдық', org: 'o1', cityId: 'pet', kind: 'money', goal: 150000, raised: 98000, unit: '₸' },
  { id: 'ch2', titleRu: 'Тёплые вещи для приюта', titleKz: 'Баспанаға жылы киім', org: 'o2', cityId: 'alm', kind: 'items', goal: 200, raised: 134, unit: 'вещей' },
  { id: 'ch3', titleRu: 'Корм для приюта «Лапа»', titleKz: '«Лапа» баспанасына жем', org: 'o3', cityId: 'alm', kind: 'money', goal: 90000, raised: 71500, unit: '₸' },
  { id: 'ch4', titleRu: 'Учебники сельским школам', titleKz: 'Ауыл мектептеріне оқулық', org: 'o5', cityId: 'shy', kind: 'items', goal: 500, raised: 210, unit: 'книг' },
];

// Детерминированный сбор-демо: 14 «да», 24 «может», 7 «нет» с правдоподобной историей.
export function buildParticipants() {
  const first = ['Айгерім', 'Данияр', 'Ольга', 'Тимур', 'Асхат', 'Марина', 'Ерлан', 'Гүлнара', 'Санжар', 'Настя', 'Азамат', 'Дана', 'Владимир', 'Аружан', 'Кирилл', 'Мадина', 'Руслан', 'Алия', 'Дмитрий', 'Жанна', 'Нұрлан', 'Виктория', 'Бекзат', 'Елена', 'Арман', 'Сәуле', 'Максим', 'Динара', 'Олжас', 'Татьяна', 'Ислам', 'Камила', 'Сергей', 'Айсұлу', 'Дәурен', 'Ксения', 'Ерасыл', 'Гаухар', 'Антон', 'Меруерт', 'Тимофей', 'Әсел', 'Данил', 'Жанія', 'Ринат'];
  let s = 20260718 >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const answers = [];
  for (let i = 0; i < 14; i++) answers.push('yes');
  for (let i = 0; i < 24; i++) answers.push('maybe');
  for (let i = 0; i < 7; i++) answers.push('no');
  const order = answers.map((a) => ({ a, k: rnd() })).sort((x, y) => x.k - y.k).map((o) => o.a);
  return first.map((name, i) => {
    const answer = order[i];
    const total = Math.floor(rnd() * 6);
    let came;
    if (total === 0) came = 0;
    else {
      const reliable = rnd();
      const rate = answer === 'yes' ? 0.55 + reliable * 0.45 : answer === 'maybe' ? 0.15 + reliable * 0.6 : 0.05 + reliable * 0.4;
      came = Math.min(total, Math.round(total * rate));
    }
    const phone = '+7 7' + (Math.floor(rnd() * 90) + 10) + ' ' + (Math.floor(rnd() * 900) + 100) + ' ' + (Math.floor(rnd() * 90) + 10) + (Math.floor(rnd() * 90) + 10);
    return { id: 'p' + i, name, phone, answer, presence: null, history: { total, came } };
  });
}

// Демонстрационный сбор для координатора.
export function buildGathering() {
  return {
    id: 'e1',
    code: 'PARK18',
    titleRu: 'Уборка парка на Набережной', titleKz: 'Жағалау саябағын тазалау',
    placeRu: 'Парк на Набережной, вход у фонтана', placeKz: 'Жағалау саябағы, фонтан жанындағы кіреберіс',
    dateRu: 'суббота, 18 июля', dateKz: 'сенбі, 18 шілде', time: '10:00',
    needed: 20, status: 'open', ctx: 0.95,
    participants: buildParticipants(),
  };
}

// Детерминированный приглушённый оттенок аватара из имени: [фон, текст].
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

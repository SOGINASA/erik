import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useSessionStore } from '../store/useSessionStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { useIsDesktop } from '../lib/nav';
import { api } from '../lib/api';
import { THEMES, todayISO } from '../lib/data';
import { Container, BackButton } from '../components/Container';
import { Field, FieldLabel, Stepper } from '../components/ui/controls';
import Button from '../components/ui/Button';

// Выпадающий список: в controls.jsx селекта нет, поэтому те же 48px/рамка/радиус,
// что у Field и у селекта города в EditProfileSheet — поля стоят в одну линию.
function Select({ label, error, value, onChange, placeholder, options }) {
  return (
    <label style={{ display: 'block' }}>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={onChange}
        className="erik-input"
        style={{
          width: '100%', height: 48, padding: '0 12px', borderRadius: 'var(--r-s)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--line)'}`, background: 'var(--surface)',
          color: value ? 'var(--ink)' : 'var(--ink-3)', fontSize: 16, outline: 'none',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span style={{ display: 'block', marginTop: 6, fontSize: 14, color: 'var(--danger)' }}>{error}</span>}
    </label>
  );
}

// Проверка формы перед отправкой. Раньше её не было вовсе: пустые what/where
// уходили на сервер (бэк отбивал только what, и то без внятного показа причины).
// Тема и город обязательны намеренно — лента фильтрует сборы ровно по ним
// (platform.py:_feed_query), и сбор без темы не находится ни под одним чипом.
function validate(form, needName, isRu) {
  const e = {};
  const empty = (v) => !String(v == null ? '' : v).trim();
  if (empty(form.what)) e.what = isRu ? 'Укажите, что делаем' : 'Не істейтінімізді көрсетіңіз';
  if (empty(form.where)) e.where = isRu ? 'Укажите место' : 'Орнын көрсетіңіз';
  if (empty(form.date)) e.date = isRu ? 'Выберите дату' : 'Күнін таңдаңыз';
  // Строки ISO сравниваются лексикографически — отдельный парсинг не нужен.
  else if (form.date < todayISO()) e.date = isRu ? 'Дата уже прошла' : 'Күн өтіп кеткен';
  if (empty(form.time)) e.time = isRu ? 'Укажите время' : 'Уақытын көрсетіңіз';
  if (empty(form.theme)) e.theme = isRu ? 'Выберите тему' : 'Тақырыпты таңдаңыз';
  if (empty(form.cityId)) e.cityId = isRu ? 'Выберите город' : 'Қаланы таңдаңыз';
  // Обложка необязательна, но если ссылка задана — только http(s): бэк отбивает остальное
  // 400-й (gatherings.py:_taxonomy_fields), проверяем здесь, чтобы не гонять заведомо плохой URL.
  const cover = String(form.imageUrl == null ? '' : form.imageUrl).trim();
  if (cover && !/^https?:\/\//i.test(cover)) {
    e.imageUrl = isRu ? 'Ссылка должна начинаться с http:// или https://' : 'Сілтеме http:// немесе https:// деп басталуы керек';
  }
  // Имя спрашиваем только у новичка — бэк проставляет его при первом сборе,
  // без него организатор остаётся безымянным в ростере.
  if (needName && empty(form.name)) e.name = isRu ? 'Укажите ваше имя' : 'Атыңызды көрсетіңіз';
  return e;
}

// Инлайн-текст под кнопкой. Тост от commit гаснет через 3.5с, а форма остаётся —
// пользователь должен видеть, что сбор так и НЕ создан, а не гадать.
function submitErrorText(err, isRu) {
  if (err && err.offline) {
    return isRu
      ? 'Нет сети — сбор не создан. Попробуйте ещё раз, когда появится связь.'
      : 'Желі жоқ — жиын құрылмады. Байланыс пайда болғанда қайталап көріңіз.';
  }
  if (err && err.forbidden) return isRu ? 'Недостаточно прав, чтобы создать сбор' : 'Жиын құруға құқық жеткіліксіз';
  // Текст сервера показываем только в RU: все сообщения бэка русские (gatherings.py),
  // в KZ они ломают язык экрана. HTTPException-хендлер (app.py) отдаёт {'error': <код>},
  // из него получается message === '500' — голый код под кнопкой не показываем.
  if (isRu && err && typeof err.message === 'string' && err.message.trim() && !/^\d+$/.test(err.message)) return err.message;
  return isRu ? 'Не удалось создать сбор — попробуйте ещё раз' : 'Жиынды құру мүмкін болмады — қайталап көріңіз';
}

// Создание сбора: одна страница, не визард. Липкая панель снизу.
export default function NewGathering() {
  const t = useT();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const hasName = !!useSessionStore((s) => s.name);
  const createGathering = useGatheringStore((s) => s.create);
  const openSheet = useUiStore((s) => s.openSheet);
  const showToast = useUiStore((s) => s.showToast);
  const isRu = useLang() === 'ru';
  // Города берём из платформы — их уже грузит loadPlatform(); свой api.getCities()
  // здесь был бы вторым запросом за тем же справочником.
  const cities = usePlatformStore((s) => s.cities);
  const myCityId = usePlatformStore((s) => s.me.cityId);

  // Дата — настоящее сегодня. Раньше здесь стояло '2026-07-18': форма молча
  // предлагала прошедший день всем, кто открыл её не в тот единственный день.
  const [form, setForm] = useState({ what: '', where: '', date: todayISO(), time: '10:00', needed: 20, name: '', theme: '', cityId: '', orgId: '', imageUrl: '' });
  const [tried, setTried] = useState(false);   // ошибки полей показываем только после первой отправки
  const [busy, setBusy] = useState(false);     // защита от двойного сабмита
  const [failed, setFailed] = useState(null);
  const [myOrgs, setMyOrgs] = useState([]);    // мои НКО (я — owner): пусто → селект «от имени НКО» не показываем
  const up = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Свои организации для селекта «от имени НКО». Отдельный запрос, а не платформа:
  // usePlatformStore грузит ВСЕ НКО, а привязать сбор можно только к своей (бэк проверяет
  // владение, gatherings.py:_taxonomy_fields). Офлайн/нет оргов — селект просто не появится.
  useEffect(() => {
    let alive = true;
    api.myOrgs().then((res) => {
      if (alive && res && Array.isArray(res.orgs)) setMyOrgs(res.orgs);
    }).catch(() => { /* нет сети/оргов — личный сбор, поле скрыто */ });
    return () => { alive = false; };
  }, []);

  // Свой город подставляем по умолчанию: профиль приезжает уже после монтирования,
  // поэтому эффектом — и только пока пользователь не выбрал город сам.
  useEffect(() => {
    if (myCityId) setForm((f) => (f.cityId ? f : { ...f, cityId: myCityId }));
  }, [myCityId]);

  // Темы — из общего словаря lib/data, а не отдельным api.getThemes(): это ровно тот
  // набор, по которому лента и карта рисуют чипы фильтра (и он совпадает с seed.THEMES).
  // Тема, которой нет в словаре, отобразилась бы пустым чипом и не нашлась бы фильтром.
  const themeOptions = Object.keys(THEMES).map((k) => ({ value: k, label: isRu ? THEMES[k].ru : THEMES[k].kz }));
  const cityOptions = cities.map((c) => ({ value: c.id, label: isRu ? c.ru : c.kz }));
  const orgOptions = myOrgs.map((o) => ({ value: o.id, label: o.name }));
  // Превью обложки — только для валидной http(s)-ссылки. key={cover} перемонтирует <img>
  // при смене URL, сбрасывая display:none, который onError навесил на прошлую битую картинку.
  const cover = form.imageUrl.trim();
  const coverOk = /^https?:\/\//i.test(cover);
  const errors = tried ? validate(form, !hasName, isRu) : {};

  const create = async () => {
    if (busy) return;
    setTried(true);
    const errs = validate(form, !hasName, isRu);
    if (Object.keys(errs).length) {
      setFailed(null);
      // Кнопка липкая внизу — незаполненное поле может быть уже вне экрана.
      showToast(isRu ? 'Заполните обязательные поля' : 'Міндетті өрістерді толтырыңыз');
      return;
    }
    setBusy(true);
    setFailed(null);
    const res = await createGathering(form);
    setBusy(false);
    // Провал теперь различим: стор возвращает { error: { offline, forbidden, message } }
    // и уже показал причину тостом. Раньше на этом месте открывалась шторка share
    // с ДЕМО-кодом PARK18 — несуществующий сбор выдавался за созданный.
    if (!res || res.error) {
      setFailed(submitErrorText(res && res.error, isRu));
      return;
    }
    // Новый сбор уходит на модерацию к админу (RSVP пока закрыт) — не открываем шеринг кода,
    // показываем статус и ведём в «Мои сборы».
    if (res.gathering && res.gathering.status === 'pending') {
      showToast(isRu ? 'Сбор отправлен на модерацию' : 'Жиын модерацияға жіберілді');
      navigate('/me');
      return;
    }
    openSheet('share');
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container narrow style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0 8px' }}>
          <BackButton onClick={() => navigate('/feed')} />
        </div>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.15, letterSpacing: '-.02em', margin: '8px 0 24px' }}>{t.newTitle}</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 120 }}>
          <Field label={t.fWhat} value={form.what} onChange={up('what')} placeholder={t.fWhatPh} error={errors.what} />
          <Field label={t.fWhere} value={form.where} onChange={up('where')} placeholder={t.fWherePh} error={errors.where} />
          <Select
            label={isRu ? 'Тема' : 'Тақырып'}
            placeholder={isRu ? 'Выберите тему' : 'Тақырыпты таңдаңыз'}
            value={form.theme}
            onChange={up('theme')}
            options={themeOptions}
            error={errors.theme}
          />
          <Select
            label={isRu ? 'Город' : 'Қала'}
            placeholder={isRu ? 'Выберите город' : 'Қаланы таңдаңыз'}
            value={form.cityId}
            onChange={up('cityId')}
            options={cityOptions}
            error={errors.cityId}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label={t.fWhenDate} type="date" min={todayISO()} value={form.date} onChange={up('date')} error={errors.date} />
            </div>
            <div style={{ flex: 1 }}>
              <Field label={t.fWhenTime} type="time" value={form.time} onChange={up('time')} error={errors.time} />
            </div>
          </div>
          <div>
            <FieldLabel>{t.fNeeded}</FieldLabel>
            <Stepper value={form.needed} onDec={() => setForm((f) => ({ ...f, needed: Math.max(1, f.needed - 1) }))} onInc={() => setForm((f) => ({ ...f, needed: Math.min(200, f.needed + 1) }))} />
          </div>
          {/* От имени НКО (необязательно): показываем, только если у пользователя есть свои
              организации. Пусто = личный сбор (org_id останется NULL). */}
          {orgOptions.length > 0 && (
            <Select
              label={t.fOrg}
              placeholder={t.fOrgPersonal}
              value={form.orgId}
              onChange={up('orgId')}
              options={orgOptions}
            />
          )}
          {/* Обложка (необязательно): ссылка на картинку + превью. Пусто → карточка ленты
              покажет тематический тинт (EventCard рисует img только при наличии image). */}
          <div>
            <Field label={t.fCover} type="url" inputMode="url" value={form.imageUrl} onChange={up('imageUrl')} placeholder={t.fCoverPh} error={errors.imageUrl} />
            {coverOk && (
              <div style={{ marginTop: 10, height: 104, borderRadius: 'var(--r-s)', overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--paper)' }}>
                <img
                  key={cover}
                  src={cover}
                  alt=""
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            )}
          </div>
          {!hasName && <Field label={t.fName} value={form.name} onChange={up('name')} placeholder={t.fNamePh} error={errors.name} />}
        </div>
      </Container>

      <div
        style={{
          position: 'sticky', left: 0, right: 0,
          bottom: desktop ? 0 : 'calc(66px + env(safe-area-inset-bottom))',
          padding: `14px 0 ${desktop ? 'calc(14px + env(safe-area-inset-bottom))' : '14px'}`,
          background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--line)', zIndex: 20,
        }}
      >
        <Container narrow>
          {failed && <div style={{ fontSize: 14, color: 'var(--danger)', lineHeight: 1.45, marginBottom: 10 }}>{failed}</div>}
          <Button full size="lg" loading={busy} onClick={create}>{t.createCta}</Button>
        </Container>
      </div>
    </div>
  );
}

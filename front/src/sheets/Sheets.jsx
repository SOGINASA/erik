import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components/ui/Sheet';
import Button from '../components/ui/Button';
import { Field, Textarea, Stepper, FieldLabel } from '../components/ui/controls';
import AnswerButton from '../components/ui/AnswerButton';
import Avatar from '../components/ui/Avatar';
import Icon from '../components/Icon';
import { useT, useLang } from '../i18n';
import { useUiStore } from '../store/useUiStore';
import { useSessionStore } from '../store/useSessionStore';
import { useGatheringStore } from '../store/useGatheringStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { counts } from '../lib/forecast';
import { SKILL_LIST, THEMES, skillLabel, rolePresets } from '../lib/data';
import { useOrganizerStore } from '../store/useOrganizerStore';
import { RelChip, SkillTags } from '../components/manage/parts';
import { useGuardedNav, isOrganizerRole, profileHref } from '../lib/nav';
import { copyToClipboard } from '../lib/share';
import { api } from '../lib/api';
import { commit } from '../lib/optimistic';

// Единый диспетчер листов/модалок по ui.sheet.
export default function Sheets() {
  const sheet = useUiStore((s) => s.sheet);
  switch (sheet) {
    case 'auth': return <AuthSheet />;
    case 'code': return <CodeSheet />;
    case 'share': return <ShareSheet />;
    case 'more': return <MoreSheet />;
    case 'confirm': return <ConfirmSheet />;
    case 'person': return <PersonSheet />;
    case 'remind': return <RemindSheet />;
    case 'settings': return <SettingsSheet />;
    case 'guest': return <GuestSheet />;
    case 'register': return <RegisterSheet />;
    case 'donate': return <DonateSheet />;
    case 'newCharity': return <NewCharitySheet />;
    case 'editprofile': return <EditProfileSheet />;
    case 'apply': return <ApplySheet />;
    case 'applicant': return <ApplicantSheet />;
    case 'coordinators': return <CoordinatorsSheet />;
    case 'roles': return <RolesSheet />;
    case 'pickRole': return <PickRoleSheet />;
    case 'confirmRoleDrop': return <ConfirmRoleDropSheet />;
    default: return null;
  }
}

function EditProfileSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const me = usePlatformStore((s) => s.me);
  const cities = usePlatformStore((s) => s.cities);
  const loadMe = usePlatformStore((s) => s.loadMe);
  const setIdentity = useSessionStore((s) => s.setIdentity);
  const phone = useSessionStore((s) => s.phone);
  const [name, setName] = useState(me.name || '');
  const [cityId, setCityId] = useState(me.cityId || '');
  const [skills, setSkills] = useState((me.skills || []).join(', '));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    const payload = {
      name: name.trim() || undefined,
      cityId: cityId || undefined,
      skills: skills.split(',').map((x) => x.trim()).filter(Boolean),
    };
    setBusy(true);
    // Раньше ошибка глоталась (`catch (_) {}`), а «Профиль сохранён» тостилось всё равно:
    // при офлайне пользователь получал успех, локальное имя менялось, сервер — нет.
    const r = await commit({
      call: () => api.updateMe(payload),
      okRu: 'Профиль сохранён', okKz: 'Профиль сақталды',
      errRu: 'Не удалось сохранить профиль', errKz: 'Профильді сақтау мүмкін болмады',
    });
    setBusy(false);
    if (!r.ok) return; // причину показал commit, шторку не закрываем — данные в форме целы
    if (payload.name) setIdentity(payload.name, phone);
    loadMe();
    close();
  };

  return (
    <Sheet open onClose={close} title={isRu ? 'Редактировать профиль' : 'Профильді өңдеу'} maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label={isRu ? 'Имя' : 'Аты'} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.fNamePh} />
        <div>
          <FieldLabel>{isRu ? 'Город' : 'Қала'}</FieldLabel>
          <select value={cityId} onChange={(e) => setCityId(e.target.value)} className="erik-input" style={{ width: '100%', height: 48, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 16 }}>
            <option value="">{isRu ? 'Не указан' : 'Көрсетілмеген'}</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{isRu ? c.ru : c.kz}</option>)}
          </select>
        </div>
        <Field label={isRu ? 'Навыки (через запятую)' : 'Дағдылар (үтір арқылы)'} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder={isRu ? 'Организация, Первая помощь' : 'Ұйымдастыру, Алғашқы көмек'} />
      </div>
      <Button full size="lg" style={{ marginTop: 20 }} loading={busy} onClick={save}>{t.save}</Button>
    </Sheet>
  );
}

function AuthSheet() {
  const t = useT();
  const close = useUiStore((s) => s.closeSheet);
  const navigate = useNavigate();
  return (
    <Sheet open onClose={close} title={t.authTitle}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 20px' }}>{t.authSub}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button full size="lg" onClick={() => { close(); navigate('/register'); }}>{t.authRegister}</Button>
        <Button full variant="secondary" onClick={() => { close(); navigate('/login'); }}>{t.authLogin}</Button>
      </div>
    </Sheet>
  );
}

function CodeSheet() {
  const t = useT();
  const close = useUiStore((s) => s.closeSheet);
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  return (
    <Sheet open onClose={close} title={t.codeTitle} maxWidth={400}>
      <Field value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus placeholder="PARK18" inputStyle={{ fontFamily: 'var(--fm)', letterSpacing: '.15em', textAlign: 'center', fontSize: 20 }} />
      <Button full size="lg" style={{ marginTop: 16 }} onClick={() => { close(); navigate(`/g/${code || 'PARK18'}`); }}>{t.open}</Button>
    </Sheet>
  );
}

function ShareSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();
  const g = useGatheringStore((s) => s.gathering);
  const title = isRu ? g.titleRu : g.titleKz;
  const place = isRu ? g.placeRu : g.placeKz;
  const when = `${isRu ? g.dateRu : g.dateKz} · ${g.time}`;
  const chatText = isRu
    ? `«${title}» — ${when}. ${place}. Отметьтесь одним тапом: erik.kz/g/${g.code}`
    : `«${title}» — ${when}. ${place}. Бір рет тап басып белгіленіңіз: erik.kz/g/${g.code}`;
  return (
    <Sheet open onClose={close} title={t.shareTitle}>
      <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.02em', color: 'var(--ink-3)', marginBottom: 6 }}>{t.shareCodeLabel}</div>
        <div style={{ fontFamily: 'var(--fm)', fontWeight: 600, fontSize: 34, letterSpacing: '.12em', color: 'var(--ink)' }}>{g.code}</div>
      </div>
      <FieldLabel>{t.shareChatLabel}</FieldLabel>
      <div style={{ padding: '12px 14px', borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)', marginBottom: 16 }}>{chatText}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button full size="lg" icon="copy" onClick={async () => { await copyToClipboard(chatText); close(); showToast(isRu ? 'Текст скопирован' : 'Мәтін көшірілді'); }}>{t.copyText}</Button>
        <Button full variant="secondary" onClick={() => { close(); navigate(`/c/${g.id}`); }}>{t.openAsCoord}</Button>
      </div>
    </Sheet>
  );
}

function MoreSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const go = useGuardedNav();
  const navigate = useNavigate();
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const role = useSessionStore((s) => s.role);
  // Тот же предикат, что и у гейта роутов (lib/nav: ORGANIZER_ROUTES → isOrganizerRole),
  // а не своя копия 'coord'||'org': расходясь, меню показывало бы пункты, на которые
  // гейт потом отвечает отказом.
  const isOrganizer = isOrganizerRole(role);
  const logout = useSessionStore((s) => s.logout);
  const item = (icon, label, onClick, danger) => (
    <button type="button" className="erik-row-hover" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 12px', border: 'none', background: 'transparent', borderRadius: 'var(--r-m)', cursor: 'pointer', textAlign: 'left', fontSize: 16, color: danger ? 'var(--danger)' : 'var(--ink)' }}>
      <Icon name={icon} size={20} />{label}
    </button>
  );
  const goClose = (path, route) => { close(); go(path, route); };
  return (
    <Sheet open onClose={close} title={t.moreMenuTitle}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {isOrganizer && item('calendar', t.manageEyebrow, () => goClose('/manage', 'manage'))}
        {/* «Мои сборы» — роут 'me': он в GATED_ROUTES (нужен вход), но НЕ в ORGANIZER_ROUTES.
            Пряча его за ролью, меню было строже гейта: волонтёр без сборов не видел
            экрана, который его же и зовёт создать первый. Гостя развернёт goClose. */}
        {item('list', t.myGatherings, () => goClose('/me', 'me'))}
        {/* Свои RSVP — любому вошедшему, без фильтра по роли (см. Shell.jsx, тот же пункт):
            координатор и НКО записываются на чужие сборы наравне с волонтёром. */}
        {loggedIn && item('check', isRu ? 'Мои мероприятия' : 'Менің іс-шараларым', () => goClose('/my-events', 'myEvents'))}
        {item('user', t.navProfile, () => goClose('/u/me', 'profile'))}
        {item('trophy', t.navLeader, () => goClose('/leaderboard', 'leaderboard'))}
        {item('heart', t.navCharity, () => goClose('/charity', 'charity'))}
        {item('bell', t.navNotif, () => goClose('/notifications', 'notifications'))}
        {isAdmin && item('shield', t.navAdmin, () => goClose('/admin', 'admin'))}
        <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
        {loggedIn
          ? item('external', t.logout, () => { logout(); close(); navigate('/'); showToast(isRu ? 'Вы вышли из аккаунта' : 'Аккаунттан шықтыңыз'); }, true)
          : item('users', t.loginWord, () => { close(); navigate('/login'); })}
      </div>
    </Sheet>
  );
}

function ConfirmSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const payload = useUiStore((s) => s.sheetPayload);
  const finish = useGatheringStore((s) => s.finishGathering);
  const del = useGatheringStore((s) => s.deleteGathering);
  const navigate = useNavigate();
  const isFinish = payload === 'finish';
  const title = isFinish ? t.confirmFinishTitle : isRu ? 'Удалить сбор?' : 'Жиынды жою?';
  const body = isFinish ? t.confirmFinishBody : isRu ? 'Сбор и все ответы удалятся безвозвратно.' : 'Жиын мен барлық жауаптар қайтарымсыз жойылады.';
  const [busy, setBusy] = useState(false);

  // Уводим на /me ТОЛЬКО после ответа сервера: finish/delete — оптимистичные commit(),
  // при провале они откатывают состояние и тостят причину. Навигация до ответа читалась
  // как успех: сбор оставался открытым на сервере, а координатор уже был на «Моих сборах».
  const act = async () => {
    if (busy) return;
    setBusy(true);
    const r = await (isFinish ? finish() : del());
    setBusy(false);
    if (!r.ok) return; // причину показал commit, шторку не закрываем — можно повторить
    close();
    navigate('/me');
  };

  return (
    <Sheet open onClose={close} title={title} maxWidth={420}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 20px' }}>{body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button full size="lg" loading={busy} variant={isFinish ? 'primary' : 'danger'} onClick={act}>{isFinish ? t.finish : t.deleteGathering}</Button>
        <Button full variant="ghost" onClick={close}>{t.cancel}</Button>
      </div>
    </Sheet>
  );
}

function PersonSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();
  const p = useUiStore((s) => s.sheetPayload) || {};
  const changeAnswerFor = useGatheringStore((s) => s.changeAnswerFor);
  const removeParticipant = useGatheringStore((s) => s.removeParticipant);
  const setParticipantRole = useGatheringStore((s) => s.setParticipantRole);
  const roles = useGatheringStore((s) => s.gathering.roles) || [];
  // Шторка держит СВОЮ копию участника (payload), поэтому выбранную роль ведём
  // локально: иначе чип не подсветится до переоткрытия шторки.
  const [curRole, setCurRole] = useState(p.roleId || null);
  const [roleBusy, setRoleBusy] = useState(false);
  const setRole = async (roleId) => {
    if (roleBusy) return;
    const prev = curRole;
    setCurRole(roleId);
    setRoleBusy(true);
    const r = await setParticipantRole(p.id, roleId);
    setRoleBusy(false);
    if (!r.ok) setCurRole(prev);   // причину показал стор
  };
  const hist = p.history
    ? p.history.total > 0
      ? isRu ? `был ${p.history.came} из ${p.history.total} раз` : `${p.history.total} реттен ${p.history.came} рет келген`
      : t.newParticipant
    : '';
  const pBtn = (kind) => {
    const map = { yes: ['var(--yard-soft)', 'var(--yard)'], maybe: ['var(--maybe-soft)', 'var(--maybe)'], no: ['#EEF0EC', 'var(--out)'] };
    const sel = p.answer === kind;
    const [soft, full] = map[kind];
    const label = kind === 'yes' ? t.ansYes : kind === 'maybe' ? t.ansMaybe : t.ansNo;
    return (
      <button key={kind} type="button" className="erik-btn" onClick={() => changeAnswerFor(p.id, kind)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 'var(--r-s)', cursor: 'pointer', fontWeight: 500, fontSize: 14, flex: 1, background: sel ? soft : 'var(--surface)', border: `1.5px solid ${sel ? full : 'var(--line)'}`, color: 'var(--ink)' }}>{label}</button>
    );
  };
  // Профиль участника: координатор ставит людей на роли и решает, ждать ли человека, —
  // «был 3 из 4» без остальной истории для этого мало. userId приходит только с ростером
  // координатора (serialize_participant), у walk-in гостей его нет — тогда шапка обычная.
  const profile = profileHref(p.userId);
  const head = (
    <>
      <Avatar name={p.name} size={52} fontScale={0.4} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--ink-2)' }}>{p.phone || '—'}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{hist}</div>
      </div>
    </>
  );

  return (
    <Sheet open onClose={close} title={p.name || ''}>
      {profile ? (
        <button
          type="button"
          className="erik-row-hover"
          onClick={() => { close(); navigate(profile); }}
          style={{ display: 'flex', alignItems: 'center', gap: 14, width: 'calc(100% + 16px)', marginLeft: -8, marginBottom: 16, padding: '8px', border: 'none', borderRadius: 'var(--r-m)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
        >
          {head}
          <span style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, fontSize: 13, color: 'var(--yard)' }}>
            {t.navProfile}<Icon name="chevronRight" size={16} />
          </span>
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>{head}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>{['yes', 'maybe', 'no'].map(pBtn)}</div>

      {/* Роль участника: координатор переставляет людей на месте. Вместимость здесь
          МЯГКАЯ — он видит человека глазами, и «мест нет» ему отвечать поздно. */}
      {roles.length > 0 && p.answer !== 'no' && (
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>{isRu ? 'Роль на сборе' : 'Жиындағы рөлі'}</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {roles.map((r) => {
              const on = r.id === curRole;
              return (
                <button
                  key={r.id}
                  type="button"
                  className="erik-btn"
                  disabled={roleBusy}
                  onClick={() => setRole(on ? null : r.id)}
                  style={{ height: 36, padding: '0 14px', borderRadius: 999, border: `1.5px solid ${on ? 'var(--yard)' : 'var(--line)'}`, background: on ? 'var(--yard-soft)' : 'var(--surface)', color: on ? 'var(--yard)' : 'var(--ink-2)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all var(--t-fast)' }}
                >
                  {isRu ? r.titleRu : r.titleKz}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" icon="phone" onClick={() => p.phone ? (window.location.href = `tel:${p.phone}`) : showToast(isRu ? 'Телефон не указан' : 'Телефон көрсетілмеген')} style={{ flex: 1 }}>{t.personCall}</Button>
        <Button variant="ghost" icon="trash" onClick={() => removeParticipant(p.id)} style={{ color: 'var(--danger)' }}>{t.personRemove}</Button>
      </div>
    </Sheet>
  );
}

function RemindSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const g = useGatheringStore((s) => s.gathering);
  const remind = useGatheringStore((s) => s.remind);
  const maybeCount = counts(g.participants || []).maybe;
  const def = isRu
    ? `Напоминаю про завтрашний сбор «${g.titleRu}». Если планы поменялись — просто поменяйте ответ по ссылке, это ок.`
    : `Ертеңгі «${g.titleKz}» жиынын еске саламын. Жоспар өзгерсе — сілтеме арқылы жауабыңызды өзгертіңіз, бұл қалыпты жағдай.`;
  const [text, setText] = useState(def);
  const [sending, setSending] = useState(false);

  // remind() возвращает null при ошибке, а при успехе — { recipient_count }.
  // Раньше результат выбрасывался и «Напоминание отправлено» тостилось безусловно:
  // офлайн и 403 выглядели ровно как успех. Тостим по факту и не закрываем шторку
  // на ошибке — набранный текст нужен для повторной попытки.
  const send = async () => {
    if (sending) return;
    if (!text.trim()) { showToast(isRu ? 'Текст напоминания пуст' : 'Еске салу мәтіні бос'); return; }
    setSending(true);
    const res = await remind(text);
    setSending(false);
    if (!res) { showToast(isRu ? 'Не удалось отправить напоминание' : 'Еске салуды жіберу мүмкін болмады'); return; }
    close();
    const n = res.recipient_count;
    // Сервер говорит, скольким реально ушло: локальный счётчик по ростеру может
    // разойтись с его выборкой, а «отправлено» при нуле получателей — неправда.
    if (n === 0) { showToast(isRu ? 'Напоминать некому — все уже определились' : 'Еске салатын ешкім жоқ — бәрі жауап берген'); return; }
    showToast(
      typeof n === 'number'
        ? (isRu ? `Напоминание отправлено — ${n}` : `Еске салу жіберілді — ${n}`)
        : (isRu ? 'Напоминание отправлено' : 'Еске салу жіберілді')
    );
  };

  return (
    <Sheet open onClose={close} title={t.remindTitle}>
      <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 14 }}>{isRu ? `Уйдёт ${maybeCount} участникам «под вопросом»` : `${maybeCount} «белгісіз» қатысушыға жіберіледі`}</div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Button full size="lg" loading={sending} onClick={send}>{t.send}</Button>
        <Button full variant="ghost" onClick={close}>{t.cancel}</Button>
      </div>
    </Sheet>
  );
}

// Селект в стиле поля EditProfileSheet: те же 48px/рамка/радиус, лейбл-caption сверху.
function SheetSelect({ label, value, onChange, children }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select value={value} onChange={onChange} className="erik-input" style={{ width: '100%', height: 48, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 16 }}>
        {children}
      </select>
    </div>
  );
}

function SettingsSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const g = useGatheringStore((s) => s.gathering);
  const setTitle = useGatheringStore((s) => s.setTitle);
  const setPlace = useGatheringStore((s) => s.setPlace);
  const setTheme = useGatheringStore((s) => s.setTheme);
  const setCity = useGatheringStore((s) => s.setCity);
  const setOrg = useGatheringStore((s) => s.setOrg);
  const setImage = useGatheringStore((s) => s.setImage);
  const incNeeded = useGatheringStore((s) => s.incNeeded);
  const decNeeded = useGatheringStore((s) => s.decNeeded);
  const saveGathering = useGatheringStore((s) => s.saveGathering);
  // Города берём из платформы (их уже грузит loadPlatform), как в NewGathering —
  // второй api.getCities() за тем же справочником не нужен.
  const cities = usePlatformStore((s) => s.cities);
  const [orgs, setOrgs] = useState([]);   // мои НКО для привязки сбора (пусто = без НКО)
  const [busy, setBusy] = useState(false);

  // Список моих организаций для селекта привязки. Ошибку глотаем: без НКО селект
  // просто остаётся с одним пунктом «Без НКО».
  useEffect(() => {
    let alive = true;
    api.myOrgs().then((r) => { if (alive && r && Array.isArray(r.orgs)) setOrgs(r.orgs); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Закрывать шторку до ответа нельзя: правка уже лежит в сторе (setTitle/setPlace пишут
  // прямо в gathering), а отката у saveGathering нет намеренно. С закрытой формой
  // непрошедшее сохранение выглядит применённым — заголовок у координатора показывал бы
  // новый текст до следующего loadCoord.
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const r = await saveGathering();
    setBusy(false);
    if (!r.ok) return; // причину показал commit, форма открыта — текст цел, можно повторить
    close();
  };

  return (
    <Sheet open onClose={close} title={t.settingsTitle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Правка идёт в поле ТОГО языка, который показан в поле: setTitle/setPlace
            пишут в titleRu/titleKz по языку, а раньше одна строка уходила в оба —
            правка при KZ-интерфейсе затирала русское название. Язык передаём явно,
            тем же значением, что и в value: показанное и записанное — одно поле. */}
        <Field label={t.fWhat} value={isRu ? g.titleRu : g.titleKz} onChange={(e) => setTitle(e.target.value, isRu ? 'ru' : 'kz')} />
        <Field label={t.fWhere} value={isRu ? g.placeRu : g.placeKz} onChange={(e) => setPlace(e.target.value, isRu ? 'ru' : 'kz')} />
        {/* Тема/город/орг/обложка правятся теми же сеттерами, что уходят в saveGathering —
            это закрывает «ошибочный город или тему нельзя исправить после создания».
            Темы берём из общего словаря lib/data (тот же набор, что у чипов ленты), как в
            NewGathering; города — из платформы; НКО — из моих организаций. */}
        <SheetSelect label={isRu ? 'Тема' : 'Тақырып'} value={g.theme || ''} onChange={(e) => setTheme(e.target.value)}>
          <option value="">{isRu ? 'Выберите тему' : 'Тақырыпты таңдаңыз'}</option>
          {Object.keys(THEMES).map((k) => <option key={k} value={k}>{isRu ? THEMES[k].ru : THEMES[k].kz}</option>)}
        </SheetSelect>
        <SheetSelect label={isRu ? 'Город' : 'Қала'} value={g.cityId || ''} onChange={(e) => setCity(e.target.value)}>
          <option value="">{isRu ? 'Выберите город' : 'Қаланы таңдаңыз'}</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{isRu ? c.ru : c.kz}</option>)}
        </SheetSelect>
        <SheetSelect label={isRu ? 'Организация' : 'Ұйым'} value={g.orgId || ''} onChange={(e) => setOrg(e.target.value)}>
          <option value="">{isRu ? 'Без НКО' : 'ҮЕҰ жоқ'}</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </SheetSelect>
        <Field label={isRu ? 'Обложка (ссылка)' : 'Мұқаба (сілтеме)'} value={g.image || ''} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
        <div>
          <FieldLabel>{t.fNeeded}</FieldLabel>
          <Stepper value={g.needed} onDec={decNeeded} onInc={incNeeded} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button full size="lg" loading={busy} onClick={save}>{t.save}</Button>
        <Button full variant="ghost" onClick={() => openSheet('confirm', 'delete')} style={{ color: 'var(--danger)' }}>{t.deleteGathering}</Button>
      </div>
    </Sheet>
  );
}

function GuestSheet() {
  const t = useT();
  const close = useUiStore((s) => s.closeSheet);
  const addGuestMark = useGatheringStore((s) => s.addGuestMark);
  const [name, setName] = useState('');
  const add = () => { if (!name.trim()) return; addGuestMark(name); close(); };
  return (
    <Sheet open onClose={close} title={t.guestSheetTitle} maxWidth={420}>
      <Field value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t.fNamePh} />
      <Button full size="lg" style={{ marginTop: 16 }} onClick={add}>{t.addMark}</Button>
    </Sheet>
  );
}

function RegisterSheet() {
  const t = useT();
  const close = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const eventId = useUiStore((s) => s.sheetPayload);
  const registerEvent = useGatheringStore((s) => s.registerEvent);
  const cur = useGatheringStore((s) => s.regs)[eventId];
  const events = usePlatformStore((s) => s.events);
  const [busy, setBusy] = useState(false);

  // Запись остаётся одно-тапной: тап по ответу закрывает шторку, как и раньше. Роль
  // предлагаем ПОСЛЕ, и только когда сервер подтвердил запись — раньше здесь стоял
  // fire-and-forget (`registerEvent(...); close();`), и шторка ролей открылась бы даже
  // при офлайне, когда оптимистичная запись уже откатилась.
  const pick = async (a) => {
    if (busy) return;
    setBusy(true);
    const r = await registerEvent(eventId, a);
    setBusy(false);
    close();
    if (!r || !r.ok || a === 'no') return;   // 'no' роль не спрашивает: человек не придёт
    const roles = (r.data && r.data.roles) || (events.find((e) => e.id === eventId) || {}).roles || [];
    if (roles.length) openSheet('pickRole', { eventId, roles });
  };

  return (
    <Sheet open onClose={close} title={t.registerTitle} maxWidth={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AnswerButton kind="yes" label={t.ansYes} selected={cur === 'yes'} onClick={() => pick('yes')} />
        <AnswerButton kind="maybe" label={t.ansMaybe} selected={cur === 'maybe'} onClick={() => pick('maybe')} />
        <AnswerButton kind="no" label={t.ansNo} selected={cur === 'no'} onClick={() => pick('no')} />
      </div>
    </Sheet>
  );
}

// НКО создаёт сбор помощи: название, тип (деньги/вещи), цель, город.
function NewCharitySheet() {
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();
  const cities = usePlatformStore((s) => s.cities);
  const createCharity = usePlatformStore((s) => s.createCharity);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('money');
  const [goal, setGoal] = useState('');
  const [unit, setUnit] = useState('');
  const [cityId, setCityId] = useState('');
  const [busy, setBusy] = useState(false);

  const goalNum = Number(goal) || 0;
  const submit = async () => {
    // Цель обязана быть > 0: при goal=0 donate даёт raised=min(0,…)=0 (сбор нерабочий),
    // а прогресс = raised/goal = NaN. Бэк тоже отбивает goal<=0 (400).
    if (!title.trim() || goalNum <= 0 || busy) return;
    setBusy(true);
    const res = await createCharity({
      titleRu: title.trim(),
      kind,
      goal: goalNum,
      unit: kind === 'items' ? (unit.trim() || (isRu ? 'шт' : 'дана')) : '₸',
      cityId: cityId || undefined,
    });
    setBusy(false);
    if (res) {
      close();
      showToast(isRu ? 'Сбор помощи создан' : 'Көмек жинағы құрылды');
      navigate('/charity');
    }
  };

  const selStyle = { width: '100%', height: 48, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 16 };
  return (
    <Sheet open onClose={close} title={isRu ? 'Новый сбор помощи' : 'Жаңа көмек жинағы'} maxWidth={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label={isRu ? 'Название' : 'Атауы'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isRu ? 'Тёплые вещи для приюта' : 'Баспанаға жылы киім'} />
        <div>
          <FieldLabel>{isRu ? 'Тип помощи' : 'Көмек түрі'}</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['money', isRu ? 'Деньги' : 'Ақша'], ['items', isRu ? 'Вещи' : 'Заттар']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setKind(k)} className="erik-btn" style={{ flex: 1, height: 44, borderRadius: 'var(--r-s)', border: `1.5px solid ${kind === k ? 'var(--yard)' : 'var(--line)'}`, background: kind === k ? 'var(--yard-soft)' : 'var(--surface)', color: 'var(--ink)', fontWeight: 500, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
        </div>
        <Field label={isRu ? `Цель (${kind === 'money' ? '₸' : 'шт'})` : `Мақсат (${kind === 'money' ? '₸' : 'дана'})`} type="number" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={kind === 'money' ? '100000' : '200'} />
        {kind === 'items' && (
          <Field label={isRu ? 'Единица (вещей, книг…)' : 'Өлшем бірлігі'} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={isRu ? 'вещей' : 'зат'} />
        )}
        <div>
          <FieldLabel>{isRu ? 'Город' : 'Қала'}</FieldLabel>
          <select value={cityId} onChange={(e) => setCityId(e.target.value)} className="erik-input" style={selStyle}>
            <option value="">{isRu ? 'Не указан' : 'Көрсетілмеген'}</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{isRu ? c.ru : c.kz}</option>)}
          </select>
        </div>
      </div>
      <Button full size="lg" style={{ marginTop: 20 }} loading={busy} disabled={!title.trim() || goalNum <= 0} onClick={submit}>{isRu ? 'Создать сбор помощи' : 'Көмек жинағын құру'}</Button>
    </Sheet>
  );
}

function DonateSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const donateAmt = usePlatformStore((s) => s.donateAmt);
  const setDonateAmt = usePlatformStore((s) => s.setDonateAmt);
  const donate = usePlatformStore((s) => s.donate);
  const donateId = usePlatformStore((s) => s.donateId);
  const charity = usePlatformStore((s) => s.charity);
  const item = charity.find((c) => c.id === donateId);
  const title = item ? (isRu ? item.titleRu : item.titleKz) : '';
  const isItems = !!item && item.kind === 'items';
  const unit = (item && item.unit) || (isRu ? 'шт' : 'дана');
  const amts = [1000, 2000, 5000];

  // Тип сбора определяет ввод: деньги — суммы в ₸, вещи — количество единиц. donateAmt один
  // на оба типа, поэтому при открытии выставляем осмысленный дефолт под тип (иначе для сбора
  // вещей показывались бы денежные кнопки, а уходил бы всегда quantity:1).
  useEffect(() => {
    if (!item) return;
    setDonateAmt(item.kind === 'money' ? 2000 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donateId, item && item.kind]);

  return (
    <Sheet open onClose={close} title={t.helpTitle} maxWidth={420}>
      <div style={{ fontSize: 15, color: 'var(--ink-2)', marginBottom: 16 }}>{title}</div>
      {isItems ? (
        <>
          <FieldLabel>{isRu ? 'Сколько принесёте' : 'Қанша әкелесіз'}</FieldLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <Stepper value={donateAmt} onDec={() => setDonateAmt(Math.max(1, (donateAmt || 1) - 1))} onInc={() => setDonateAmt((donateAmt || 1) + 1)} />
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>{unit}</span>
          </div>
        </>
      ) : (
        <>
          <FieldLabel>{t.donateAmount}</FieldLabel>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {amts.map((a) => (
              <button key={a} type="button" className="erik-btn" onClick={() => setDonateAmt(a)} style={{ flex: 1, height: 44, borderRadius: 'var(--r-m)', border: `1px solid ${donateAmt === a ? 'var(--yard)' : 'var(--line)'}`, background: donateAmt === a ? 'var(--yard-soft)' : 'var(--surface)', color: 'var(--ink)', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--fm)' }}>{a.toLocaleString('ru-RU')} ₸</button>
            ))}
          </div>
        </>
      )}
      <Button full size="lg" onClick={() => { donate(); close(); }}>{t.help}</Button>
    </Sheet>
  );
}

// Заявка волонтёра организатору: навыки + сообщение. Открывается со страницы события.
function ApplySheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const eventId = useUiStore((s) => s.sheetPayload);
  const events = usePlatformStore((s) => s.events);
  const me = usePlatformStore((s) => s.me);
  const name = useSessionStore((s) => s.name);
  const phone = useSessionStore((s) => s.phone);
  const addApplication = useOrganizerStore((s) => s.addApplication);

  const ev = events.find((e) => e.id === eventId);
  const title = ev ? (isRu ? ev.titleRu : ev.titleKz) : '';
  const [skills, setSkills] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const toggle = (id) => setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = async () => {
    if (sending) return;
    // Имя/город берёт сервер из профиля (createApplication игнорирует клиентские PII).
    // Клиентские поля — только для оптимистичного отображения; мок ME не используем.
    setSending(true);
    // Ждём ответ и тостим успех по факту: раньше «Заявка отправлена» показывалась до
    // запроса, и упавший POST (стор откатывал заявку и тостил причину) выглядел успехом.
    // При провале шторку не закрываем — набранное сообщение и навыки целы для повтора.
    const res = await addApplication({ eventId, name: name || me.name, phone, city: (me && me.cityId ? me.city : ''), skills, message });
    setSending(false);
    if (!res.ok) return; // причину показал стор
    close();
    showToast(t.mgApplySent);
  };

  return (
    <Sheet open onClose={close} title={t.mgApplyTitle}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-2)', marginBottom: 18 }}>
          <Icon name="calendar" size={16} stroke={1.7} />
          <span>«{title}»</span>
        </div>
      )}
      <FieldLabel>{t.mgApplySkills}</FieldLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {SKILL_LIST.map((id) => {
          const on = skills.includes(id);
          return (
            <button
              key={id}
              type="button"
              className="erik-btn"
              onClick={() => toggle(id)}
              style={{ height: 38, padding: '0 14px', borderRadius: 999, border: `1.5px solid ${on ? 'var(--yard)' : 'var(--line)'}`, background: on ? 'var(--yard-soft)' : 'var(--surface)', color: on ? 'var(--yard)' : 'var(--ink-2)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all var(--t-fast)' }}
            >
              {skillLabel(id, isRu)}
            </button>
          );
        })}
      </div>
      <Textarea label={t.mgApplyMsg} value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={t.mgApplyMsgPh} />
      <Button full size="lg" loading={sending} style={{ marginTop: 18 }} onClick={send}>{t.mgApplySend}</Button>
    </Sheet>
  );
}

// Организатор рассматривает одну заявку: детали волонтёра + принять/отклонить.
function ApplicantSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const navigate = useNavigate();
  const a = useUiStore((s) => s.sheetPayload) || {};
  const events = useOrganizerStore((s) => s.events);
  const accept = useOrganizerStore((s) => s.acceptApplication);
  const decline = useOrganizerStore((s) => s.declineApplication);

  // Решение целиком на сторе: он сам закрывает шторку (синхронно, до запроса — поэтому
  // второй тап невозможен), оптимистично правит список, откатывает при ошибке и тостит
  // и успех, и причину провала. Дублировать тут нечего.
  // Молчит стор в одном случае — заявки уже нет в его коллекции (её унёс refresh);
  // тогда шторка осталась бы открытой без единого признака, что клик ничего не сделал.
  const decideOn = async (act) => {
    const r = await act(a.id);
    if (r && r.ok === false && !r.error) {
      close();
      showToast(isRu ? 'Заявка больше не актуальна — обновите список' : 'Өтінім өзекті емес — тізімді жаңартыңыз');
    }
  };

  const ev = events.find((e) => e.id === a.eventId);
  const evTitle = ev ? (isRu ? ev.titleRu : ev.titleKz) : '';
  const hist = a.history && a.history.total > 0
    ? isRu ? `был ${a.history.came} из ${a.history.total} раз` : `${a.history.total} реттен ${a.history.came} рет келген`
    : t.mgNewVol;
  const msg = isRu ? a.messageRu : a.messageKz;
  const pending = a.status === 'pending';

  // Заявку одобряют, глядя на человека: из шапки открываем его профиль (навыки, часы,
  // вся история участий). Заявка без аккаунта приходит с userId === null — ссылки нет.
  const profile = profileHref(a.userId);
  const head = (
    <>
      <Avatar name={a.name} size={52} fontScale={0.4} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--ink-2)' }}>{a.phone || '—'}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{a.city} · {hist}</div>
      </div>
    </>
  );

  return (
    <Sheet open onClose={close} title={a.name || ''}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        {profile ? (
          <button
            type="button"
            className="erik-row-hover"
            onClick={() => { close(); navigate(profile); }}
            style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, marginLeft: -8, padding: '8px', border: 'none', borderRadius: 'var(--r-m)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          >
            {head}
            <Icon name="chevronRight" size={16} stroke={1.7} />
          </button>
        ) : head}
        <span style={{ flex: 'none' }}><RelChip value={a.reliability} label={t.mgReliability} /></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-2)', marginBottom: 16 }}>
        <Icon name="calendar" size={16} stroke={1.7} />
        <span>{t.mgAppliedTo} <span style={{ color: 'var(--ink)', fontWeight: 500 }}>«{evTitle}»</span></span>
      </div>

      {a.skills && a.skills.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>{t.mgSkills}</FieldLabel>
          <SkillTags ids={a.skills} />
        </div>
      )}

      {msg && (
        <div style={{ marginBottom: 20 }}>
          <FieldLabel>{t.mgMessage}</FieldLabel>
          <div style={{ padding: '12px 14px', borderRadius: 'var(--r-s)', background: 'var(--paper)', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>{msg}</div>
        </div>
      )}

      {pending ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button full size="lg" icon="check" onClick={() => decideOn(accept)}>{t.mgAccept}</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" icon="phone" onClick={() => a.phone ? (window.location.href = `tel:${a.phone}`) : showToast(isRu ? 'Телефон не указан' : 'Телефон көрсетілмеген')} style={{ flex: 1 }}>{t.personCall}</Button>
              <Button variant="ghost" onClick={() => decideOn(decline)} style={{ color: 'var(--ink-2)' }}>{t.mgDecline}</Button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>{a.status === 'accepted' ? t.mgStatusAccepted : t.mgStatusDeclined}</div>
      )}
    </Sheet>
  );
}

// Со-координаторы сбора: список + добавить/снять. Список читают и владелец, и cocoord,
// а менять состав может ТОЛЬКО владелец — гейт живёт на бэке (403), поэтому контролы не
// прячем, а показываем внятный тост по факту ответа (как ApplicantSheet — по факту, не до).
function CoordinatorsSheet() {
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const payload = useUiStore((s) => s.sheetPayload);
  const gid = useGatheringStore((s) => s.gathering.id);
  const id = payload || gid;   // открыли с id сбора в payload либо берём текущий сбор
  const [list, setList] = useState(null);   // null — ещё грузим; [] — пусто
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);

  // Список со-координаторов при открытии. Ошибку показываем пустым состоянием + тостом,
  // а не белым листом.
  useEffect(() => {
    let alive = true;
    api.gatheringCoordinators(id)
      .then((r) => { if (alive) setList(Array.isArray(r.coordinators) ? r.coordinators : []); })
      .catch(() => { if (alive) { setList([]); showToast(isRu ? 'Не удалось загрузить координаторов' : 'Координаторларды жүктеу мүмкін болмады'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Внятный тост по статусу ответа бэка (сообщения сервера русские — разводим сами по коду).
  const errToast = (err) => {
    const s = err && err.status;
    if (s === 404) return showToast(isRu ? 'Пользователь не найден' : 'Пайдаланушы табылмады');
    if (s === 400) return showToast(isRu ? 'Этот пользователь — владелец сбора' : 'Бұл пайдаланушы — жиын иесі');
    if (s === 403) return showToast(isRu ? 'Координаторами управляет только владелец' : 'Координаторларды тек иесі басқарады');
    return showToast(isRu ? 'Не удалось изменить состав' : 'Құрамды өзгерту мүмкін болмады');
  };

  const add = async () => {
    if (busy) return;
    const uid = parseInt(userId, 10);
    if (!uid) { showToast(isRu ? 'Укажите ID пользователя' : 'Пайдаланушы ID-ін көрсетіңіз'); return; }
    setBusy(true);
    try {
      const r = await api.addCoordinator(id, uid);
      const c = r && r.coordinator;
      // Повторное добавление бэк отдаёт существующей строкой — дедупим по userId.
      if (c) setList((prev) => (prev || []).some((x) => x.userId === c.userId) ? prev : [...(prev || []), c]);
      setUserId('');
      showToast(isRu ? 'Со-координатор добавлен' : 'Қосымша координатор қосылды');
    } catch (err) {
      errToast(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.removeCoordinator(id, uid);
      setList((prev) => (prev || []).filter((x) => x.userId !== uid));
      showToast(isRu ? 'Со-координатор снят' : 'Қосымша координатор алынды');
    } catch (err) {
      errToast(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={close} title={isRu ? 'Со-координаторы' : 'Қосымша координаторлар'}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 16px' }}>
        {isRu ? 'Помогают отмечать явку на этом сборе.' : 'Осы жиында келгендерді белгілеуге көмектеседі.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
        {list == null ? (
          <div style={{ fontSize: 14, color: 'var(--ink-3)', padding: '8px 0' }}>{isRu ? 'Загрузка…' : 'Жүктелуде…'}</div>
        ) : list.length === 0 ? (
          <div style={{ fontSize: 14, color: 'var(--ink-3)', padding: '8px 0' }}>{isRu ? 'Пока нет со-координаторов' : 'Әзірге қосымша координатор жоқ'}</div>
        ) : (
          list.map((c) => {
            const owner = c.role === 'owner';
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <Avatar name={c.name} size={40} fontScale={0.4} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                  <div style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-3)' }}>ID {c.userId}</div>
                </div>
                {owner
                  ? <span style={{ height: 24, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 12, whiteSpace: 'nowrap' }}>{isRu ? 'Владелец' : 'Иесі'}</span>
                  : <Button variant="ghost" onClick={() => remove(c.userId)} style={{ color: 'var(--danger)' }}>{isRu ? 'Снять' : 'Алып тастау'}</Button>}
              </div>
            );
          })
        )}
      </div>

      <FieldLabel>{isRu ? 'Добавить по ID пользователя' : 'Пайдаланушы ID-і арқылы қосу'}</FieldLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Field value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={isRu ? 'ID пользователя' : 'Пайдаланушы ID-і'} />
        </div>
        <Button loading={busy} onClick={add} style={{ height: 48, flex: 'none' }}>{isRu ? 'Добавить' : 'Қосу'}</Button>
      </div>
    </Sheet>
  );
}

const ROLES_MAX = 8;   // = GATHERING_ROLE_MAX на бэке (models.py)

// Строка роли в списке волонтёра: визуал AnswerButton, но со счётчиком мест справа.
// Отдельный компонент, потому что рисуется в двух местах — на гостевом экране инлайном
// и в шторке после записи из ленты.
export function RoleRow({ role, selected, disabled, isRu, onClick }) {
  const title = isRu ? role.titleRu : role.titleKz;
  // capacity=0 — безлимит: «N из M» рисовать не из чего, и роль никогда не «занята».
  const slots = role.capacity
    ? `${role.taken} ${isRu ? 'из' : '/'} ${role.capacity}`
    : (isRu ? 'без ограничения' : 'шектеусіз');
  return (
    <button
      type="button"
      className="erik-btn"
      disabled={disabled}
      onClick={onClick}
      style={{
        position: 'relative', width: '100%', minHeight: 56, padding: '10px 46px 10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        borderRadius: 'var(--r-m)', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        border: `1.5px solid ${selected ? 'var(--yard)' : 'var(--line)'}`,
        background: selected ? 'var(--yard-soft)' : 'var(--surface)',
        color: disabled ? 'var(--ink-3)' : 'var(--ink)',
        opacity: disabled ? 0.6 : 1, transition: 'all var(--t-fast)',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>{title}</span>
        {role.newbie && (
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', marginTop: 4, borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 11, fontWeight: 500 }}>
            {isRu ? 'можно без опыта' : 'тәжірибесіз болады'}
          </span>
        )}
      </span>
      <span style={{ flex: 'none', fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
        {disabled && !selected ? (isRu ? 'мест нет' : 'орын жоқ') : slots}
      </span>
      {selected && (
        <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--yard)' }}>
          <Icon name="check" size={20} stroke={2} />
        </span>
      )}
    </button>
  );
}

// Порядок ролей для волонтёра: новичку сначала показываем то, что помечено «можно без
// опыта». Признак новичка — events_attended === 0 (это поле УЖЕ приезжает в профиле;
// trust_total клиенту не отдаётся вовсе, брать его нельзя).
export function sortRolesForViewer(roles, isNewbie) {
  if (!isNewbie) return roles;
  return [...roles].sort((a, b) => (b.newbie ? 1 : 0) - (a.newbie ? 1 : 0));
}

// Выбор роли волонтёром ПОСЛЕ записи из ленты. На гостевом экране (/g/:code) тот же
// список рисуется инлайном в блоке «ты записан» — открывать модалку поверх только что
// показанного успеха значит гасить сам момент подтверждения.
function PickRoleSheet() {
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const payload = useUiStore((s) => s.sheetPayload) || {};
  const me = usePlatformStore((s) => s.me);
  const events = usePlatformStore((s) => s.events);
  const pickEventRole = useGatheringStore((s) => s.pickEventRole);
  const [busy, setBusy] = useState(false);

  // Роли берём из ленты (они приезжают в карточке события), но если запись только что
  // прошла — свежий список из ответа сервера точнее: в нём уже учтён наш собственный слот.
  const ev = events.find((e) => e.id === payload.eventId) || {};
  const roles = payload.roles || ev.roles || [];
  const myRoleId = ev.myRoleId || null;
  const isNewbie = !me || !me.eventsAttended;
  const ordered = sortRolesForViewer(roles, isNewbie);

  const pick = async (roleId) => {
    if (busy) return;
    setBusy(true);
    const r = await pickEventRole(payload.eventId, roleId);
    setBusy(false);
    if (r.ok) { close(); return; }
    // 409: место заняли, пока человек выбирал. Стор уже перерисовал остатки — шторку
    // НЕ закрываем, показываем правду и даём выбрать другую роль.
    if (r.error && r.error.status === 409) {
      useUiStore.getState().showToast(isRu ? 'Роль уже заняли — выберите другую' : 'Рөл алынып қойды — басқасын таңдаңыз');
    }
  };

  return (
    <Sheet open onClose={close} title={isRu ? 'Чем поможешь?' : 'Немен көмектесесің?'} maxWidth={420}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 16px' }}>
        {isRu
          ? 'Ты уже записан. Роль можно выбрать сейчас или потом.'
          : 'Сен тіркелдің. Рөлді қазір де, кейін де таңдауға болады.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ordered.map((r) => (
          <RoleRow
            key={r.id}
            role={r}
            isRu={isRu}
            selected={r.id === myRoleId}
            disabled={busy || (r.free === 0 && r.id !== myRoleId)}
            onClick={() => pick(r.id)}
          />
        ))}
      </div>
      <Button full variant="ghost" style={{ marginTop: 14 }} onClick={close}>
        {isRu ? 'Пока не знаю — поставьте, куда нужно' : 'Әзірге білмеймін — қажет жерге қойыңыз'}
      </Button>
    </Sheet>
  );
}

// Подтверждение удаления роли, на которой уже есть люди.
// ConfirmSheet переиспользовать НЕЛЬЗЯ: она ветвится ровно на payload === 'finish', и любой
// другой payload уходит в deleteGathering() — «удалить роль» снесло бы весь сбор.
function ConfirmRoleDropSheet() {
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const payload = useUiStore((s) => s.sheetPayload) || {};
  const saveRoles = useGatheringStore((s) => s.saveRoles);
  const [busy, setBusy] = useState(false);

  const conflicts = payload.conflicts || [];
  const total = conflicts.reduce((n, c) => n + (c.taken || 0), 0);
  const names = conflicts.map((c) => `«${isRu ? c.titleRu : c.titleKz}»`).join(', ');

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const r = await saveRoles(payload.roles || [], true);
    setBusy(false);
    if (r.ok) { close(); return; }
    openSheet('roles', payload.gatheringId);   // не вышло — возвращаем в редактор набора
  };

  return (
    <Sheet open onClose={close} title={isRu ? 'Удалить роль?' : 'Рөлді жою керек пе?'} maxWidth={420}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 20px' }}>
        {isRu
          ? `На ${names} уже записались: ${total} чел. Они останутся на сборе, но без роли — и смогут выбрать новую.`
          : `${names} рөліне ${total} адам жазылған. Олар жиында қалады, бірақ рөлсіз — жаңасын таңдай алады.`}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button full size="lg" variant="danger" loading={busy} onClick={confirm}>
          {isRu ? 'Удалить роль' : 'Рөлді жою'}
        </Button>
        <Button full variant="ghost" onClick={() => openSheet('roles', payload.gatheringId)}>
          {isRu ? 'Вернуться к ролям' : 'Рөлдерге оралу'}
        </Button>
      </div>
    </Sheet>
  );
}

// Роли волонтёров: координатор набирает их чипами-пресетами и правит вместимость.
// Два режима по payload: {draft:true} — черновик для ещё не созданного сбора (живёт в
// сторе, уедет внутри createGathering), иначе id сбора — правки летят в PUT /roles.
function RolesSheet() {
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const openSheet = useUiStore((s) => s.openSheet);
  const showToast = useUiStore((s) => s.showToast);
  const payload = useUiStore((s) => s.sheetPayload);
  const draft = !!(payload && payload.draft);

  const g = useGatheringStore((s) => s.gathering);
  const draftRoles = useGatheringStore((s) => s.draftRoles);
  const setDraftRoles = useGatheringStore((s) => s.setDraftRoles);
  const saveRoles = useGatheringStore((s) => s.saveRoles);

  // Черновик живёт в сторе (шторка размонтируется при закрытии), боевой набор —
  // локальная копия серверного: правки применяются одним PUT по кнопке «Сохранить».
  const [rows, setRows] = useState(() => (draft ? draftRoles : (g.roles || []).map((r) => ({ ...r }))));
  const [busy, setBusy] = useState(false);
  const theme = draft ? (payload && payload.theme) : g.theme;
  const presets = rolePresets(theme);

  const sync = (next) => { setRows(next); if (draft) setDraftRoles(next); };
  const patch = (i, p) => sync(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const remove = (i) => sync(rows.filter((_, idx) => idx !== i));
  const cap = (v) => Math.max(0, Math.min(99, v));

  const addRow = (row) => {
    if (rows.length >= ROLES_MAX) {
      showToast(isRu ? `Больше ${ROLES_MAX} ролей на один сбор не нужно` : `Бір жиынға ${ROLES_MAX} рөлден артық қажет емес`);
      return;
    }
    const t = (row.titleRu || '').trim();
    if (!t) return;
    // Повторный тап по чипу пресета — не ошибка ввода: молча игнорируем дубль,
    // иначе бэк вернул бы 400 на действии, которое выглядит безобидным.
    if (rows.some((r) => (r.titleRu || '').trim().toLowerCase() === t.toLowerCase())) return;
    sync([...rows, row]);
  };

  const save = async () => {
    if (busy) return;
    if (draft) { close(); return; }          // черновик уедет вместе с созданием сбора
    setBusy(true);
    const r = await saveRoles(rows);
    setBusy(false);
    if (r.ok) { close(); return; }
    // 409 с conflicts — роль занята: спрашиваем подтверждение отдельной шторкой.
    const data = r.error && r.error.data;
    if (r.error && r.error.status === 409 && data && data.conflicts) {
      openSheet('confirmRoleDrop', { gatheringId: g.id, roles: rows, conflicts: data.conflicts });
      return;
    }
    // Прочие 409 (вместимость ниже занятого, завершённый сбор) — текст сервера точнее нашего.
    if (r.error && r.error.status === 409) {
      showToast((isRu ? data && data.error : data && data.errorKz) || (isRu ? 'Не удалось сохранить роли' : 'Рөлдерді сақтау мүмкін болмады'));
    }
  };

  const totalSlots = rows.reduce((n, r) => n + (Number(r.capacity) || 0), 0);
  const needed = draft ? (payload && payload.needed) : g.needed;

  return (
    <Sheet open onClose={close} title={isRu ? 'Роли волонтёров' : 'Еріктілер рөлдері'} maxWidth={440}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 16px' }}>
        {isRu
          ? 'Роль — подсказка волонтёру, а не пропуск. Кто не выберет — просто придёт помогать.'
          : 'Рөл — еріктіге нұсқау, рұқсатнама емес. Таңдамаған адам жай көмектесуге келеді.'}
      </p>

      {/* Пресеты по теме сбора: печатать названия с телефона никто не будет */}
      {presets.length > 0 && rows.length < ROLES_MAX && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {presets
            .filter((p) => !rows.some((r) => (r.titleRu || '').trim().toLowerCase() === p.ru.toLowerCase()))
            .map((p) => (
              <button
                key={p.preset}
                type="button"
                className="erik-btn"
                onClick={() => addRow({ titleRu: p.ru, titleKz: p.kz, capacity: p.capacity, newbie: p.newbie, preset: p.preset })}
                style={{ height: 36, padding: '0 14px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all var(--t-fast)' }}
              >
                + {isRu ? p.ru : p.kz}
              </button>
            ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--ink-3)', padding: '4px 0' }}>
            {isRu ? 'Ролей пока нет — добавьте из подсказок выше или своим названием.' : 'Әзірге рөл жоқ — жоғарыдағы ұсыныстардан немесе өз атауыңызбен қосыңыз.'}
          </div>
        )}
        {rows.map((r, i) => (
          <div key={r.id || `new-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field
                  value={isRu ? (r.titleRu || '') : (r.titleKz || r.titleRu || '')}
                  onChange={(e) => patch(i, isRu ? { titleRu: e.target.value } : { titleKz: e.target.value })}
                  placeholder={isRu ? 'Что делает' : 'Не істейді'}
                />
              </div>
              {/* Stepper сам не клампит (controls.jsx) — границы держим здесь */}
              <Stepper
                value={r.capacity === 0 ? '∞' : r.capacity}
                onDec={() => patch(i, { capacity: cap((Number(r.capacity) || 0) - 1) })}
                onInc={() => patch(i, { capacity: cap((Number(r.capacity) || 0) + 1) })}
              />
              <button
                type="button"
                className="erik-row-hover"
                onClick={() => remove(i)}
                aria-label={isRu ? 'Убрать роль' : 'Рөлді алып тастау'}
                style={{ width: 40, height: 40, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 'var(--r-s)' }}
              >
                <Icon name="trash" size={18} stroke={1.7} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="erik-btn"
                onClick={() => patch(i, { newbie: !r.newbie })}
                style={{ height: 26, padding: '0 10px', borderRadius: 999, border: `1.5px solid ${r.newbie ? 'var(--yard)' : 'var(--line)'}`, background: r.newbie ? 'var(--yard-soft)' : 'var(--surface)', color: r.newbie ? 'var(--yard)' : 'var(--ink-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all var(--t-fast)' }}
              >
                {isRu ? 'Можно без опыта' : 'Тәжірибесіз болады'}
              </button>
              {typeof r.taken === 'number' && r.taken > 0 && (
                <span style={{ fontSize: 12, color: r.capacity && r.taken > r.capacity ? 'var(--warn, #9a5a24)' : 'var(--ink-3)' }}>
                  {isRu ? `занято ${r.taken}` : `${r.taken} орын алынған`}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button
        full
        variant="secondary"
        icon="plus"
        style={{ marginBottom: 14 }}
        onClick={() => addRow({ titleRu: '', titleKz: '', capacity: 1, newbie: false })}
        disabled={rows.length >= ROLES_MAX}
      >
        {isRu ? 'Своя роль' : 'Өз рөлі'}
      </Button>

      {/* Справочная строка, НЕ ошибка: needed остаётся авторитетным числом (на нём висят
          прогноз и полоса явки), роли — необязательная разбивка. */}
      {rows.length > 0 && typeof needed === 'number' && totalSlots !== needed && (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.45, marginBottom: 16 }}>
          {isRu
            ? `Мест по ролям: ${totalSlots} · нужно рук: ${needed} → остальные запишутся без роли.`
            : `Рөлдер бойынша орын: ${totalSlots} · қажет: ${needed} → қалғандары рөлсіз жазылады.`}
        </div>
      )}

      <Button full size="lg" loading={busy} onClick={save}>
        {draft ? (isRu ? 'Готово' : 'Дайын') : (isRu ? 'Сохранить' : 'Сақтау')}
      </Button>
    </Sheet>
  );
}

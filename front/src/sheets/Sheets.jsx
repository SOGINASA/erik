import { useState } from 'react';
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
import { SKILL_LIST, skillLabel } from '../lib/data';
import { useOrganizerStore } from '../store/useOrganizerStore';
import { RelChip, SkillTags } from '../components/manage/parts';
import { useGuardedNav } from '../lib/nav';
import { copyToClipboard } from '../lib/share';
import { api } from '../lib/api';

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
    case 'editprofile': return <EditProfileSheet />;
    case 'apply': return <ApplySheet />;
    case 'applicant': return <ApplicantSheet />;
    default: return null;
  }
}

function EditProfileSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const me = usePlatformStore((s) => s.me);
  const cities = usePlatformStore((s) => s.cities);
  const loadMe = usePlatformStore((s) => s.loadMe);
  const setIdentity = useSessionStore((s) => s.setIdentity);
  const phone = useSessionStore((s) => s.phone);
  const [name, setName] = useState(me.name || '');
  const [cityId, setCityId] = useState(me.cityId || '');
  const [skills, setSkills] = useState((me.skills || []).join(', '));

  const save = async () => {
    const payload = {
      name: name.trim() || undefined,
      cityId: cityId || undefined,
      skills: skills.split(',').map((x) => x.trim()).filter(Boolean),
    };
    try { await api.updateMe(payload); } catch (_) { /* офлайн */ }
    if (payload.name) setIdentity(payload.name, phone);
    loadMe();
    close();
    showToast(isRu ? 'Профиль сохранён' : 'Профиль сақталды');
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
      <Button full size="lg" style={{ marginTop: 20 }} onClick={save}>{t.save}</Button>
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
  const isOrganizer = role === 'coord' || role === 'org';
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
        {isOrganizer && item('list', t.myGatherings, () => goClose('/me', 'me'))}
        {item('users', t.navProfile, () => goClose('/u/me', 'profile'))}
        {item('trophy', t.navLeader, () => goClose('/leaderboard', 'leaderboard'))}
        {item('heart', t.navCharity, () => goClose('/charity', 'charity'))}
        {item('bell', t.navNotif, () => goClose('/notifications', 'notifications'))}
        {isAdmin && item('shield', t.navAdmin, () => goClose('/admin', 'admin'))}
        <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
        {loggedIn
          ? item('external', t.logout, () => { logout(); close(); navigate('/'); showToast(isRu ? 'Вы вышли из аккаунта' : 'Аккаунттан шықтыңыз'); }, true)
          : item('users', t.loginWord, () => { close(); navigate('/onboarding'); })}
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
  const act = () => { if (isFinish) finish(); else del(); close(); navigate('/me'); };
  return (
    <Sheet open onClose={close} title={title} maxWidth={420}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 20px' }}>{body}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button full size="lg" variant={isFinish ? 'primary' : 'danger'} onClick={act}>{isFinish ? t.finish : t.deleteGathering}</Button>
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
  const p = useUiStore((s) => s.sheetPayload) || {};
  const changeAnswerFor = useGatheringStore((s) => s.changeAnswerFor);
  const removeParticipant = useGatheringStore((s) => s.removeParticipant);
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
  return (
    <Sheet open onClose={close} title={p.name || ''}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <Avatar name={p.name} size={52} fontScale={0.4} />
        <div>
          <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--ink-2)' }}>{p.phone || '—'}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{hist}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>{['yes', 'maybe', 'no'].map(pBtn)}</div>
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
  return (
    <Sheet open onClose={close} title={t.remindTitle}>
      <div style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 14 }}>{isRu ? `Уйдёт ${maybeCount} участникам «под вопросом»` : `${maybeCount} «белгісіз» қатысушыға жіберіледі`}</div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Button full size="lg" onClick={async () => { await remind(text); close(); showToast(isRu ? 'Напоминание отправлено' : 'Еске салу жіберілді'); }}>{t.send}</Button>
        <Button full variant="ghost" onClick={close}>{t.cancel}</Button>
      </div>
    </Sheet>
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
  const incNeeded = useGatheringStore((s) => s.incNeeded);
  const decNeeded = useGatheringStore((s) => s.decNeeded);
  const saveGathering = useGatheringStore((s) => s.saveGathering);
  return (
    <Sheet open onClose={close} title={t.settingsTitle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label={t.fWhat} value={isRu ? g.titleRu : g.titleKz} onChange={(e) => setTitle(e.target.value)} />
        <Field label={t.fWhere} value={isRu ? g.placeRu : g.placeKz} onChange={(e) => setPlace(e.target.value)} />
        <div>
          <FieldLabel>{t.fNeeded}</FieldLabel>
          <Stepper value={g.needed} onDec={decNeeded} onInc={incNeeded} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button full size="lg" onClick={() => { saveGathering(); close(); }}>{t.save}</Button>
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
  const eventId = useUiStore((s) => s.sheetPayload);
  const registerEvent = useGatheringStore((s) => s.registerEvent);
  const cur = useGatheringStore((s) => s.regs)[eventId];
  const pick = (a) => { registerEvent(eventId, a); close(); };
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
  const amts = [1000, 2000, 5000];
  return (
    <Sheet open onClose={close} title={t.helpTitle} maxWidth={420}>
      <div style={{ fontSize: 15, color: 'var(--ink-2)', marginBottom: 16 }}>{title}</div>
      <FieldLabel>{t.donateAmount}</FieldLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {amts.map((a) => (
          <button key={a} type="button" className="erik-btn" onClick={() => setDonateAmt(a)} style={{ flex: 1, height: 44, borderRadius: 'var(--r-m)', border: `1px solid ${donateAmt === a ? 'var(--yard)' : 'var(--line)'}`, background: donateAmt === a ? 'var(--yard-soft)' : 'var(--surface)', color: 'var(--ink)', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--fm)' }}>{a.toLocaleString('ru-RU')} ₸</button>
        ))}
      </div>
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
  const toggle = (id) => setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = () => {
    addApplication({ eventId, name: name || me.name, phone, city: me.city, skills, message });
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
      <Button full size="lg" style={{ marginTop: 18 }} onClick={send}>{t.mgApplySend}</Button>
    </Sheet>
  );
}

// Организатор рассматривает одну заявку: детали волонтёра + принять/отклонить.
function ApplicantSheet() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const close = useUiStore((s) => s.closeSheet);
  const showToast = useUiStore((s) => s.showToast);
  const a = useUiStore((s) => s.sheetPayload) || {};
  const events = useOrganizerStore((s) => s.events);
  const accept = useOrganizerStore((s) => s.acceptApplication);
  const decline = useOrganizerStore((s) => s.declineApplication);

  const ev = events.find((e) => e.id === a.eventId);
  const evTitle = ev ? (isRu ? ev.titleRu : ev.titleKz) : '';
  const hist = a.history && a.history.total > 0
    ? isRu ? `был ${a.history.came} из ${a.history.total} раз` : `${a.history.total} реттен ${a.history.came} рет келген`
    : t.mgNewVol;
  const msg = isRu ? a.messageRu : a.messageKz;
  const pending = a.status === 'pending';

  return (
    <Sheet open onClose={close} title={a.name || ''}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Avatar name={a.name} size={52} fontScale={0.4} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--ink-2)' }}>{a.phone || '—'}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{a.city} · {hist}</div>
        </div>
        <span style={{ marginLeft: 'auto' }}><RelChip value={a.reliability} label={t.mgReliability} /></span>
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
            <Button full size="lg" icon="check" onClick={() => accept(a.id)}>{t.mgAccept}</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" icon="phone" onClick={() => a.phone ? (window.location.href = `tel:${a.phone}`) : showToast(isRu ? 'Телефон не указан' : 'Телефон көрсетілмеген')} style={{ flex: 1 }}>{t.personCall}</Button>
              <Button variant="ghost" onClick={() => decline(a.id)} style={{ color: 'var(--ink-2)' }}>{t.mgDecline}</Button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>{a.status === 'accepted' ? t.mgStatusAccepted : t.mgStatusDeclined}</div>
      )}
    </Sheet>
  );
}

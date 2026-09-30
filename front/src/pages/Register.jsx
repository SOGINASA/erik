import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { api } from '../lib/api';
import { THEMES } from '../lib/data';
import { Logo, LangToggle } from '../components/shell/Brand';
import { FieldLabel } from '../components/ui/controls';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import RegistrationConsent, { EMPTY_CONSENTS } from '../components/RegistrationConsent';
import { guestReturnTo } from '../lib/authReturnTo';

const ROLES = [
  { id: 'vol', title: 'Волонтёр', desc: 'Нахожу сборы рядом и участвую', icon: 'users' },
  { id: 'coord', title: 'Координатор', desc: 'Организую сборы и вижу прогноз явки', icon: 'calendar' },
  { id: 'org', title: 'НКО / организация', desc: 'Веду волонтёров и события', icon: 'shield' },
];
const STEP_TITLE = ['Кто вы на erik?', 'Давайте познакомимся', 'Придумайте пароль', 'Ваш город и интересы'];
const STEP_SUB = [
  'Роль можно поменять в любой момент',
  'Так вас увидят координаторы и соседи',
  'Нужен, чтобы вернуться к своим сборам',
  'Покажем сборы рядом и по вашим темам',
];

// Поле ввода с иконкой (и опциональным элементом справа).
function WField({ icon, right, ...props }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}><Icon name={icon} size={18} /></span>
      <input className="erik-input" style={{ width: '100%', height: 52, padding: `0 ${right ? 46 : 14}px 0 42px`, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', fontSize: 15, color: 'var(--ink)', outline: 'none' }} {...props} />
      {right && <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>{right}</span>}
    </div>
  );
}

function strength(pw) {
  let s = 0;
  if (pw.length >= 4) s++;
  if (pw.length >= 8) s++;
  if (/\d/.test(pw) && /[a-zA-Zа-яА-Я]/.test(pw)) s++;
  return s; // 0..3
}

// Многошаговый визард регистрации с анимированными переходами.
export default function Register() {
  const navigate = useNavigate();
  const returnTo = guestReturnTo(useLocation().search);
  const cities = usePlatformStore((s) => s.cities);
  const registerAccount = useSessionStore((s) => s.registerAccount);
  const showToast = useUiStore((s) => s.showToast);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState('next');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ role: '', name: '', phone: '', email: '', password: '', confirm: '', city: '', interests: [] });
  const [consents, setConsents] = useState({ ...EMPTY_CONSENTS });
  const [legal, setLegal] = useState(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalError, setLegalError] = useState(false);
  const [legalReload, setLegalReload] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const up = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === 'name') setConsents({ ...EMPTY_CONSENTS });
  };

  useEffect(() => {
    let active = true;
    setLegalLoading(true);
    setLegalError(false);
    api.legal().then((result) => {
      if (active) setLegal(result);
    }).catch(() => {
      if (active) { setLegal(null); setLegalError(true); }
    }).finally(() => {
      if (active) setLegalLoading(false);
    });
    return () => { active = false; };
  }, [legalReload]);

  const reloadLegal = () => {
    setConsents({ ...EMPTY_CONSENTS });
    setLegalLoading(true);
    setLegalReload((value) => value + 1);
  };

  const validSteps = [
    !!form.role,
    form.name.trim().split(/\s+/).length >= 2,
    // Email/логин ОБЯЗАТЕЛЕН: без него finish() шёл беспарольным device-путём и молча терял
    // пароль, город и телефон, показывая при этом «Аккаунт создан».
    !!form.email.trim() && form.password.length >= 8 && form.password === form.confirm,   // min 8 — как на бэке
    !!form.city,
  ];
  const valid = validSteps[step];
  const legalReady = !legalLoading && !legalError && legal?.registrationAvailable && !!legal.version;
  const canRegister = validSteps.every(Boolean) && legalReady && Object.values(consents).every(Boolean);

  const next = () => { if (step < 3 && valid) { setError(''); setDir('next'); setStep(step + 1); } };
  const back = () => { if (step > 0) { setError(''); setDir('prev'); setStep(step - 1); } };

  const finish = async () => {
    if (!canRegister || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await registerAccount({
        identifier: form.email.trim(), password: form.password, full_name: form.name.trim(),
        role: form.role, phone: form.phone.trim() || null, cityId: form.city, interests: form.interests,
        legal: { ...consents, version: legal.version },
      });
      showToast('Аккаунт создан. Добро пожаловать в erik!');
      navigate(returnTo || (form.role === 'vol' ? '/feed' : '/manage'));
    } catch (err) {
      if (err?.data?.code === 'legal_version_mismatch') {
        setError('Условия обновились. Прочитайте документы ещё раз и подтвердите новую редакцию.');
        reloadLegal();
      } else if (err?.data?.code === 'legal_configuration_required') {
        setError('Регистрация временно недоступна. Пожалуйста, попробуйте позже.');
        reloadLegal();
      } else {
        setError(err?.data?.error || 'Не удалось создать аккаунт. Проверьте соединение и попробуйте ещё раз.');
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  const toggleInterest = (k) => up('interests', form.interests.includes(k) ? form.interests.filter((x) => x !== k) : [...form.interests, k]);
  const chip = (on, tint, ink) => ({ height: 36, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? (ink || 'var(--yard)') : 'var(--line)'}`, background: on ? (tint || 'var(--yard-soft)') : 'var(--surface)', color: on ? (ink || 'var(--yard)') : 'var(--ink-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' });

  const st = strength(form.password);
  const stColor = ['var(--danger)', 'var(--maybe)', 'var(--maybe)', 'var(--yard)'][st];
  const stLabel = ['слишком короткий', 'слабый', 'нормальный', 'надёжный'][st];

  const renderStep = () => {
    if (step === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ROLES.map((r) => {
            const on = form.role === r.id;
            return (
              <button key={r.id} type="button" className="erik-btn" aria-pressed={on} onClick={() => up('role', r.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 'var(--r-m)', border: `1.5px solid ${on ? 'var(--yard)' : 'var(--line)'}`, background: on ? 'var(--yard-soft)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: on ? 'var(--yard)' : 'var(--paper)', color: on ? '#fff' : 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background var(--t-fast)' }}><Icon name={r.icon} size={20} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)' }}>{r.title}</span>
                  <span style={{ display: 'block', fontSize: 14, color: 'var(--ink-2)' }}>{r.desc}</span>
                </span>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 999, border: `2px solid ${on ? 'var(--yard)' : 'var(--line)'}`, background: on ? 'var(--yard)' : 'transparent', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Icon name="check" size={14} stroke={3} />}</span>
              </button>
            );
          })}
        </div>
      );
    }
    if (step === 1) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {form.role === 'org' && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>Укажите данные представителя. Организацию можно добавить после регистрации.</p>}
          <div>
            <FieldLabel>Фамилия, имя и отчество (при наличии)</FieldLabel>
            <WField icon="users" aria-label="Фамилия, имя и отчество (при наличии)" autoComplete="name" maxLength={120} value={form.name} onChange={(e) => up('name', e.target.value)} placeholder="Фамилия и имя" />
          </div>
          <div>
            <FieldLabel>Телефон <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· необязательно</span></FieldLabel>
            <WField icon="phone" aria-label="Телефон (необязательно)" type="tel" autoComplete="tel" maxLength={32} value={form.phone} onChange={(e) => up('phone', e.target.value)} placeholder="+7 700 000 00 00" />
          </div>
        </div>
      );
    }
    if (step === 2) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <FieldLabel>Email или логин <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· для входа по паролю</span></FieldLabel>
            <WField icon="mail" aria-label="Email или логин" type="text" maxLength={255} value={form.email} onChange={(e) => up('email', e.target.value)} placeholder="you@example.kz" autoComplete="username" />
          </div>
          <div>
            <FieldLabel>Пароль</FieldLabel>
            <WField icon="lock" aria-label="Пароль" autoComplete="new-password" type={show ? 'text' : 'password'} value={form.password} onChange={(e) => up('password', e.target.value)} placeholder="Минимум 8 символов"
              right={<button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Скрыть' : 'Показать'} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' }}><Icon name={show ? 'eyeOff' : 'eye'} size={18} /></button>} />
            {form.password && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < st ? stColor : 'var(--line)', transition: 'background var(--t-fast)' }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: stColor }}>{stLabel}</span>
              </div>
            )}
          </div>
          <div>
            <FieldLabel>Повторите пароль</FieldLabel>
            <WField icon="lock" aria-label="Повторите пароль" autoComplete="new-password" type={show ? 'text' : 'password'} value={form.confirm} onChange={(e) => up('confirm', e.target.value)} placeholder="Ещё раз" />
            {form.confirm && form.confirm !== form.password && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--danger)' }}>Пароли не совпадают</div>}
          </div>
        </div>
      );
    }
    // step 3 — город + интересы
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <FieldLabel>Город</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {cities.map((c) => (
              <button key={c.id} type="button" className="erik-btn" aria-pressed={form.city === c.id} onClick={() => up('city', c.id)} style={chip(form.city === c.id)}>{c.ru}</button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Что вам интересно? <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· необязательно</span></FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {Object.keys(THEMES).map((k) => (
              <button key={k} type="button" className="erik-btn" aria-pressed={form.interests.includes(k)} onClick={() => toggleInterest(k)} style={chip(form.interests.includes(k), THEMES[k].tint, THEMES[k].ink)}>{THEMES[k].ru}</button>
            ))}
          </div>
        </div>
        <RegistrationConsent legal={legal} loading={legalLoading} error={legalError} values={consents}
          onChange={(key, checked) => setConsents((values) => ({ ...values, [key]: checked }))} onRetry={reloadLegal} />
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <Logo size={24} onClick={() => navigate('/')} />
        <LangToggle />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '16px 20px 48px' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <form onSubmit={(event) => { event.preventDefault(); if (step === 3) finish(); else next(); }}>
            <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              {/* прогресс */}
              <div style={{ marginBottom: 26 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: i <= step ? '100%' : '0%', background: 'var(--yard)', transition: 'width var(--t-move) var(--ease-soft)' }} />
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--fm)' }}>Шаг {step + 1} из 4</span>
              </div>

              {/* заголовок + контент шага (анимируется при смене) */}
              <div key={step} style={{ animation: `${dir === 'next' ? 'erik-slide-r' : 'erik-slide-l'} var(--t-move) var(--ease-out)` }}>
                <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 27, letterSpacing: '-.02em', margin: '0 0 4px' }}>{STEP_TITLE[step]}</h1>
                <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 22px' }}>{STEP_SUB[step]}</p>
                {renderStep()}
              </div>

              {error && <p role="alert" style={{ margin: '18px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--danger)' }}>{error}</p>}

              {/* навигация */}
              <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
                {step > 0 && <Button type="button" variant="ghost" size="lg" onClick={back} icon="back">Назад</Button>}
                <Button type="submit" size="lg" loading={pending} disabled={step === 3 ? !canRegister : !valid} full style={{ flex: 1 }}>{pending ? 'Создаём аккаунт…' : step === 3 ? 'Создать аккаунт' : 'Продолжить'}</Button>
              </div>

              <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-2)', marginTop: 22 }}>
                Уже есть аккаунт?{' '}
                <Link to={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'} style={{ color: 'var(--yard)', fontWeight: 500 }}>Войти</Link>
              </p>
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  );
}

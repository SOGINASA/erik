import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { THEMES } from '../lib/data';
import { Logo, LangToggle } from '../components/shell/Brand';
import { FieldLabel } from '../components/ui/controls';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';

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
  const cities = usePlatformStore((s) => s.cities);
  const setIdentity = useSessionStore((s) => s.setIdentity);
  const setRole = useSessionStore((s) => s.setRole);
  const login = useSessionStore((s) => s.login);
  const registerAccount = useSessionStore((s) => s.registerAccount);
  const showToast = useUiStore((s) => s.showToast);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState('next');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ role: '', name: '', phone: '', orgName: '', email: '', password: '', confirm: '', city: '', interests: [] });
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const displayName = (form.role === 'org' ? form.orgName : form.name).trim();
  const valid = [
    !!form.role,
    !!form.name.trim() && (form.role !== 'org' || !!form.orgName.trim()),
    form.password.length >= 6 && form.password === form.confirm,   // min 6 — как на бэке
    !!form.city,
  ][step];

  const next = () => { if (step < 4 && valid) { setDir('next'); setStep(step + 1); } };
  const back = () => { if (step > 0) { setDir('prev'); setStep(step - 1); } };

  // Если задан email/логин — создаём реальный аккаунт (email/пароль).
  // Иначе (и при ошибке — например, занятый email) поднимаем device-личность.
  const finish = async () => {
    setIdentity(displayName, form.phone.trim() || null);
    setRole(form.role);
    const identifier = form.email.trim();
    try {
      if (identifier) {
        await registerAccount({
          identifier, password: form.password, full_name: displayName,
          role: form.role, phone: form.phone.trim() || null, cityId: form.city,
        });
      } else {
        await login();
      }
      showToast('Аккаунт создан. Добро пожаловать в erik!');
    } catch (err) {
      await login(); // запасной вариант — не блокируем демо
      showToast((err && err.data && err.data.error) || 'Вход выполнен');
    }
    navigate(form.role === 'vol' ? '/feed' : '/manage');
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
              <button key={r.id} type="button" className="erik-btn" onClick={() => up('role', r.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 'var(--r-m)', border: `1.5px solid ${on ? 'var(--yard)' : 'var(--line)'}`, background: on ? 'var(--yard-soft)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
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
          {form.role === 'org' && (
            <div>
              <FieldLabel>Название организации</FieldLabel>
              <WField icon="shield" value={form.orgName} onChange={(e) => up('orgName', e.target.value)} placeholder="Чистый двор" />
            </div>
          )}
          <div>
            <FieldLabel>{form.role === 'org' ? 'Контактное лицо' : 'Ваше имя'}</FieldLabel>
            <WField icon="users" value={form.name} onChange={(e) => up('name', e.target.value)} placeholder="Как вас зовут" />
          </div>
          <div>
            <FieldLabel>Телефон <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· необязательно</span></FieldLabel>
            <WField icon="phone" type="tel" value={form.phone} onChange={(e) => up('phone', e.target.value)} placeholder="+7 700 000 00 00" />
          </div>
        </div>
      );
    }
    if (step === 2) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <FieldLabel>Email или логин <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· для входа по паролю</span></FieldLabel>
            <WField icon="mail" type="text" value={form.email} onChange={(e) => up('email', e.target.value)} placeholder="you@example.kz" autoComplete="username" />
          </div>
          <div>
            <FieldLabel>Пароль</FieldLabel>
            <WField icon="lock" type={show ? 'text' : 'password'} value={form.password} onChange={(e) => up('password', e.target.value)} placeholder="Минимум 6 символов"
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
            <WField icon="lock" type={show ? 'text' : 'password'} value={form.confirm} onChange={(e) => up('confirm', e.target.value)} placeholder="Ещё раз" />
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
              <button key={c.id} type="button" className="erik-btn" onClick={() => up('city', c.id)} style={chip(form.city === c.id)}>{c.ru}</button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Что вам интересно? <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· необязательно</span></FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {Object.keys(THEMES).map((k) => (
              <button key={k} type="button" className="erik-btn" onClick={() => toggleInterest(k)} style={chip(form.interests.includes(k), THEMES[k].tint, THEMES[k].ink)}>{THEMES[k].ru}</button>
            ))}
          </div>
        </div>
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
          {step < 4 ? (
            <>
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

              {/* навигация */}
              <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
                {step > 0 && <Button variant="ghost" size="lg" onClick={back} icon="back">Назад</Button>}
                <Button size="lg" onClick={next} disabled={!valid} full style={{ flex: 1 }}>{step === 3 ? 'Создать аккаунт' : 'Продолжить'}</Button>
              </div>

              <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-2)', marginTop: 22 }}>
                Уже есть аккаунт?{' '}
                <Link to="/login" style={{ color: 'var(--yard)', fontWeight: 500 }}>Войти</Link>
              </p>
            </>
          ) : (
            // финальный экран
            <div style={{ textAlign: 'center', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
              <div style={{ width: 88, height: 88, margin: '0 auto 22px', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'erik-check-pop .5s var(--ease-out)' }}>
                <Icon name="check" size={46} stroke={2.4} />
              </div>
              <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '0 0 6px' }}>Готово, {displayName || 'друг'}!</h1>
              <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 28px' }}>Аккаунт создан. Добро пожаловать в движение — осталось начать.</p>
              <Button size="lg" full onClick={finish}>Начать</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { Logo, LangToggle } from '../components/shell/Brand';
import { FieldLabel } from '../components/ui/controls';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';

// Быстрый вход по типу пользователя (демо).
const PERSONAS = [
  { role: 'vol', label: 'Волонтёр', icon: 'users', to: '/feed' },
  { role: 'coord', label: 'Координатор', icon: 'calendar', to: '/manage' },
  { role: 'org', label: 'НКО', icon: 'shield', to: '/manage' },
];

function AuthField({ icon, right, ...props }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}><Icon name={icon} size={18} /></span>
      <input
        className="erik-input"
        style={{ width: '100%', height: 52, padding: `0 ${right ? 46 : 14}px 0 42px`, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', fontSize: 15, color: 'var(--ink)', outline: 'none' }}
        {...props}
      />
      {right && <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>{right}</span>}
    </div>
  );
}

// Страница входа. Логин + пароль и три кнопки быстрого входа по роли.
export default function Login() {
  const navigate = useNavigate();
  const login = useSessionStore((s) => s.login);
  const loginWithPassword = useSessionStore((s) => s.loginWithPassword);
  const setRole = useSessionStore((s) => s.setRole);
  const showToast = useUiStore((s) => s.showToast);

  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Реальный вход по паролю (аккаунт). 401 → тост «Неверные данные».
  // Быстрый вход по роли ниже остаётся device-логином (демо).
  const submit = async (e) => {
    e.preventDefault();
    if (!id.trim() || !pass) return;
    setBusy(true);
    try {
      await loginWithPassword({ identifier: id.trim(), password: pass });
      navigate('/feed');
      showToast('С возвращением!');
    } catch (err) {
      showToast(err && err.status === 401 ? 'Неверные данные' : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  const quick = async (p) => {
    setRole(p.role);
    await login();
    navigate(p.to);
    showToast(`Вход как ${p.label}`);
  };

  const quickAdmin = async () => {
    setRole('admin');
    await login();
    navigate('/admin');
    showToast('Вход как администратор');
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <Logo size={24} onClick={() => navigate('/')} />
        <LangToggle />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px 20px 48px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, letterSpacing: '-.02em', margin: '0 0 6px' }}>С возвращением</h1>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 28px' }}>Войдите, чтобы вести сборы и видеть прогноз явки</p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <FieldLabel>Телефон или email</FieldLabel>
              <AuthField icon="mail" type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="you@example.kz" autoComplete="username" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <FieldLabel>Пароль</FieldLabel>
                <button type="button" onClick={() => showToast('Ссылка для сброса отправлена')} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 6 }}>Забыли пароль?</button>
              </div>
              <AuthField
                icon="lock"
                type={show ? 'text' : 'password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                right={
                  <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Скрыть' : 'Показать'} style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer' }}>
                    <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                }
              />
            </div>
            <Button type="submit" size="lg" full loading={busy} disabled={!id.trim() || !pass}>Войти</Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 12, color: 'var(--ink-3)', letterSpacing: '.02em' }}>или войти как</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {PERSONAS.map((p) => (
              <button
                key={p.role}
                type="button"
                className="erik-btn erik-lift"
                onClick={() => quick(p)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', cursor: 'pointer' }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={p.icon} size={18} /></span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{p.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="erik-btn"
            onClick={quickAdmin}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 46, marginTop: 12, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}
          >
            <Icon name="shield" size={18} /> Войти как администратор
          </button>

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-2)', marginTop: 24 }}>
            Нет аккаунта?{' '}
            <Link to="/register" style={{ color: 'var(--yard)', fontWeight: 500 }}>Создать</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

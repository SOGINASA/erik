import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { api } from '../lib/api';
import { Logo, LangToggle } from '../components/shell/Brand';
import { FieldLabel } from '../components/ui/controls';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { guestReturnTo } from '../lib/authReturnTo';
import GoogleLoginButton from '../components/GoogleLoginButton';

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

// Вход по email или никнейму и паролю.
export default function Login() {
  const navigate = useNavigate();
  const returnTo = guestReturnTo(useLocation().search);
  const loginWithPassword = useSessionStore((s) => s.loginWithPassword);
  const showToast = useUiStore((s) => s.showToast);

  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Реальный вход по паролю (аккаунт). 401 → тост «Неверные данные».
  const submit = async (e) => {
    e.preventDefault();
    if (!id.trim() || !pass || busy) return;
    setBusy(true);
    try {
      const result = await loginWithPassword({ identifier: id.trim(), password: pass });
      navigate(result.user?.user_type === 'admin' ? '/admin' : returnTo || '/feed');
      showToast('С возвращением!');
    } catch (err) {
      showToast(err?.status === 401
        ? 'Неверный email, никнейм или пароль. Если аккаунта ещё нет — создайте его.'
        : err?.data?.error || (err?.status ? 'Не удалось войти. Попробуйте позже.' : 'Не удалось связаться с сервером. Проверьте соединение.'));
    } finally {
      setBusy(false);
    }
  };

  // «Забыли пароль»: шлём реальный запрос по email из поля логина.
  const forgot = async () => {
    const email = id.trim();
    if (!email || !email.includes('@')) {
      showToast('Введите email в поле логина');
      return;
    }
    try {
      await api.forgotPassword(email);
      showToast('Если такой email есть — письмо для сброса отправлено');
    } catch (err) {
      showToast(err?.data?.error || 'Не удалось запросить восстановление пароля. Попробуйте позже.');
    }
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

          <GoogleLoginButton returnTo={returnTo} />
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <FieldLabel>Email или никнейм</FieldLabel>
              <AuthField icon="mail" type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder="you@example.kz" autoComplete="username" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <FieldLabel>Пароль</FieldLabel>
                <button type="button" onClick={forgot} style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 6 }}>Забыли пароль?</button>
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

          <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-2)', marginTop: 24 }}>
            Нет аккаунта?{' '}
            <Link to={returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : '/register'} style={{ color: 'var(--yard)', fontWeight: 500 }}>Создать</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

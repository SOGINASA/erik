import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { readGoogleLogin, clearGoogleLogin } from '../lib/oauth';
import { useSessionStore } from '../store/useSessionStore';
import { Logo } from '../components/shell/Brand';
import Button from '../components/ui/Button';
import RegistrationConsent, { EMPTY_CONSENTS } from '../components/RegistrationConsent';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [login] = useState(() => readGoogleLogin(window.location.hash));
  const [phase, setPhase] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [legal, setLegal] = useState(null);
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState(false);
  const [consents, setConsents] = useState({ ...EMPTY_CONSENTS });
  const [busy, setBusy] = useState(!!login);
  const [error, setError] = useState(login ? '' : 'Вход отменён или истёк. Вернитесь и попробуйте снова.');
  const firstRequest = useRef(null);
  const submitting = useRef(false);

  const loadLegal = async () => {
    setConsents({ ...EMPTY_CONSENTS });
    setLegalLoading(true);
    setLegalError(false);
    try { setLegal(await api.legal()); }
    catch (_) { setLegalError(true); }
    finally { setLegalLoading(false); }
  };
  const finish = (result) => {
    if (result.access_token) {
      useSessionStore.getState().acceptOAuthSession(result);
      clearGoogleLogin();
      navigate(result.user.user_type === 'admin' ? '/admin' : login.returnTo || '/feed', { replace: true });
    } else {
      setPhase(result.status);
      setName(result.full_name || '');
      if (result.status === 'registration_required') loadLegal();
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!login) return;
    let active = true;
    // Reuse the promise during StrictMode effect replay: codes are single-use.
    if (!firstRequest.current) firstRequest.current = api.oauthExchange({ code: login.code, verifier: login.verifier });
    firstRequest.current.then((result) => { if (active) finishRef.current(result); })
      .catch((err) => { if (active) setError(err.data?.error || 'Не удалось связаться с сервером. Попробуйте ещё раз.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [login]);

  const submit = async (event) => {
    event.preventDefault();
    if (!login || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      finish(await api.oauthExchange({ code: login.code, verifier: login.verifier,
        ...(phase === 'link_required' ? { password } : {}),
        ...(phase === 'registration_required' ? { full_name: name.trim(), legal: { ...consents, version: legal?.version } } : {}),
      }));
    } catch (err) {
      setError(err.data?.error || 'Не удалось завершить вход. Попробуйте ещё раз.');
      if (err.data?.code === 'legal_version_mismatch') await loadLegal();
    } finally { setBusy(false); submitting.current = false; }
  };
  const canSubmit = phase === 'link_required' ? !!password : phase === 'registration_required'
    ? name.trim().split(/\s+/).length >= 2 && legal?.registrationAvailable && !legalLoading && !legalError && Object.values(consents).every(Boolean)
    : true;
  return (
    <main style={{ minHeight: '100dvh', padding: '24px 20px 48px' }}>
      <Logo size={24} onClick={() => navigate('/')} />
      <div style={{ maxWidth: 440, margin: '48px auto', overflowWrap: 'anywhere' }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontSize: 30, lineHeight: 1.2 }}>Вход через Google</h1>
        {busy && <p role="status">Завершаем вход…</p>}
        {error && <p role="alert" style={{ color: 'var(--danger)', lineHeight: 1.5 }}>{error}</p>}
        {login && <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {phase === 'link_required' && <>
            <p style={{ color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>Аккаунт с этим email уже есть. Введите его пароль, чтобы привязать Google и сохранить свой профиль и историю.</p>
            <label>Пароль аккаунта<input className="erik-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={1024} style={{ display: 'block', width: '100%', marginTop: 8 }} /></label>
          </>}
          {phase === 'registration_required' && <>
            <p style={{ color: 'var(--ink-2)', lineHeight: 1.5, margin: 0 }}>Google подтверждён. Укажите своё имя и прочитайте условия, чтобы создать профиль волонтёра.</p>
            <label>Фамилия и имя<input className="erik-input" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setConsents({ ...EMPTY_CONSENTS }); }} required maxLength={100} style={{ display: 'block', width: '100%', marginTop: 8 }} /></label>
            <RegistrationConsent legal={legal} loading={legalLoading} error={legalError} values={consents} onChange={(key, value) => setConsents((old) => ({ ...old, [key]: value }))} onRetry={loadLegal} />
          </>}
          {(!busy || phase) && <Button type="submit" full size="lg" loading={busy} disabled={!canSubmit}>{phase === 'link_required' ? 'Привязать Google и войти' : phase === 'registration_required' ? 'Создать аккаунт' : 'Повторить'}</Button>}
        </form>}
        <p style={{ marginTop: 24 }}><Link to="/login" style={{ color: 'var(--yard)' }}>Вернуться ко входу</Link></p>
      </div>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { startGoogleLogin } from '../lib/oauth';
import Button from './ui/Button';

export default function GoogleLoginButton({ returnTo }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.oauthProviders().then((result) => { if (active) setEnabled(result.providers.includes('google')); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!enabled) return null;
  const start = async () => {
    setBusy(true);
    setError('');
    try { await startGoogleLogin(returnTo); }
    catch (_) { setError('Не удалось открыть Google. Разрешите хранилище браузера и попробуйте снова.'); setBusy(false); }
  };
  return (
    <div style={{ margin: '20px 0' }}>
      <Button type="button" variant="secondary" size="lg" full loading={busy} onClick={start}>Продолжить с Google</Button>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
    </div>
  );
}

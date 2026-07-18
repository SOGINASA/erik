import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';
import { Logo, LangToggle } from '../components/shell/Brand';
import Button from '../components/ui/Button';

// Онбординг: выбор роли. Standalone-экран без шелла.
export default function Onboarding() {
  const t = useT();
  const navigate = useNavigate();
  const role = useSessionStore((s) => s.role) || 'vol';
  const setRole = useSessionStore((s) => s.setRole);
  const login = useSessionStore((s) => s.login);
  const showToast = useUiStore((s) => s.showToast);
  const isRu = useSessionStore((s) => s.lang) === 'ru';

  const roles = [
    { k: 'vol', title: t.roleVol, desc: t.roleVolDesc },
    { k: 'coord', title: t.roleCoord, desc: t.roleCoordDesc },
    { k: 'org', title: t.roleOrg, desc: t.roleOrgDesc },
  ];

  const finish = () => {
    login();
    navigate('/feed');
    showToast(isRu ? 'Добро пожаловать в erik!' : 'erik-ке қош келдіңіз!');
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <Logo size={24} onClick={() => navigate('/')} />
        <LangToggle />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px 20px 48px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 26, letterSpacing: '-.02em', margin: '0 0 4px' }}>{t.onboardTitle}</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '0 0 20px' }}>{t.onboardSub}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {roles.map((r) => {
              const on = role === r.k;
              return (
                <button
                  key={r.k}
                  type="button"
                  className="erik-btn"
                  onClick={() => setRole(r.k)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6, padding: 18, borderRadius: 'var(--r-m)',
                    border: `1.5px solid ${on ? 'var(--yard)' : 'var(--line)'}`, background: on ? 'var(--yard-soft)' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)' }}>{r.title}</span>
                  <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{r.desc}</span>
                </button>
              );
            })}
          </div>
          <Button full size="lg" onClick={finish} style={{ marginTop: 20 }}>{t.continueWord}</Button>
        </div>
      </div>
    </div>
  );
}

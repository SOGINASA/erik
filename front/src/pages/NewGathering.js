import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { useSessionStore } from '../store/useSessionStore';
import { useIsDesktop } from '../lib/nav';
import { Container, BackButton } from '../components/Container';
import { Field, FieldLabel, Stepper } from '../components/ui/controls';
import Button from '../components/ui/Button';

// Создание сбора: одна страница, не визард. Липкая панель снизу.
export default function NewGathering() {
  const t = useT();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const hasName = !!useSessionStore((s) => s.name);
  const setTitle = useGatheringStore((s) => s.setTitle);
  const setPlace = useGatheringStore((s) => s.setPlace);
  const setNeeded = useGatheringStore((s) => s.setNeeded);
  const openSheet = useUiStore((s) => s.openSheet);

  const [form, setForm] = useState({ what: '', where: '', date: '2026-07-18', time: '10:00', needed: 20, name: '' });
  const up = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = () => {
    if (form.what.trim()) setTitle(form.what.trim());
    if (form.where.trim()) setPlace(form.where.trim());
    setNeeded(form.needed);
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
          <Field label={t.fWhat} value={form.what} onChange={up('what')} placeholder={t.fWhatPh} />
          <Field label={t.fWhere} value={form.where} onChange={up('where')} placeholder={t.fWherePh} />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label={t.fWhenDate} type="date" value={form.date} onChange={up('date')} />
            </div>
            <div style={{ flex: 1 }}>
              <Field label={t.fWhenTime} type="time" value={form.time} onChange={up('time')} />
            </div>
          </div>
          <div>
            <FieldLabel>{t.fNeeded}</FieldLabel>
            <Stepper value={form.needed} onDec={() => setForm((f) => ({ ...f, needed: Math.max(1, f.needed - 1) }))} onInc={() => setForm((f) => ({ ...f, needed: Math.min(200, f.needed + 1) }))} />
          </div>
          {!hasName && <Field label={t.fName} value={form.name} onChange={up('name')} placeholder={t.fNamePh} />}
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
          <Button full size="lg" onClick={create}>{t.createCta}</Button>
        </Container>
      </div>
    </div>
  );
}

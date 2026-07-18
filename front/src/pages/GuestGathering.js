import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { counts } from '../lib/forecast';
import Icon from '../components/Icon';
import { Logo, LangToggle } from '../components/shell/Brand';
import AnswerButton from '../components/ui/AnswerButton';

// Экран участника (/g/:code). Standalone-мобильный. Прогноз участнику НЕ показываем.
export default function GuestGathering() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const g = useGatheringStore((s) => s.gathering);
  const showToast = useUiStore((s) => s.showToast);
  const [answer, setAnswer] = useState(null);

  const title = isRu ? g.titleRu : g.titleKz;
  const place = isRu ? g.placeRu : g.placeKz;
  const when = `${isRu ? g.dateRu : g.dateKz} · ${g.time}`;
  const c = counts(g.participants);
  const needLine = isRu
    ? `Нужно ${g.needed} человек · сейчас придут ${c.yes + (answer === 'yes' ? 1 : 0)}`
    : `${g.needed} адам керек · қазір ${c.yes + (answer === 'yes' ? 1 : 0)} келеді`;

  const statusMap = { yes: ['var(--yard-soft)', 'var(--yard)', 'var(--yard)'], maybe: ['var(--maybe-soft)', 'var(--maybe)', '#8a5a17'], no: ['#EEF0EC', 'var(--line)', 'var(--ink-2)'] };
  const gsm = statusMap[answer || 'yes'];
  const answerLabel = answer === 'yes' ? t.ansYes : answer === 'maybe' ? t.ansMaybe : t.ansNo;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <Logo size={22} onClick={() => navigate('/feed')} />
        <LangToggle />
      </div>

      <div style={{ flex: 1, width: '100%', maxWidth: 480, margin: '0 auto', padding: '8px 20px 40px' }}>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.15, letterSpacing: '-.02em', margin: '12px 0 8px', textWrap: 'balance' }}>{title}</h1>
        <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{when} · {place}</div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>{needLine}</div>

        {answer === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
            <AnswerButton kind="yes" label={t.ansYes} selected={false} onClick={() => setAnswer('yes')} />
            <AnswerButton kind="maybe" label={t.ansMaybe} selected={false} onClick={() => setAnswer('maybe')} />
            <AnswerButton kind="no" label={t.ansNo} selected={false} onClick={() => setAnswer('no')} />
          </div>
        ) : (
          <div style={{ marginTop: 28, animation: 'erik-rise var(--t-base) var(--ease-out)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 'var(--r-m)', background: gsm[0], border: `1px solid ${gsm[1]}` }}>
              <span style={{ fontWeight: 600, fontSize: 17, color: gsm[2] }}>{t.youAnswered}: {answerLabel}</span>
              <button type="button" className="erik-btn" onClick={() => setAnswer(null)} style={{ border: 'none', background: 'transparent', color: 'var(--ink-2)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}>{t.change}</button>
            </div>

            {answer === 'maybe' && (
              <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>{t.maybeReassure}</div>
            )}

            <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 12, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>{t.guestAddrTitle}</div>
              <div style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>{place}</div>
              <button type="button" className="erik-btn erik-btn-secondary" onClick={() => showToast(isRu ? 'Открываем карты…' : 'Картаны ашудамыз…')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>
                <Icon name="pin" size={18} />{t.openMaps}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

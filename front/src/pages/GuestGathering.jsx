import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { isOffline } from '../lib/optimistic';
import { counts } from '../lib/forecast';
import Icon from '../components/Icon';
import { Logo, LangToggle } from '../components/shell/Brand';
import { EmptyState, Skeleton } from '../components/ui/feedback';
import { Field } from '../components/ui/controls';
import Button from '../components/ui/Button';
import AnswerButton from '../components/ui/AnswerButton';

// Общая обёртка: шапка (лого + переключатель языка) одинакова во всех состояниях.
function Frame({ children }) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
        <Logo size={22} onClick={() => navigate('/feed')} />
        <LangToggle />
      </div>
      <div style={{ flex: 1, width: '100%', maxWidth: 480, margin: '0 auto', padding: '8px 20px 40px' }}>{children}</div>
    </div>
  );
}

// Экран участника (/g/:code). Standalone-мобильный. Прогноз участнику НЕ показываем.
export default function GuestGathering() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const { code } = useParams();
  const g = useGatheringStore((s) => s.gathering);
  const guestError = useGatheringStore((s) => s.guestError);
  const loadGuest = useGatheringStore((s) => s.loadGuest);
  const rsvp = useGatheringStore((s) => s.rsvp);
  const showToast = useUiStore((s) => s.showToast);
  const [answer, setAnswer] = useState(null);
  const [closed, setClosed] = useState(false); // сбор завершился между загрузкой и ответом (409)
  const [booting, setBooting] = useState(true); // до первого loadGuest в сторе ещё чужой gathering — не мигаем демо

  useEffect(() => {
    setClosed(false);
    setBooting(true);
    loadGuest(code).finally(() => setBooting(false));
  }, [code, loadGuest]);
  useEffect(() => {
    if (g && g.myAnswer) setAnswer(g.myAnswer);
  }, [g]);

  const pick = async (a) => {
    const prev = answer;
    setAnswer(a); // оптимистично
    const r = await rsvp(code, a);
    if (r && r.ok) return;
    // Сервер отверг — откатываем оптимистичный ответ и показываем правду.
    setAnswer(prev);
    const err = r && r.error;
    if (err && err.status === 409) {
      setClosed(true); // сбор уже завершён — ответы не принимаются
    } else if (isOffline(err)) {
      showToast(isRu ? 'Нет сети — ответ не сохранён' : 'Желі жоқ — жауап сақталмады');
    } else {
      showToast(isRu ? 'Не удалось сохранить ответ' : 'Жауапты сақтау мүмкін болмады');
    }
  };

  // Загрузка: первый заход или обновление — скелетон вместо мелькания демо-данных.
  if (booting || (!g && !guestError)) {
    return (
      <Frame>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={30} width="70%" />
          <Skeleton height={16} width="55%" />
          <Skeleton height={14} width="40%" />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton height={52} radius={14} />
            <Skeleton height={52} radius={14} />
            <Skeleton height={52} radius={14} />
          </div>
        </div>
      </Frame>
    );
  }

  // Сбора нет: код неверный или ссылка устарела. Демо не показываем — даём ввести код.
  if (guestError === 'notfound') {
    return (
      <Frame>
        <EmptyState icon="search" title={t.nf} sub={t.nfSub} action={<CodeEntry />} />
      </Frame>
    );
  }

  // Нет сети: предлагаем повторить загрузку.
  if (guestError === 'offline') {
    return (
      <Frame>
        <EmptyState
          icon="link"
          title={t.guestOffline}
          action={<Button variant="secondary" onClick={() => loadGuest(code)}>{t.retry}</Button>}
        />
      </Frame>
    );
  }

  const title = isRu ? g.titleRu : g.titleKz;
  const place = isRu ? g.placeRu : g.placeKz;
  const when = `${isRu ? g.dateRu : g.dateKz} · ${g.time}`;

  // Сбор уже прошёл: показываем честно, ответы не принимаем (иначе PUT вернёт 409).
  if (closed || g.status === 'done') {
    return (
      <Frame>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.15, letterSpacing: '-.02em', margin: '12px 0 8px', textWrap: 'balance' }}>{title}</h1>
        <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{when} · {place}</div>
        <div style={{ marginTop: 20 }}>
          <EmptyState icon="check" title={t.gatheringDone} sub={t.gatheringDoneSub} />
        </div>
      </Frame>
    );
  }

  // Публичный вид отдаёт comingCount; на моке считаем из ростера.
  const coming = g.comingCount != null ? g.comingCount : counts(g.participants || []).yes;
  const needLine = isRu
    ? `Нужно ${g.needed} человек · сейчас придут ${coming}`
    : `${g.needed} адам керек · қазір ${coming} келеді`;

  const statusMap = { yes: ['var(--yard-soft)', 'var(--yard)', 'var(--yard)'], maybe: ['var(--maybe-soft)', 'var(--maybe)', '#8a5a17'], no: ['#EEF0EC', 'var(--line)', 'var(--ink-2)'] };
  const gsm = statusMap[answer || 'yes'];
  const answerLabel = answer === 'yes' ? t.ansYes : answer === 'maybe' ? t.ansMaybe : t.ansNo;

  return (
    <Frame>
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.15, letterSpacing: '-.02em', margin: '12px 0 8px', textWrap: 'balance' }}>{title}</h1>
      <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{when} · {place}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--ink-3)' }}>{needLine}</div>

      {answer === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          <AnswerButton kind="yes" label={t.ansYes} selected={false} onClick={() => pick('yes')} />
          <AnswerButton kind="maybe" label={t.ansMaybe} selected={false} onClick={() => pick('maybe')} />
          <AnswerButton kind="no" label={t.ansNo} selected={false} onClick={() => pick('no')} />
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
    </Frame>
  );
}

// Ввод кода на экране «сбор не найден» — как в CodeSheet: код → переход на /g/<code>.
function CodeEntry() {
  const t = useT();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
      <Field value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PARK18" inputStyle={{ fontFamily: 'var(--fm)', letterSpacing: '.15em', textAlign: 'center', fontSize: 18 }} />
      <Button full onClick={() => { const c = code.trim(); if (c) navigate(`/g/${c}`); }}>{t.open}</Button>
    </div>
  );
}

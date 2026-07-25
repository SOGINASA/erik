import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useGatheringStore } from '../store/useGatheringStore';
import { useUiStore } from '../store/useUiStore';
import { usePlatformStore } from '../store/usePlatformStore';
import { isOffline } from '../lib/optimistic';
import { RoleRow, sortRolesForViewer } from '../sheets/Sheets';

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
  const pickGuestRole = useGatheringStore((s) => s.pickGuestRole);
  const me = usePlatformStore((s) => s.me);
  const [answer, setAnswer] = useState(null);
  const [closed, setClosed] = useState(false); // сбор завершился между загрузкой и ответом (409)
  const [booting, setBooting] = useState(true); // до первого loadGuest в сторе ещё чужой gathering — не мигаем демо
  const [roleBusy, setRoleBusy] = useState(false);

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

  // Роль выбирается ОТДЕЛЬНЫМ запросом уже после записи: она не должна её задерживать.
  // Стор идёт через commit(), поэтому офлайн честно откатится и стостится — иначе роль
  // была бы видна локально, а сервер о ней не знал.
  const chooseRole = async (roleId) => {
    if (roleBusy) return;
    setRoleBusy(true);
    const r = await pickGuestRole(code, roleId);
    setRoleBusy(false);
    // 409 — место заняли, пока человек выбирал. Стор уже перерисовал остатки из тела
    // ответа, поэтому просто объясняем, что произошло: список рядом уже актуальный.
    if (!r.ok && r.error && r.error.status === 409) {
      showToast(isRu ? 'Роль уже заняли — выберите другую' : 'Рөл алынып қойды — басқасын таңдаңыз');
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

  // Сбор ещё НЕ открыт для записи (на модерации 'pending' или отклонён 'rejected'): показываем
  // честно и НЕ рисуем активные кнопки. Иначе тап уходил в 409 и рисовался ложный «Сбор завершён»
  // (координатор мог раздать ссылку /g/CODE ещё до одобрения модерацией).
  if (g.status && g.status !== 'open') {
    return (
      <Frame>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.15, letterSpacing: '-.02em', margin: '12px 0 8px', textWrap: 'balance' }}>{title}</h1>
        <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>{when} · {place}</div>
        <div style={{ marginTop: 20 }}>
          <EmptyState
            icon="clock"
            title={isRu ? 'Сбор ещё не открыт для записи' : 'Жиынға жазылу әлі ашылмаған'}
            sub={isRu ? 'Он проходит модерацию. Загляните чуть позже — запись откроется после одобрения.' : 'Ол модерациядан өтуде. Сәл кейінірек қараңыз — мақұлдаудан кейін жазылу ашылады.'}
          />
        </div>
      </Frame>
    );
  }

  // Публичный вид отдаёт comingCount — это ФАКТ (сколько человек ответили «приду»),
  // а не прогноз: участнику прогноз не показываем сознательно (самосбывающееся
  // пророчество). Раньше строка звучала «сейчас придут N» — тем же глаголом, что и
  // предсказание, и читалась как прогноз. Теперь формулировка про ответы.
  // Фолбэка по ростеру нет: публичный сериализатор participants не отдаёт вовсе,
  // и counts() всегда возвращал бы 0 — честнее скрыть строку целиком.
  const coming = g.comingCount;
  const needLine = coming == null
    ? (isRu ? `Нужно ${g.needed} человек` : `${g.needed} адам керек`)
    : isRu
      ? `Нужно ${g.needed} человек · уже ответили «приду» ${coming}`
      : `${g.needed} адам керек · «келемін» деп жауап берді ${coming}`;

  const statusMap = { yes: ['var(--yard-soft)', 'var(--yard)', 'var(--yard)'], maybe: ['var(--maybe-soft)', 'var(--maybe)', '#8a5a17'], no: ['#EEF0EC', 'var(--line)', 'var(--ink-2)'] };
  const gsm = statusMap[answer || 'yes'];
  const answerLabel = answer === 'yes' ? t.ansYes : answer === 'maybe' ? t.ansMaybe : t.ansNo;

  // Роли сбора приезжают в публичном виде агрегатами (сколько занято из скольких) —
  // это тот же класс данных, что comingCount. Имён и прогноза здесь нет и быть не должно.
  const roles = g.roles || [];
  const myRoleId = g.myRoleId || null;
  // Новичку сначала показываем роли «можно без опыта». Гость без профиля — тоже новичок.
  const orderedRoles = sortRolesForViewer(roles, !me || !me.eventsAttended);

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

          {/* Выбор роли — ИНЛАЙНОМ в блоке успеха, а не модалкой поверх него: человек
              только что увидел «ты записан», и всплывающее окно погасило бы этот момент.
              Показываем после 'yes'/'maybe'; при 'no' роль не нужна и место уже свободно. */}
          {answer !== 'no' && roles.length > 0 && (
            <div style={{ marginTop: 16, padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                {isRu ? 'Чем поможешь?' : 'Немен көмектесесің?'}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)', marginBottom: 12 }}>
                {isRu
                  ? 'Ты уже записан. Роль можно выбрать сейчас или потом.'
                  : 'Сен тіркелдің. Рөлді қазір де, кейін де таңдауға болады.'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {orderedRoles.map((r) => (
                  <RoleRow
                    key={r.id}
                    role={r}
                    isRu={isRu}
                    selected={r.id === myRoleId}
                    disabled={roleBusy || (r.free === 0 && r.id !== myRoleId)}
                    onClick={() => chooseRole(r.id)}
                  />
                ))}
              </div>
            </div>
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

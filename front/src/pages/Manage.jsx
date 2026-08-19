import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { useOrganizerStore, orgNotice } from '../store/useOrganizerStore';
import { useSessionStore } from '../store/useSessionStore';
import { useIsDesktop } from '../lib/nav';
import { daysFromToday, plural } from '../lib/data';
import { verdictColor, sourceLabel } from '../lib/forecastView';
import { Container } from '../components/Container';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import ManageHeader from '../components/manage/ManageHeader';
import { StatTile, MiniBar } from '../components/manage/parts';
import { EmptyState, Skeleton } from '../components/ui/feedback';

// Дашборд организатора: сводка, что требует внимания, ближайшие и прошедшие сборы.
export default function Manage() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const events = useOrganizerStore((s) => s.events);
  const load = useOrganizerStore((s) => s.load);
  const loadAnalytics = useOrganizerStore((s) => s.loadAnalytics);
  const remindFor = useOrganizerStore((s) => s.remindFor);
  const resubmit = useOrganizerStore((s) => s.resubmit);
  const forecastFor = useOrganizerStore((s) => s.forecastFor);
  const pending = useOrganizerStore((s) => s.pendingCount());
  const source = useOrganizerStore((s) => s.source);
  const status = useOrganizerStore((s) => s.status);
  const analytics = useOrganizerStore((s) => s.analytics);
  const analyticsStatus = useOrganizerStore((s) => s.analyticsStatus);
  const loggedIn = useSessionStore((s) => s.loggedIn);

  // Аналитика имеет смысл только на серверных данных — грузим её после load().
  useEffect(() => { load().then(loadAnalytics); }, [load, loadAnalytics]);

  // Первая загрузка: показывать моки как свои цифры нельзя, вместо них скелетон.
  const booting = status === 'loading' && source === 'demo';
  const notice = orgNotice(source, status, isRu, loggedIn);
  // На демо-данных прогноза нет вовсе: сборы придуманы, и число рядом с ними было бы
  // выдумкой. Показываем только пометку «демо-данные».
  const demoData = source === 'demo';

  // Дробное «21,3» само по себе отличает прогноз от счётчика людей (тот всегда целый).
  const dec = (v) => (v == null ? '—' : String(v).replace('.', ','));
  // В списке сборов прогноз округляем до целого — десятые уместны на экране сбора.
  const round0 = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));

  const active = events.filter((e) => e.status !== 'done' && e.status !== 'rejected');
  const rejected = events.filter((e) => e.status === 'rejected');
  const past = events.filter((e) => e.status === 'done');

  // Сводка для плиток (считаем локально, чтобы селектор не возвращал новый объект).
  // Первые три величины выводятся из тех же сборов, что показаны ниже, — они честны
  // и на демо; с сервера берём их же, когда аналитика пришла.
  const answered = past.reduce((s, e) => s + e.answered, 0);
  const came = past.reduce((s, e) => s + e.came, 0);
  const stats = {
    active: analytics ? analytics.activeGatherings : active.length,
    confirmed: analytics ? analytics.confirmedTotal : active.reduce((s, e) => s + e.yes, 0),
    attendance: analytics ? analytics.attendancePct : answered ? Math.round((came / answered) * 100) : 0,
  };
  // Часы из сборов не выводятся (раньше стояло came × 4 — выдуманное число).
  // Настоящие — только из аналитики; пока их нет, честнее скелетон и прочерк.
  const hoursTile = analytics
    ? analytics.hoursTotal
    : analyticsStatus === 'loading' || booting
      ? <Skeleton width={54} height={26} />
      : '—';

  // «Ждём по прогнозу» — сколько людей модель ждёт на всех активных сборах. Это НЕ
  // «подтвердили приход» из соседней плитки: там счётчик нажавших «приду», здесь
  // предсказание. Своей формулы у фронта нет — только серверное число или прочерк.
  const expectedTile = analytics
    ? dec(analytics.expectedTotal)
    : analyticsStatus === 'loading' || booting
      ? <Skeleton width={54} height={26} />
      : '—';
  // Источник подписан всегда: подменить модель формулой молча нельзя.
  const expectedSource = analytics && analytics.forecastSource
    ? (analytics.forecastSource === 'model' ? t.fcSourceModel : t.fcSourceFormula)
    : null;

  // Точность прогноза на СВОИХ завершённых сборах: модель против формулы против
  // наивного счётчика «сколько нажало приду». null у любого из трёх — прочерк.
  const acc = (analytics && analytics.forecastAccuracy) || null;
  const accRows = acc ? [
    { key: 'model', label: t.fcSourceModel, mae: acc.modelMae },
    { key: 'formula', label: t.fcSourceFormula, mae: acc.formulaMae },
    { key: 'naive', label: t.fcNaive, mae: acc.confirmedMae },
  ] : [];
  // Лучший результат подсвечиваем, только когда он единственный: при ничьей зелёными
  // стали бы обе строки, и «победа модели» читалась бы там, где её нет.
  const accBest = (() => {
    const vals = accRows.map((r) => r.mae).filter((v) => v != null);
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    return vals.filter((v) => v === min).length === 1 ? min : null;
  })();
  const accN = acc ? (acc.nGatherings != null ? acc.nGatherings : acc.n) : null;

  // Строка фактов под прогнозом. В казахском число идёт ПЕРЕД словом («20 керек»),
  // поэтому порядок собираем, а не склеиваем вслепую. «Ответили» считаем суммой тех
  // же трёх счётчиков, что стоят рядом (на сервере answered = yes+maybe+no, а в демо
  // поле заполнено только у прошедших сборов — строка противоречила бы сама себе).
  const answersLine = (e) => {
    const total = e.yes + e.maybe + e.no;
    const need = isRu ? `${t.mgNeedShort} ${e.needed}` : `${e.needed} ${t.mgNeedShort}`;
    const ans = isRu ? `${t.fcAnswered} ${total}` : `${total} ${t.fcAnswered}`;
    const [y, m, n] = isRu ? ['да', 'может', 'нет'] : ['иә', 'мүмкін', 'жоқ'];
    return `${need} · ${ans}: ${e.yes} ${y}, ${e.maybe} ${m}, ${e.no} ${n}`;
  };

  // Метка срока сбора.
  const whenTag = (e) => {
    if (e.status === 'live') return { label: t.mgLiveTag, bg: 'var(--yard-soft)', color: 'var(--yard)' };
    const d = daysFromToday(e.dateISO);
    const label = d <= 0 ? t.mgLiveTag : d === 1 ? (isRu ? 'завтра' : 'ертең') : (isRu ? `через ${d} ${plural(d, ['день', 'дня', 'дней'])}` : `${d} күннен кейін`);
    return { label, bg: 'var(--paper)', color: 'var(--ink-2)' };
  };

  // Что требует внимания: заявки + сборы, которым по ПРОГНОЗУ не хватит людей.
  const attention = [];
  if (pending > 0) {
    attention.push({
      key: 'apps', tone: 'apps',
      text: `${pending} ${isRu ? plural(pending, ['новая заявка', 'новые заявки', 'новых заявок']) + ' волонтёров' : t.mgAttApps}`,
      cta: t.mgReview, onClick: () => navigate('/manage/requests'),
    });
  }
  // Основное правило — прогноз: verdict='short' означает «не хватит даже по верхней
  // границе интервала», это и есть настоящий риск. Сортировка по размеру нехватки.
  // Раньше отбирали по «больше всего maybe» — много неопределившихся само по себе не
  // проблема, если модель всё равно ждёт достаточно людей.
  const shortAhead = demoData ? [] : active
    .map((e) => ({ e, f: forecastFor(e) }))
    .filter((x) => x.f && x.f.verdict === 'short' && (x.f.shortBy || 0) > 0)
    .sort((a, b) => b.f.shortBy - a.f.shortBy)
    .slice(0, 2);
  if (shortAhead.length > 0) {
    shortAhead.forEach(({ e, f }) => attention.push({
      key: e.id, tone: 'maybe',
      text: `«${isRu ? e.titleRu : e.titleKz}»: ${isRu
        // shortBy — недобор относительно ОЖИДАНИЯ (needed − E). Приписывать его
        // верхней границе нельзя: это разные числа, а вердикт 'short' и так означает,
        // что нормы не хватит даже по оптимистичному краю интервала.
        ? `по прогнозу не хватит ${f.shortBy} ${plural(f.shortBy, ['человека', 'человек', 'человек'])}`
        : `болжам бойынша ${f.shortBy} адам жетпейді`}`,
      cta: t.remind, onClick: () => remindFor(e.id),
    }));
  } else {
    // Запасное правило: прогноза нет (демо или сервер его не прислал) — показываем
    // сборы с наибольшей неопределённостью, как раньше.
    active
      .filter((e) => e.maybe > 0)
      .sort((a, b) => b.maybe - a.maybe)
      .slice(0, 2)
      .forEach((e) => attention.push({
        key: e.id, tone: 'maybe',
        text: `«${isRu ? e.titleRu : e.titleKz}»: ${e.maybe} ${isRu ? plural(e.maybe, ['человек', 'человека', 'человек']) : ''} ${t.mgAttMaybe}`,
        cta: t.remind, onClick: () => remindFor(e.id),
      }));
  }

  const sectionTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '30px 0 12px' };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container style={{ flex: 1, paddingTop: 16, paddingBottom: desktop ? 56 : 120 }}>
        <ManageHeader active="overview" />

        {/* Честная пометка источника: демо-данные и ошибка загрузки видны, а не молчат */}
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 14, borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: notice.tone === 'error' ? 'var(--maybe-soft)' : 'var(--paper)', fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>
            <span>{notice.text}</span>
            {notice.retry && (
              <button type="button" className="erik-btn" onClick={() => load().then(loadAnalytics)} style={{ flex: 'none', height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{isRu ? 'Повторить' : 'Қайталау'}</button>
            )}
          </div>
        )}

        {/* Сводка */}
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(5, minmax(0, 1fr))' : 'repeat(2, 1fr)', gap: 12 }}>
          {booting ? (
            [0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
                <Skeleton width={54} height={26} />
                <Skeleton width="70%" height={12} style={{ marginTop: 12 }} />
              </div>
            ))
          ) : (
            <>
              <StatTile value={stats.active} label={t.mgStatActive} />
              <StatTile value={stats.confirmed} label={t.mgStatConfirmed} tone="yard" />
              {/* Прогноз стоит рядом с «подтвердили»: разница между этими числами и есть
                  вклад модели. На мобильном плитка занимает всю ширину — иначе пятая
                  болталась бы в одиночной строке двухколоночной сетки. */}
              <div style={{ gridColumn: desktop ? 'auto' : 'span 2' }}>
                <StatTile
                  value={expectedTile}
                  label={<>
                    {t.fcExpectedTile}
                    {expectedSource && <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--ink-3)' }}>{expectedSource}</span>}
                  </>}
                />
              </div>
              <StatTile value={`${stats.attendance}%`} label={t.mgStatAttendance} />
              <StatTile value={hoursTile} label={t.mgStatHours} />
            </>
          )}
        </div>

        {/* Точность прогноза: чем модель лучше формулы и наивного счётчика — на своих
            же завершённых сборах. Без этого блока «прогноз 21» — просто цифра. */}
        {!booting && acc && (
          <>
            <div style={sectionTitle}>{isRu ? 'Точность прогноза' : 'Болжам дәлдігі'}</div>
            <div style={{ padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <button
                type="button"
                className="erik-btn"
                onClick={() => navigate('/forecast-quality')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: 0, border: 'none', background: 'none', textAlign: 'left', color: 'var(--ink)', cursor: 'pointer' }}
              >
                <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 16, lineHeight: 1.25 }}>{t.fcQualityBacktest}</span>
                <Icon name="chevronRight" size={16} stroke={1.8} />
              </button>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{t.fcQualityBacktestSub}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                {accRows.map((r) => {
                  const best = r.mae != null && accBest != null && r.mae === accBest;
                  return (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ minWidth: 0, fontSize: 13, lineHeight: 1.35, color: best ? 'var(--ink)' : 'var(--ink-2)' }}>{r.label}</span>
                      <span style={{ flex: 'none', fontFamily: 'var(--fm)', fontSize: 14, fontWeight: best ? 600 : 500, color: best ? 'var(--yard)' : 'var(--ink-2)' }}>
                        {r.mae == null ? '—' : `${dec(r.mae)} ${isRu ? 'чел.' : 'адам'}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {accN != null && (
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
                  {isRu
                    ? `проверено на ${accN} ${plural(accN, ['завершённом сборе', 'завершённых сборах', 'завершённых сборах'])}`
                    : `${accN} аяқталған жиында тексерілді`}
                </div>
              )}
            </div>
          </>
        )}

        {/* Пока идёт первая загрузка — скелетон вместо демо-сборов */}
        {booting && (
          <>
            <div style={sectionTitle}>{t.mgUpcoming}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <Skeleton width="55%" height={18} />
                  <Skeleton width="75%" height={13} style={{ marginTop: 8 }} />
                  <Skeleton height={8} radius={999} style={{ marginTop: 14 }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Требуют внимания */}
        {!booting && attention.length > 0 && (
          <>
            <div style={sectionTitle}>{t.mgAttention}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {attention.map((a) => (
                <div key={a.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '14px 18px', borderRadius: 'var(--r-m)', background: a.tone === 'apps' ? 'var(--yard-soft)' : 'var(--maybe-soft)', animation: 'erik-rise var(--t-base) var(--ease-out)' }}>
                  <span style={{ fontSize: 14, lineHeight: 1.4, color: a.tone === 'apps' ? '#255a40' : '#7a5518' }}>{a.text}</span>
                  <button type="button" className="erik-btn" onClick={a.onClick} style={{ flex: 'none', height: 38, padding: '0 16px', border: `1px solid ${a.tone === 'apps' ? 'var(--yard)' : 'var(--maybe)'}`, background: 'var(--surface)', color: a.tone === 'apps' ? 'var(--yard)' : '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{a.cta}</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Отклонённые модерацией — с причиной и кнопкой «Пересдать» */}
        {!booting && rejected.length > 0 && (
          <>
            <div style={sectionTitle}>{t.mgRejected}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rejected.map((e) => (
                <div key={e.id} style={{ padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--maybe)', background: 'var(--maybe-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', lineHeight: 1.2 }}>{isRu ? e.titleRu : e.titleKz}</div>
                      <div style={{ fontSize: 13, color: '#8a5a17', marginTop: 4 }}>{t.mgRejectedTag}</div>
                    </div>
                    <button type="button" className="erik-btn" onClick={() => resubmit(e.id)} style={{ flex: 'none', height: 38, padding: '0 16px', border: '1px solid var(--maybe)', background: 'var(--surface)', color: '#8a5a17', borderRadius: 'var(--r-s)', fontWeight: 500, fontSize: 14, cursor: 'pointer' }}>{t.mgResubmit}</button>
                  </div>
                  {e.rejectReason && (
                    <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.4, color: 'var(--ink-2)' }}>
                      <span style={{ color: 'var(--ink-3)' }}>{t.mgRejectReason}: </span>{e.rejectReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ближайшие сборы */}
        {!booting && <div style={sectionTitle}>{t.mgUpcoming}</div>}
        {booting ? null : active.length === 0 ? (
          <EmptyState icon="calendar" title={t.emptyMe} sub={t.emptyMeSub} action={<Button icon="plus" onClick={() => navigate('/new')}>{t.create}</Button>} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map((e) => {
              // Прогноз только серверный: нет объекта — рисуем «—», своей формулы у
              // штаба больше нет. Цвет берём по вердикту (он считан по интервалу),
              // а не по «E >= needed» — иначе карточка перекрашивалась от одного ответа.
              const f = demoData ? null : forecastFor(e);
              const tag = whenTag(e);
              const E = f ? round0(f.expected) : null;
              const lo = f ? round0(f.lo) : null;
              const hi = f ? round0(f.hi) : null;
              return (
                <button
                  key={e.id}
                  type="button"
                  className="erik-lift"
                  onClick={() => navigate(`/c/${e.id}`)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, color: 'var(--ink)', lineHeight: 1.2 }}>{isRu ? e.titleRu : e.titleKz}</span>
                    <span style={{ flex: 'none', height: 22, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: tag.bg, color: tag.color, fontSize: 12, fontWeight: 500 }}>{tag.label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12 }}>{(isRu ? e.dateRu : e.dateKz)} · {e.time} · {isRu ? e.placeRu : e.placeKz}</div>

                  <MiniBar yes={e.yes} maybe={e.maybe} no={e.no} />

                  {/* Верхний уровень — ПРЕДСКАЗАНИЕ: крупнее, цветом вердикта, с интервалом
                      и подписью источника. Раньше здесь была одна строка
                      «прогноз ≈ 14 · 14 подтвердили · 24 под вопросом»: прогноз и счётчик
                      стояли одним кеглем через «·» и на демо совпадали числом. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {demoData ? (
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t.fcSourceDemo}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 15, fontWeight: 600, color: E == null ? 'var(--ink-3)' : verdictColor(f.verdict) }}>
                          <span style={{ textTransform: 'capitalize' }}>{t.mgForecastShort}</span>{' '}
                          <span style={{ fontFamily: 'var(--fm)', fontSize: 18 }}>{E == null ? '—' : E}</span>
                        </span>
                        {E != null && lo != null && hi != null && (
                          <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{lo}–{hi}</span>
                        )}
                        {E != null && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· {sourceLabel(f, t)}</span>}
                      </>
                    )}
                    {e.applied > 0 && (
                      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 10px', borderRadius: 999, background: 'var(--yard-soft)', color: 'var(--yard)', fontSize: 12, fontWeight: 500 }}>
                        <Icon name="users" size={13} stroke={1.8} />{e.applied} {isRu ? plural(e.applied, ['заявка', 'заявки', 'заявок']) : 'өтінім'}
                      </span>
                    )}
                  </div>

                  {/* Нижний уровень — ФАКТЫ: сколько нужно и как ответили. Мельче и серым,
                      чтобы счётчик ответивших не читался как прогноз. */}
                  <div style={{ marginTop: 4, fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-3)' }}>{answersLine(e)}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Прошедшие сборы */}
        {!booting && past.length > 0 && (
          <>
            <div style={sectionTitle}>{t.mgPast}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {past.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRu ? e.titleRu : e.titleKz}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{isRu ? e.dateRu : e.dateKz}</div>
                  </div>
                  <div style={{ flex: 'none', fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink-2)' }}>
                    {isRu ? `пришло ${e.came} из ${e.answered}` : `${e.answered} ішінен ${e.came} келді`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Container>

      {/* Мобильная липкая кнопка создания */}
      {!desktop && (
        <div style={{ position: 'sticky', left: 0, right: 0, bottom: 'calc(66px + env(safe-area-inset-bottom))', padding: '14px 0', background: 'rgba(255,255,255,.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--line)', zIndex: 20 }}>
          <Container>
            <Button full size="lg" icon="plus" onClick={() => navigate('/new')}>{t.create}</Button>
          </Container>
        </div>
      )}
    </div>
  );
}

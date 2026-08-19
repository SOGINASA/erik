import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { api } from '../lib/api';
import { Container, BackButton } from '../components/Container';
import Icon from '../components/Icon';
import { EmptyState, Skeleton } from '../components/ui/feedback';

// Паспорт модели прогноза — прямой ответ на вопрос «а прогноз не просто повторяет
// число подтвердивших?». Все числа приходят из GET /api/forecast/quality, то есть
// из ml/artifacts/*.json — из того, что печатают train.py / evaluate.py / baseline.py.
// Никаких вычислений «на глазок» здесь нет: если модели нет, экран честно пуст.

// Технические имена признаков → человеческий язык. Словарь живёт здесь, а не в i18n.js:
// это подписи одного экрана, завязанные на конкретный набор фич модели.
const FEATURE_RU = {
  answer: 'ответ на приглашение',
  interest_match: 'тема совпала с интересами',
  attendance_rate: 'доля явок в истории',
  reliability: 'надёжность',
  days_since_last: 'дней с прошлого сбора',
  theme_attendance_rate: 'явка по этой теме',
  events_missed: 'сколько пропускал',
  theme_total: 'сборов этой темы',
  recent_came_rate: 'свежая динамика',
  num_interests: 'сколько тем интересно',
  events_came: 'сколько приходил',
  theme_came: 'приходил по теме',
  events_total: 'сборов в истории',
  event_type: 'тип сбора',
};
const FEATURE_KZ = {
  answer: 'шақыруға жауабы',
  interest_match: 'тақырып қызығушылығымен сәйкес келді',
  attendance_rate: 'тарихындағы келу үлесі',
  reliability: 'сенімділік',
  days_since_last: 'өткен жиыннан бері күн саны',
  theme_attendance_rate: 'осы тақырып бойынша келуі',
  events_missed: 'қаншасын өткізіп жіберген',
  theme_total: 'осы тақырыптағы жиындар',
  recent_came_rate: 'соңғы кездегі динамикасы',
  num_interests: 'қанша тақырып қызықтырады',
  events_came: 'қанша рет келген',
  theme_came: 'тақырып бойынша келгені',
  events_total: 'тарихындағы жиындар',
  event_type: 'жиын түрі',
};

// Числа метрик — три знака, чтобы разница между предсказателями была видна.
// Нет значения → прочерк, выдумывать нельзя.
const dash = '—';
function f3(v) {
  return v == null || Number.isNaN(Number(v)) ? dash : Number(v).toFixed(3);
}
function f0(v) {
  return v == null || Number.isNaN(Number(v)) ? dash : Math.round(Number(v)).toLocaleString('ru-RU');
}
// Прирост — всегда со знаком: «+0.095» читается как «обыграл», без знака — нет.
function lift3(v) {
  if (v == null || Number.isNaN(Number(v))) return dash;
  const n = Number(v);
  return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(3);
}

export default function ForecastQuality() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();

  const [state, setState] = useState('loading'); // loading | ready | error
  const [q, setQ] = useState(null);
  const [reason, setReason] = useState(null); // { reason, hint } — почему модели нет

  const load = useCallback(() => {
    let alive = true;
    setState('loading');
    setReason(null);
    api.forecastQuality().then(
      (r) => {
        if (!alive) return;
        // available=false или пустые артефакты — это НЕ повод показать что-то похожее
        // на метрики. Уходим в честное пустое состояние.
        if (r && r.available && r.metrics && r.comparison) {
          setQ(r);
          setState('ready');
        } else {
          setQ(null);
          setReason(r ? { reason: r.reason, hint: r.hint } : null);
          setState('error');
        }
      },
      () => {
        if (!alive) return;
        setQ(null);
        setState('error');
      },
    );
    return () => { alive = false; };
  }, []);

  useEffect(() => load(), [load]);

  const secTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '32px 0 12px' };
  const card = { padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' };
  const mono = { fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--ink)' };

  const head = (
    <>
      <BackButton onClick={() => navigate(-1)} label={isRu ? 'Назад' : 'Артқа'} />
      <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 28, letterSpacing: '-.02em', margin: '6px 0 4px' }}>{t.fcQualityTitle}</h1>
      <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--ink-3)', margin: 0, maxWidth: 620 }}>{t.fcQualitySub}</p>
    </>
  );

  // ── Загрузка: скелетоны ровно той формы, что придёт ──────────────────────────
  if (state === 'loading') {
    return (
      <Container style={{ maxWidth: 860, paddingTop: 16, paddingBottom: 64, animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
        {head}
        <div style={{ ...card, marginTop: 20 }}>
          <Skeleton width={150} height={18} />
          <Skeleton width="80%" height={13} style={{ marginTop: 10 }} />
        </div>
        <div style={secTitle}>{t.fcQualityCompare}</div>
        <div style={card}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--line)' : 'none' }}>
              <Skeleton width="38%" height={15} />
              <Skeleton width={54} height={15} />
              <Skeleton width={54} height={15} />
              <Skeleton width={54} height={15} />
            </div>
          ))}
        </div>
        <div style={secTitle}>{t.fcQualityMetrics}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={card}>
              <Skeleton width={64} height={22} />
              <Skeleton width="70%" height={12} style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
      </Container>
    );
  }

  // ── Модели нет: ни одного числа, только объяснение ───────────────────────────
  if (state === 'error' || !q) {
    return (
      <Container style={{ maxWidth: 860, paddingTop: 16, paddingBottom: 64, animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
        {head}
        <EmptyState
          icon="shield"
          title={isRu ? 'Модель в этом окружении недоступна' : 'Бұл ортада модель қолжетімсіз'}
          sub={isRu
            ? 'Метрики читаются из артефактов обученной модели. Их сейчас нет — значит, показывать нечего, и выдуманных чисел здесь не будет.'
            : 'Метрикалар оқытылған модель артефакттарынан оқылады. Олар қазір жоқ — көрсететін ештеңе жоқ, ойдан шығарылған сандар болмайды.'}
          action={(
            <button type="button" className="erik-btn" onClick={load} style={{ height: 40, padding: '0 18px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              {isRu ? 'Повторить' : 'Қайталау'}
            </button>
          )}
        />
        {/* Причина и подсказка с сервера — как есть, без пересказа */}
        {reason && (reason.reason || reason.hint) && (
          <div style={{ ...card, maxWidth: 520, margin: '0 auto', background: 'var(--paper)' }}>
            {reason.reason && <div style={{ fontFamily: 'var(--fm)', fontSize: 12.5, color: 'var(--ink-2)' }}>{reason.reason}</div>}
            {reason.hint && <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-3)', marginTop: reason.reason ? 6 : 0 }}>{reason.hint}</div>}
          </div>
        )}
      </Container>
    );
  }

  const model = q.model || {};
  const metrics = q.metrics || {};
  const ts = q.testSet || {};
  const lift = q.lift || {};
  const cm = metrics.confusionMatrix || {};
  const rows = q.comparison || [];
  const features = q.featureImportance || [];

  const threshold = model.threshold != null ? model.threshold : metrics.threshold;
  const nTest = metrics.nTest != null ? metrics.nTest : ts.nTest;
  const actual = ts.actualCame;

  // Порог опорной ширины полос важности: максимум по положительным значениям.
  const maxImp = features.reduce((m, r) => Math.max(m, Number(r.importance) || 0), 0);

  // Ячейки сравнительной таблицы.
  const th = { padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 500, letterSpacing: '.02em', textTransform: 'uppercase', color: 'var(--ink-3)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line)' };
  const thLeft = { ...th, textAlign: 'left' };
  const td = { padding: '12px', textAlign: 'right', fontFamily: 'var(--fm)', fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap' };
  const tdLeft = { ...td, textAlign: 'left', fontFamily: 'inherit', fontSize: 14 };

  return (
    <Container style={{ maxWidth: 860, paddingTop: 16, paddingBottom: 64, animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      {head}

      {/* ── Плашка модели: чем именно считается прогноз ─────────────────────── */}
      <div style={{ ...card, marginTop: 20, background: 'var(--yard-soft)', border: '1px solid var(--yard)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--yard)' }}>
            <Icon name="shield" size={17} stroke={1.8} />
            <span style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17 }}>{t.fcSourceModel}</span>
          </span>
          <span style={{ ...mono, fontSize: 15, color: 'var(--yard)' }}>{model.name || dash}</span>
          {model.calibrated && (
            <span style={{ height: 22, padding: '0 10px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: 'var(--surface)', color: 'var(--yard)', fontSize: 12, fontWeight: 500 }}>
              {isRu ? 'изотоническая калибровка' : 'изотондық калибрлеу'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 12, fontSize: 13, color: '#255a40' }}>
          <span>{isRu ? 'порог' : 'шек'} <b style={{ ...mono, color: '#255a40' }}>{threshold != null ? Number(threshold).toFixed(2) : dash}</b></span>
          <span>{isRu ? 'отложенный тест' : 'кейінге қалдырылған тест'} <b style={{ ...mono, color: '#255a40' }}>{f0(nTest)}</b> {isRu ? 'ответов' : 'жауап'}</span>
          {actual != null && <span>{isRu ? 'из них пришли' : 'оның ішінде келгені'} <b style={{ ...mono, color: '#255a40' }}>{f0(actual)}</b></span>}
        </div>
        {/* Честные оговорки: как делили выборку и что данные синтетические */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(37,90,64,.18)', fontSize: 12.5, lineHeight: 1.5, color: '#3d6b52' }}>
          <div>
            {isRu
              ? `Сплит: ${ts.split || 'по волонтёрам — история одного человека не попадает разом в train и test'}`
              : 'Бөліну: волонтёрлер бойынша — бір адамның тарихы train мен testке бірге түспейді'}
          </div>
          {ts.data === 'synthetic' && (
            <div style={{ marginTop: 4 }}>
              {isRu
                ? 'Данные синтетические: реальной истории явок такого объёма у платформы пока нет, и мы это не скрываем.'
                : 'Деректер синтетикалық: платформада мұндай көлемдегі нақты келу тарихы әлі жоқ, біз мұны жасырмаймыз.'}
            </div>
          )}
        </div>
      </div>

      {/* ── ГЛАВНОЕ: три предсказателя на одной выборке ─────────────────────── */}
      <div style={secTitle}>{t.fcQualityCompare}</div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thLeft}>{isRu ? 'Предсказатель' : 'Болжаушы'}</th>
                <th style={th}>ROC-AUC<div style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-3)' }}>{isRu ? 'выше — лучше' : 'жоғары — жақсы'}</div></th>
                <th style={th}>PR-AUC<div style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-3)' }}>{isRu ? 'выше — лучше' : 'жоғары — жақсы'}</div></th>
                <th style={th}>Brier<div style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-3)' }}>{isRu ? 'ниже — лучше' : 'төмен — жақсы'}</div></th>
                <th style={th}>{isRu ? 'прогноз Σp' : 'болжам Σp'}</th>
                <th style={th}>{isRu ? 'промах по сумме' : 'сома бойынша қате'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isModel = r.key === 'model';
                const over = r.expectedSum != null && actual != null ? r.expectedSum - actual : null;
                return (
                  <tr key={r.key} style={{ background: isModel ? 'var(--yard-soft)' : 'transparent', borderTop: '1px solid var(--line)' }}>
                    <td style={{ ...tdLeft, fontWeight: isModel ? 600 : 400, color: isModel ? 'var(--yard)' : 'var(--ink)' }}>
                      {isRu ? r.labelRu : r.labelKz}
                    </td>
                    <td style={{ ...td, fontWeight: isModel ? 700 : 600, color: isModel ? 'var(--yard)' : 'var(--ink)' }}>{f3(r.rocAuc)}</td>
                    <td style={{ ...td, fontWeight: isModel ? 700 : 600, color: isModel ? 'var(--yard)' : 'var(--ink)' }}>{f3(r.prAuc)}</td>
                    <td style={{ ...td, fontWeight: isModel ? 700 : 600, color: isModel ? 'var(--yard)' : 'var(--ink)' }}>{f3(r.brier)}</td>
                    <td style={{ ...td, color: isModel ? 'var(--yard)' : 'var(--ink-2)' }}>{f0(r.expectedSum)}</td>
                    <td style={{ ...td, color: isModel ? 'var(--yard)' : 'var(--ink-2)' }}>
                      {f0(r.absExpectedError)}
                      {over != null && (
                        <span style={{ marginLeft: 5, fontFamily: 'inherit', fontSize: 11, fontWeight: 400, color: 'var(--ink-3)' }}>
                          {over >= 0 ? (isRu ? 'завысил' : 'асырды') : (isRu ? 'занизил' : 'кемітті')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>
          {isRu
            ? `«Прогноз Σp» — сумма вероятностей по всем ${f0(nTest)} ответам теста, то есть сколько человек предсказатель ждал. Факт: пришли ${f0(actual)}.`
            : `«Болжам Σp» — тесттегі барлық ${f0(nTest)} жауап бойынша ықтималдықтар қосындысы, яғни болжаушы қанша адам күткені. Шындығы: ${f0(actual)} келді.`}
        </div>
      </div>

      {/* Вывод крупно — то самое «модель не повторяет счётчик» */}
      <div style={{ ...card, marginTop: 12, borderColor: 'var(--yard)' }}>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)' }}>
          {isRu ? 'Модель обыгрывает счётчик «по ответу» на ' : 'Модель «жауап бойынша» санауышты '}
          <span style={{ ...mono, fontSize: 20, color: 'var(--yard)' }}>{lift3(lift.vsAnswerOnly)}</span>
          {isRu ? ' ROC-AUC и формулу — на ' : ' ROC-AUC-қа және формуланы '}
          <span style={{ ...mono, fontSize: 20, color: 'var(--yard)' }}>{lift3(lift.vsFormula)}</span>
          {isRu ? '.' : ' ROC-AUC-қа ұтады.'}
        </div>
        <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {isRu
            ? 'Почему это важно: наивная ставка «по ответу» может случайно угадать сумму, но она не отвечает на вопрос, КТО именно придёт, — а именно поимённая раскладка и даёт список тех, кому стоит напомнить.'
            : 'Неге маңызды: «жауап бойынша» қарапайым болжам соманы кездейсоқ тауып кетуі мүмкін, бірақ ол КІМ келетінін айтпайды, — ал кімге еске салу керегін дәл осы адам-адам бөлінісі береді.'}
        </div>
      </div>

      {/* ── Метрики модели ─────────────────────────────────────────────────── */}
      <div style={secTitle}>{t.fcQualityMetrics}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { k: 'roc', v: f3(metrics.rocAuc), l: 'ROC-AUC', tone: true },
          { k: 'pr', v: f3(metrics.prAuc), l: 'PR-AUC' },
          { k: 'brier', v: f3(metrics.brier), l: isRu ? 'Brier (ниже — лучше)' : 'Brier (төмен — жақсы)' },
          { k: 'll', v: f3(metrics.logLoss), l: 'log-loss' },
          { k: 'acc', v: metrics.accuracy != null ? `${(Number(metrics.accuracy) * 100).toFixed(1)}%` : dash, l: isRu ? 'accuracy (доля верных)' : 'accuracy (дұрыс үлесі)' },
          { k: 'f1', v: f3(metrics.f1), l: 'F1' },
          { k: 'n', v: f0(nTest), l: isRu ? 'ответов в тесте' : 'тесттегі жауап' },
        ].map((m) => (
          <div key={m.k} style={card}>
            <div style={{ fontFamily: 'var(--fm)', fontWeight: 700, fontSize: 22, color: m.tone ? 'var(--yard)' : 'var(--ink)', letterSpacing: '-.01em' }}>{m.v}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.35 }}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* Матрица ошибок 2×2: строки — что предсказали, столбцы — что случилось */}
      {(cm.tp != null || cm.tn != null) && (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>
            {isRu ? 'Матрица ошибок' : 'Қателер матрицасы'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 }}>
            {isRu ? `при пороге ${threshold != null ? Number(threshold).toFixed(2) : dash}` : `${threshold != null ? Number(threshold).toFixed(2) : dash} шегінде`}
          </div>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 320, display: 'grid', gridTemplateColumns: 'minmax(120px, 1.1fr) 1fr 1fr', gap: 6 }}>
              <div />
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', paddingBottom: 2 }}>{isRu ? 'пришёл' : 'келді'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', textAlign: 'center', paddingBottom: 2 }}>{isRu ? 'не пришёл' : 'келмеді'}</div>

              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', alignItems: 'center' }}>{isRu ? 'предсказали «придёт»' : 'болжам: «келеді»'}</div>
              <Cell value={cm.tp} good />
              <Cell value={cm.fp} />

              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', alignItems: 'center' }}>{isRu ? 'предсказали «не придёт»' : 'болжам: «келмейді»'}</div>
              <Cell value={cm.fn} />
              <Cell value={cm.tn} good />
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)' }}>
            {isRu
              ? 'По диагонали — угаданные исходы. Правый верхний угол (ждали, не пришёл) — это те, из-за кого сбор проседает; ради них и нужен список «кому напомнить».'
              : 'Диагональ — дұрыс болжамдар. Оң жақ жоғарғы бұрыш (күттік, келмеді) — жиынды құлататындар; «кімге еске салу» тізімі солар үшін керек.'}
          </div>
        </div>
      )}

      {/* ── Важность признаков ─────────────────────────────────────────────── */}
      {features.length > 0 && (
        <>
          <div style={secTitle}>{t.fcQualityFeatures}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', margin: '-6px 0 12px' }}>{t.fcQualityFeaturesSub}</div>
          <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {features.map((r) => {
              const raw = Number(r.importance) || 0;
              // Отрицательная важность — шум перестановочного теста, а не «вредный
              // признак». Рисуем нулём, но значение не подменяем.
              const val = raw > 0 ? raw : 0;
              const pct = maxImp > 0 ? (val / maxImp) * 100 : 0;
              const label = (isRu ? FEATURE_RU : FEATURE_KZ)[r.feature] || r.feature;
              return (
                <div key={r.feature}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--ink)', minWidth: 0 }}>{label}</span>
                    <span style={{ flex: 'none', ...mono, fontSize: 12.5, color: val > 0 ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                      {val.toFixed(3)}
                      {r.std != null && <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}> ±{Number(r.std).toFixed(3)}</span>}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{ height: 8, borderRadius: 999, width: `${pct}%`, background: 'var(--yard)', transition: 'width var(--t-move) var(--ease-soft)' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-3)', paddingTop: 2 }}>
              {isRu
                ? 'Ответ на приглашение — сильнейший признак, и это ожидаемо. Но он не единственный: без истории явок, совпадения темы и надёжности модель теряет ту самую разницу, которая видна в таблице выше.'
                : 'Шақыруға жауап — ең күшті белгі, бұл күтілген нәрсе. Бірақ жалғыз емес: келу тарихы, тақырып сәйкестігі және сенімділік болмаса, модель жоғарыдағы кестедегі артықшылығын жоғалтады.'}
            </div>
          </div>
        </>
      )}

      {/* ── Как воспроизвести ──────────────────────────────────────────────── */}
      <div style={secTitle}>{isRu ? 'Как воспроизвести' : 'Қалай қайталауға болады'}</div>
      <div style={card}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', padding: '12px 14px' }}>
          <code style={{ fontFamily: 'var(--fm)', fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre' }}>
            cd ml && python train.py && python evaluate.py && python baseline.py
          </code>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {isRu
            ? 'Все числа на этом экране читаются из ml/artifacts/*.json — metrics.json, baselines.json, feature_importance.json. Ничего не хардкодится в интерфейсе: перезапустили обучение — экран показал новые цифры.'
            : 'Осы экрандағы барлық сандар ml/artifacts/*.json файлдарынан оқылады — metrics.json, baselines.json, feature_importance.json. Интерфейсте ештеңе қатып тұрған жоқ: оқытуды қайта жүргізсеңіз, экран жаңа сандарды көрсетеді.'}
        </div>
      </div>
    </Container>
  );
}

// Ячейка матрицы ошибок. Нет значения → прочерк, не ноль.
function Cell({ value, good }) {
  return (
    <div style={{
      padding: '14px 10px',
      borderRadius: 'var(--r-s)',
      background: good ? 'var(--yard-soft)' : 'var(--paper)',
      textAlign: 'center',
    }}>
      <span style={{ fontFamily: 'var(--fm)', fontWeight: 700, fontSize: 19, color: good ? 'var(--yard)' : 'var(--ink-2)' }}>
        {value == null ? '—' : Number(value).toLocaleString('ru-RU')}
      </span>
    </div>
  );
}

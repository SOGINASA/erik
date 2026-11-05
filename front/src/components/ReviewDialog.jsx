import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { api } from '../lib/api';
import { Sheet } from './ui/Sheet';
import { Textarea } from './ui/controls';
import Button from './ui/Button';
import { QUESTIONS } from './ApplicationQuestionnaire';

const reasons = { complete_and_valid: 'Сведения полные и соответствуют требованиям', missing_details: 'Недостаточно сведений', eligibility_not_met: 'Не выполнены условия участия', verification_failed: 'Сведения не удалось подтвердить', duplicate: 'Дублирующая заявка', safety_concern: 'Вопросы безопасности', out_of_scope: 'Не соответствует назначению платформы', other: 'Другая причина' };
const checks = {
  gathering: { completeness: 'Сведения о мероприятии', safety: 'План безопасности', scope: 'Волонтёрский характер' },
  organizer_role: { motivation: 'Мотивация', experience: 'Опыт и готовность организовывать', scope: 'Планы работы с волонтёрами' },
  organization: { registration: 'Регистрация НКО', authority: 'Полномочия представителя', scope: 'Работа с волонтёрами' },
  university_membership: { document_readable: 'Студбилет читаем', university_matches: 'Студбилет относится к этому вузу' },
  event_participation: { requirements_match: 'Соответствие задачам и условиям мероприятия' },
  report: { evidence_reviewed: 'Содержание и подтверждения жалобы' },
  legacy_organization: { registration: 'Регистрация НКО', authority: 'Полномочия представителя' },
};
const selectStyle = { width: '100%', height: 44, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', padding: '0 10px', marginTop: 6 };
export const emptyReview = () => ({ reasonCode: '', certainty: '', checks: {}, note: '' });
export const reviewComplete = (kind, value) => !!value.reasonCode && !!value.certainty && Object.keys(checks[kind] || {}).every((key) => value.checks[key] && value.checks[key] !== 'not_checked');

export function ReviewAnnotation({ kind, value, onChange, disabled = false, showNote = true }) {
  return <fieldset disabled={disabled} style={{ border: '1px solid var(--line)', padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <legend>Результат проверки</legend>
    <label>Основание решения<select aria-label="Основание решения" style={selectStyle} value={value.reasonCode} onChange={(e) => onChange({ ...value, reasonCode: e.target.value })}><option value="">Выберите основание</option>{Object.entries(reasons).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
    {Object.entries(checks[kind] || {}).map(([key, title]) => <label key={key}>{title}<select aria-label={title} style={selectStyle} value={value.checks[key] || ''} onChange={(e) => onChange({ ...value, checks: { ...value.checks, [key]: e.target.value } })}>
      <option value="">Не проверено</option><option value="passed">Подтверждено</option><option value="failed">Не соответствует</option><option value="not_applicable">Не применимо</option></select></label>)}
    <label>Уверенность в решении<select aria-label="Уверенность в решении" style={selectStyle} value={value.certainty} onChange={(e) => onChange({ ...value, certainty: e.target.value })}><option value="">Выберите вариант</option><option value="certain">Данных достаточно</option><option value="needs_second_review">Нужна дополнительная проверка</option></select></label>
    {showNote && <Textarea label="Комментарий проверяющего" maxLength={2000} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />}
  </fieldset>;
}

export function ApplicationEvidence({ kind, sourceId, onVersion }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api.reviewHistory(kind, sourceId).then((r) => { if (alive) { setRows(r.submissions); onVersion?.(r.submissions[r.submissions.length - 1]?.revision || null); } }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [kind, sourceId, onVersion]);
  if (failed) return <p role="alert">Не удалось загрузить анкету и историю. Закройте окно и повторите открытие.</p>;
  if (!rows) return <p role="status">Загружаем ответы…</p>;
  const latest = rows[rows.length - 1];
  return <section><h3>Ответы заявителя</h3>{latest ? <>
    <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Версия {latest.revision} · {new Date(latest.submittedAt).toLocaleString('ru-RU')}</p>
    {(QUESTIONS[kind] || []).map(([key, label]) => <div key={key} style={{ marginBottom: 12 }}><strong>{label}</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{latest.details.answers?.[key] || 'Ответ не заполнен'}</p></div>)}
    {rows.length > 1 && <details><summary>Предыдущие версии и решения · {rows.length - 1}</summary>{rows.slice(0, -1).map((row) => <div key={row.revision}><strong>Версия {row.revision}</strong>{Object.entries(row.details.answers || {}).map(([key, text]) => <p key={key}>{key}: {text}</p>)}{row.decisions.map((decision, i) => <p key={i}>{decision.outcome} · {decision.reasonCode} · {decision.note}</p>)}</div>)}</details>}
  </> : <p>Старая заявка: анкета ещё не заполнена.</p>}</section>;
}

export default function ReviewDialog({ kind, sourceId, onDecision, onClose }) {
  const ru = useLang() === 'ru';
  const [review, setReview] = useState(emptyReview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submissionRevision, setSubmissionRevision] = useState(undefined);
  const submit = async (outcome) => {
    if (busy || submissionRevision === undefined || !reviewComplete(kind, review)) return;
    if ((outcome === 'rejected' || review.reasonCode === 'other') && review.note.trim().length < 10) { setError('Укажите пояснение не короче 10 символов.'); return; }
    setBusy(true); setError('');
    try { await onDecision(outcome, { review: { ...review, submissionRevision }, reason: review.note.slice(0, 400) }); onClose(); }
    catch (e) { setError(e.message || 'Решение не сохранено'); } finally { setBusy(false); }
  };
  return <Sheet open onClose={busy ? () => {} : onClose} title={ru ? 'Рассмотрение заявки' : 'Өтінімді қарау'} maxWidth={620}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><ApplicationEvidence kind={kind} sourceId={sourceId} onVersion={setSubmissionRevision} />
      <ReviewAnnotation kind={kind} value={review} onChange={setReview} disabled={busy} />
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Button disabled={busy || submissionRevision === undefined || !reviewComplete(kind, review)} onClick={() => submit(kind === 'report' ? 'upheld' : 'approved')}>{kind === 'report' ? 'Жалоба подтверждена' : 'Одобрить'}</Button><Button variant="secondary" disabled={busy || submissionRevision === undefined || !reviewComplete(kind, review)} onClick={() => submit(kind === 'report' ? 'dismissed' : 'rejected')}>{kind === 'report' ? 'Жалоба не подтвердилась' : 'Отклонить'}</Button></div>
    </div>
  </Sheet>;
}

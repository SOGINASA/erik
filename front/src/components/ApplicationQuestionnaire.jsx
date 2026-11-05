import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { api } from '../lib/api';
import { Textarea } from './ui/controls';
import Button from './ui/Button';

export const QUESTIONS = {
  report: [['evidence', 'Что произошло и какие есть подтверждения?', 'Не болды және қандай дәлелдер бар?']],
  gathering: [
    ['purpose', 'Какую задачу решит мероприятие и какой результат ожидаете?', 'Іс-шара қандай міндетті шешеді және қандай нәтиже күтесіз?'],
    ['volunteerTasks', 'Что будут делать волонтёры? Укажите задачи и требования.', 'Еріктілер не істейді? Міндеттер мен талаптарды көрсетіңіз.'],
    ['safetyPlan', 'Как организуете безопасность, инструктаж и помощь участникам?', 'Қауіпсіздікті, нұсқаулықты және қатысушыларға көмекті қалай ұйымдастырасыз?']],
  organizer_role: [
    ['motivation', 'Почему хотите стать координатором?', 'Неліктен үйлестіруші болғыңыз келеді?'],
    ['experience', 'Какой опыт есть? Если опыта нет, так и напишите.', 'Қандай тәжірибеңіз бар? Тәжірибе болмаса, солай жазыңыз.'],
    ['plannedContribution', 'Какие мероприятия планируете и как будете работать с волонтёрами?', 'Қандай іс-шаралар жоспарлайсыз және еріктілермен қалай жұмыс істейсіз?']],
  organization: [
    ['volunteerTasks', 'Какие задачи будете поручать волонтёрам?', 'Еріктілерге қандай міндеттер бересіз?'],
    ['supportPlan', 'Кто и как будет обучать и поддерживать волонтёров?', 'Еріктілерді кім және қалай оқытып, қолдайды?']],
  university_membership: [
    ['faculty', 'Факультет / образовательная программа', 'Факультет / білім беру бағдарламасы'],
    ['studyYear', 'Курс обучения', 'Оқу курсы'],
    ['motivation', 'В каких волонтёрских делах хотите участвовать?', 'Қандай еріктілік істерге қатысқыңыз келеді?']],
  event_participation: [
    ['motivation', 'Почему хотите участвовать и чем можете помочь?', 'Неліктен қатысқыңыз келеді және қалай көмектесе аласыз?'],
    ['experience', 'Какой опыт или навыки подходят к задачам мероприятия?', 'Іс-шара міндеттеріне қандай тәжірибе немесе дағдылар сәйкес келеді?'],
    ['availability', 'Сможете быть всё время мероприятия? Укажите ограничения.', 'Іс-шараның бүкіл уақытында бола аласыз ба? Шектеулерді көрсетіңіз.']],
};
export const emptyDetails = () => ({ formVersion: 1, answers: {} });
export const detailsComplete = (kind, value) => (QUESTIONS[kind] || []).every(([key]) => (value?.answers?.[key] || '').trim().length >= (key === 'studyYear' ? 1 : 3));

export default function ApplicationQuestionnaire({ kind, value = emptyDetails(), onChange, disabled = false }) {
  const ru = useLang() === 'ru';
  return <fieldset disabled={disabled} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, margin: 0 }}>
    <legend>{ru ? 'Подробнее о заявке' : 'Өтінім туралы толығырақ'}</legend>
    <p style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.5, margin: 0 }}>{ru ? 'Ответьте по существу: это поможет проверяющему понять заявку. Не указывайте ИИН, номера документов, пароли или чужие контакты.' : 'Нақты жауап беріңіз: бұл тексерушіге өтінімді түсінуге көмектеседі. ЖСН, құжат нөмірлерін, құпиясөздерді немесе өзгенің байланыстарын көрсетпеңіз.'}</p>
    {(QUESTIONS[kind] || []).map(([key, label, kz]) => <Textarea key={key} label={ru ? label : kz} required minLength={key === 'studyYear' ? 1 : 3} maxLength={2000} rows={key === 'studyYear' ? 1 : 3}
      value={value.answers?.[key] || ''} onChange={(e) => onChange({ formVersion: 1, answers: { ...value.answers, [key]: e.target.value } })} />)}
  </fieldset>;
}

export function PendingApplicationEditor({ kind, sourceId }) {
  const [details, setDetails] = useState(emptyDetails);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const ru = useLang() === 'ru';
  useEffect(() => {
    let alive = true;
    api.applicationDetails(kind, sourceId).then((r) => { if (alive) { setDetails(r.applicationDetails); setState(r.editable ? 'ready' : 'closed'); } }, () => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [kind, sourceId]);
  const save = async () => {
    setState('saving'); setError(''); setSaved(false);
    try { await api.saveApplicationDetails(kind, sourceId, details); setSaved(true); }
    catch (e) { setError(e.message); } finally { setState('ready'); }
  };
  if (state === 'loading') return <p role="status">{ru ? 'Загружаем анкету…' : 'Сауалнама жүктелуде…'}</p>;
  if (state === 'closed') return null;
  if (state === 'error') return <p role="alert">{ru ? 'Не удалось загрузить анкету. Обновите страницу.' : 'Сауалнама жүктелмеді. Бетті жаңартыңыз.'}</p>;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
    <ApplicationQuestionnaire kind={kind} value={details} onChange={(next) => { setDetails(next); setSaved(false); }} disabled={state === 'saving'} />
    {error && <p role="alert">{error}</p>}{saved && <p role="status">{ru ? 'Ответы сохранены и доступны проверяющему.' : 'Жауаптар сақталды және тексерушіге қолжетімді.'}</p>}
    <Button disabled={!detailsComplete(kind, details)} loading={state === 'saving'} onClick={save}>{ru ? 'Сохранить ответы' : 'Жауаптарды сақтау'}</Button>
  </div>;
}

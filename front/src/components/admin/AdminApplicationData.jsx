import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Button from '../ui/Button';
import { SectionCard, StatCard } from './kit';

const kindNames = { gathering: 'Создание сборов', organizer_role: 'Роли организаторов', organization: 'НКО', university_membership: 'Вступление в вуз', event_participation: 'Участие в мероприятиях', report: 'Жалобы', legacy_organization: 'Архивные заявки НКО' };
export default function AdminApplicationData() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api.applicationDataStats().then(setStats).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const download = async (trainingOnly) => {
    setBusy(true); setError('');
    try {
      const blob = await api.exportApplicationData(trainingOnly);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `application-data-${trainingOnly ? 'training' : 'all'}-v1.jsonl`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <h2>Данные рассмотрения заявок</h2><p>История сохраняет версии анкет и решения проверяющих. Модель пока не принимает решений и не выставляет метки.</p>
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    {!stats ? <Button onClick={load}>Загрузить статистику</Button> : <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}><StatCard label="Версии заявок" value={stats.submissions || 0} /><StatCard label="Решения" value={stats.decisions || 0} /><StatCard label="Готовы для обучения" value={stats.trainingEligible || 0} /><StatCard label="Требуют доработки / проверки" value={stats.excluded || 0} /></div>
      <SectionCard title="Виды заявок">{Object.entries(stats.kinds).map(([key, count]) => <p key={key}>{kindNames[key] || key}: {count}</p>)}</SectionCard>
      <SectionCard title="Почему записи исключены из обучения"><p>Одна запись может иметь несколько причин.</p>{Object.entries(stats.exclusionReasons).map(([key, count]) => <p key={key}><code>{key}</code>: {count}</p>)}</SectionCard>
      <SectionCard title="Выгрузка JSONL"><p>По умолчанию выгружаются признаки и разметка без свободного текста, контактов и документов. Идентификаторы заменены устойчивыми псевдонимами. Полная выгрузка включает неразмеченные записи с причинами исключения.</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Button disabled={busy} onClick={() => download(true)}>Для обучения</Button><Button disabled={busy} variant="secondary" onClick={() => download(false)}>Все версии и метки</Button><Button variant="ghost" onClick={load}>Обновить статистику</Button></div></SectionCard>
    </>}
  </div>;
}

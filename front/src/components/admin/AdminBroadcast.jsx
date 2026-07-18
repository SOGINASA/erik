import { useState } from 'react';
import { useUiStore } from '../../store/useUiStore';
import { SectionCard, FilterChips, StatusPill } from './kit';
import Button from '../ui/Button';
import { Field, Textarea, FieldLabel } from '../ui/controls';

// Аудитории рассылки: value для чипов, pill — короткая подпись в списке,
// reach — охват (демо), tone — цвет статус-пилла.
const AUDIENCES = [
  { value: 'all', label: 'Все пользователи', pill: 'Все', reach: '20 300', tone: 'blue' },
  { value: 'vol', label: 'Волонтёры', pill: 'Волонтёры', reach: '18 900', tone: 'yard' },
  { value: 'coord', label: 'Координаторы', pill: 'Координаторы', reach: '128', tone: 'maybe' },
  { value: 'nko', label: 'НКО', pill: 'НКО', reach: '810', tone: 'out' },
  { value: 'city', label: 'По городу', pill: 'По городу', reach: '2 400', tone: 'blue' },
];

// Рассылки/объявления: форма нового объявления + список отправленных (демо).
export default function AdminBroadcast() {
  const showToast = useUiStore((s) => s.showToast);

  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState([
    { title: 'Субботник в вашем городе в эту субботу', audience: 'Волонтёры', reach: '18 900', time: '2 ч', tone: 'yard' },
    { title: 'Обновление: новые категории сборов', audience: 'Все', reach: '20 300', time: 'вчера', tone: 'blue' },
    { title: 'Приглашаем НКО на вебинар по координации', audience: 'НКО', reach: '810', time: '3 дн', tone: 'out' },
  ]);

  const send = () => {
    const t = title.trim();
    if (!t) return;
    const a = AUDIENCES.find((x) => x.value === audience) || AUDIENCES[0];
    showToast(`Объявление отправлено ${a.reach} получателям`);
    setSent((prev) => [{ title: t, audience: a.pill, reach: a.reach, time: 'сейчас', tone: a.tone }, ...prev]);
    setTitle('');
    setText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {/* Форма нового объявления */}
        <SectionCard title="Новое объявление">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <FieldLabel>Аудитория</FieldLabel>
              <FilterChips options={AUDIENCES} value={audience} onChange={setAudience} />
            </div>
            <Field label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="О чём объявление?" />
            <div>
              <Textarea label="Текст (RU)" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст объявления…" />
              <div style={{ marginTop: 6, textAlign: 'right', fontSize: 12, color: 'var(--ink-3)' }}>
                {text.length} символов
              </div>
            </div>
            <Button size="lg" icon="send" disabled={!title.trim()} onClick={send}>Отправить</Button>
          </div>
        </SectionCard>

        {/* Список отправленных */}
        <SectionCard title="Отправленные" pad={8}>
          {sent.length === 0 ? (
            <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
              Пока ничего не отправлено
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {sent.map((s, i) => (
                <div key={i} style={{ padding: '12px 8px', borderBottom: i < sent.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35 }}>{s.title}</span>
                    <StatusPill tone={s.tone}>{s.audience}</StatusPill>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>отправлено {s.time}</span>
                    <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-2)' }}>охват {s.reach}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useUiStore } from '../../store/useUiStore';
import { usePlatformStore } from '../../store/usePlatformStore';
import { api } from '../../lib/api';
import { SectionCard, FilterChips, StatusPill } from './kit';
import Button from '../ui/Button';
import { Field, Textarea, FieldLabel } from '../ui/controls';

// Аудитории рассылки: value для чипов, pill — короткая подпись, tone — цвет пилла.
// Реальный размер сегмента берётся из /admin/stats (statKey), а не хардкодится.
const AUDIENCES = [
  { value: 'all', label: 'Все пользователи', pill: 'Все', statKey: 'users', tone: 'blue' },
  { value: 'vol', label: 'Волонтёры', pill: 'Волонтёры', statKey: 'volunteers', tone: 'yard' },
  { value: 'coord', label: 'Координаторы', pill: 'Координаторы', statKey: 'coordinators', tone: 'maybe' },
  { value: 'nko', label: 'НКО', pill: 'НКО', statKey: 'nkoUsers', tone: 'out' },
  { value: 'city', label: 'По городу', pill: 'По городу', statKey: null, tone: 'blue' },
];

const fmt = (n) => Number(n).toLocaleString('ru-RU');

// Рассылки/объявления: форма нового объявления + локальный лог отправленных за сессию.
export default function AdminBroadcast() {
  const showToast = useUiStore((s) => s.showToast);
  const cities = usePlatformStore((s) => s.cities);

  const [stats, setStats] = useState(null);
  const [audience, setAudience] = useState('all');
  const [cityId, setCityId] = useState(() => cities[0]?.id || '');

  // Реальные размеры сегментов для подсказки охвата.
  useEffect(() => { api.adminStats().then(setStats).catch(() => {}); }, []);
  const segSize = (a) => (stats && a.statKey && stats[a.statKey] != null ? fmt(stats[a.statKey]) : null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [textKz, setTextKz] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState([]);

  const cityOptions = cities.map((c) => ({ value: c.id, label: c.ru }));

  const send = async () => {
    const t = title.trim();
    if (!t || busy) return;
    const a = AUDIENCES.find((x) => x.value === audience) || AUDIENCES[0];

    const body = { segment: audience, title: t, textRu: text, textKz: textKz || text };
    if (audience === 'city') {
      if (!cityId) {
        showToast('Выберите город');
        return;
      }
      body.cityId = cityId;
    }

    setBusy(true);
    try {
      const res = await api.sendBroadcast(body);
      const reach = fmt(res.reach);
      showToast(`Объявление отправлено ${reach} получателям`);
      setSent((prev) => [{ title: t, audience: a.pill, reach, time: 'сейчас', tone: a.tone }, ...prev]);
      setTitle('');
      setText('');
      setTextKz('');
    } catch (e) {
      showToast(e.message || 'Не удалось отправить объявление');
    } finally {
      setBusy(false);
    }
  };

  const cityMissing = audience === 'city' && !cityId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        {/* Форма нового объявления */}
        <SectionCard title="Новое объявление">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <FieldLabel>Аудитория</FieldLabel>
              <FilterChips options={AUDIENCES} value={audience} onChange={setAudience} />
              {(() => {
                const a = AUDIENCES.find((x) => x.value === audience);
                const size = a && segSize(a);
                return size ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>≈ {size} получателей</div>
                ) : null;
              })()}
            </div>
            {audience === 'city' && (
              <div>
                <FieldLabel>Город</FieldLabel>
                {cityOptions.length ? (
                  <FilterChips options={cityOptions} value={cityId} onChange={setCityId} />
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Список городов недоступен</div>
                )}
              </div>
            )}
            <Field label="Заголовок" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="О чём объявление?" />
            <div>
              <Textarea label="Текст (RU)" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст объявления…" />
              <div style={{ marginTop: 6, textAlign: 'right', fontSize: 12, color: 'var(--ink-3)' }}>
                {text.length} символов
              </div>
            </div>
            <Textarea label="Текст (KZ) · необязательно" rows={3} value={textKz} onChange={(e) => setTextKz(e.target.value)} placeholder="Хабарландыру мәтіні… (пусто → возьмём RU)" />
            <Button size="lg" icon="send" loading={busy} disabled={!title.trim() || busy || cityMissing} onClick={send}>Отправить</Button>
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

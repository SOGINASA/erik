import { useCallback, useEffect, useState } from 'react';
import { useT, useLang } from '../i18n';
import { api } from '../lib/api';
import { useUiStore } from '../store/useUiStore';
import { plural } from '../lib/data';
import { Container } from '../components/Container';
import { Field, Textarea, FieldLabel } from '../components/ui/controls';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { Skeleton } from '../components/ui/feedback';

// Выпадающий список: в controls.jsx селекта нет — те же 48px/рамка/радиус, что у Field
// (как в NewGathering и EditProfileSheet), поля стоят в одну линию.
function Select({ label, value, onChange, placeholder, options }) {
  return (
    <label style={{ display: 'block' }}>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={onChange}
        className="erik-input"
        style={{
          width: '100%', height: 48, padding: '0 12px', borderRadius: 'var(--r-s)',
          border: '1px solid var(--line)', background: 'var(--surface)',
          color: value ? 'var(--ink)' : 'var(--ink-3)', fontSize: 16, outline: 'none',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const cardBox = { padding: '18px 18px 20px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' };
const sectionTitle = { fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '30px 0 12px' };

// Кабинет НКО: свои организации с правкой, создание НКО и рассылка по базе волонтёров.
// Роль 'org' сюда уже пропустил гейт (см. lib/nav ORG_ROUTES) — API зовём напрямую
// с локальным состоянием (прецедент — ManageVolunteers).
export default function ManageOrg() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const showToast = useUiStore((s) => s.showToast);

  const [status, setStatus] = useState('loading'); // loading | error | ready
  const [orgs, setOrgs] = useState([]);
  const [themes, setThemes] = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({ name: '', cat: '', cityId: '', aboutRu: '', aboutKz: '' });
  const [creating, setCreating] = useState(false);

  // Свои организации + справочники тем/городов для селектов. Справочники не критичны:
  // если не пришли, форма всё равно работает (селект просто пустой), поэтому их ошибку глушим.
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [orgRes, thRes, ctRes] = await Promise.all([
        api.myOrgs(),
        api.getThemes().catch(() => ({ themes: [] })),
        api.getCities().catch(() => ({ cities: [] })),
      ]);
      setOrgs(orgRes.orgs || []);
      setThemes(thRes.themes || []);
      setCities(ctRes.cities || []);
      setStatus('ready');
    } catch (_) {
      setStatus('error');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const themeOptions = themes.map((th) => ({ value: th.id, label: isRu ? th.ru : th.kz }));
  const cityOptions = cities.map((c) => ({ value: c.id, label: isRu ? c.ru : c.kz }));

  const upCreate = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const applySaved = (updated) => setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));

  const submitCreate = async () => {
    if (creating) return;
    if (!form.name.trim()) { showToast(t.orgNameReq); return; }
    setCreating(true);
    try {
      // Пустые поля не шлём — undefined выпадает при JSON.stringify (как в create сбора).
      const res = await api.createOrg({
        name: form.name.trim(),
        cat: form.cat || undefined,
        cityId: form.cityId || undefined,
        aboutRu: form.aboutRu.trim() || undefined,
        aboutKz: form.aboutKz.trim() || undefined,
      });
      setOrgs((prev) => [res.org, ...prev]);
      setForm({ name: '', cat: '', cityId: '', aboutRu: '', aboutKz: '' });
      showToast(t.orgCreated);
    } catch (_) {
      showToast(t.orgCreateErr);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <Container narrow style={{ paddingTop: 16, paddingBottom: 56 }}>
        <div style={{ margin: '8px 0 22px' }}>
          <div style={{ fontSize: 12, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>{t.orgHqEyebrow}</div>
          <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 30, lineHeight: 1.12, letterSpacing: '-.02em', margin: 0 }}>{t.orgHqTitle}</h1>
        </div>

        {status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1].map((i) => (
              <div key={i} style={cardBox}>
                <Skeleton width="50%" height={20} />
                <Skeleton width="80%" height={13} style={{ marginTop: 12 }} />
                <Skeleton height={44} radius={10} style={{ marginTop: 16 }} />
              </div>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 'var(--r-s)', border: '1px solid var(--line)', background: 'var(--maybe-soft)', fontSize: 14, color: 'var(--ink-2)' }}>
            <span>{t.orgHqErr}</span>
            <button type="button" className="erik-btn" onClick={load} style={{ flex: 'none', height: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-s)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{t.orgHqRetry}</button>
          </div>
        )}

        {status === 'ready' && orgs.length === 0 && (
          <>
            <div style={cardBox}>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 19, color: 'var(--ink)' }}>{t.orgNoneTitle}</div>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '6px 0 0' }}>{t.orgNoneSub}</p>
            </div>
            <div style={sectionTitle}>{t.orgCreateTitle}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label={t.orgFName} value={form.name} onChange={upCreate('name')} placeholder={t.orgFNamePh} />
              <Select label={t.orgFCat} placeholder={t.orgFCatPh} value={form.cat} onChange={upCreate('cat')} options={themeOptions} />
              <Select label={t.orgFCity} placeholder={t.orgFCityPh} value={form.cityId} onChange={upCreate('cityId')} options={cityOptions} />
              <Textarea label={t.orgFAboutRu} value={form.aboutRu} onChange={upCreate('aboutRu')} placeholder={t.orgFAboutPh} />
              <Textarea label={t.orgFAboutKz} value={form.aboutKz} onChange={upCreate('aboutKz')} placeholder={t.orgFAboutPh} />
              <Button icon="plus" loading={creating} onClick={submitCreate} style={{ alignSelf: 'flex-start' }}>{t.orgCreateCta}</Button>
            </div>
          </>
        )}

        {status === 'ready' && orgs.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {orgs.map((o) => (
                <OrgCard key={o.id} org={o} themeOptions={themeOptions} cityOptions={cityOptions} onSaved={applySaved} />
              ))}
            </div>
            <div style={sectionTitle}>{t.orgCastTitle}</div>
            <Broadcast />
          </>
        )}
      </Container>
    </div>
  );
}

// Карточка одной организации с правкой. Своё состояние формы, засеянное из org;
// verified показываем только для чтения — его меняет админ, бэк правку игнорирует.
function OrgCard({ org, themeOptions, cityOptions, onSaved }) {
  const t = useT();
  const showToast = useUiStore((s) => s.showToast);
  const [f, setF] = useState({
    name: org.name || '', cat: org.cat || '', cityId: org.cityId || '',
    aboutRu: org.aboutRu || '', aboutKz: org.aboutKz || '',
  });
  const [saving, setSaving] = useState(false);
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    if (saving) return;
    if (!f.name.trim()) { showToast(t.orgNameReq); return; }
    setSaving(true);
    try {
      const res = await api.patchOrg(org.id, {
        name: f.name.trim(),
        cat: f.cat || null,
        cityId: f.cityId || null,
        aboutRu: f.aboutRu.trim(),
        aboutKz: f.aboutKz.trim(),
      });
      onSaved(res.org);
      showToast(t.orgSaved);
    } catch (_) {
      showToast(t.orgSaveErr);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={cardBox}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: '.03em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{t.orgEditTitle}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 10px', borderRadius: 999, background: org.verified ? 'var(--yard-soft)' : 'var(--paper)', color: org.verified ? 'var(--yard)' : 'var(--ink-3)', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {org.verified && <Icon name="check" size={12} stroke={2.4} />}
          {org.verified ? t.orgVerifiedYes : t.orgVerifiedNo}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label={t.orgFName} value={f.name} onChange={up('name')} placeholder={t.orgFNamePh} />
        <Select label={t.orgFCat} placeholder={t.orgFCatPh} value={f.cat} onChange={up('cat')} options={themeOptions} />
        <Select label={t.orgFCity} placeholder={t.orgFCityPh} value={f.cityId} onChange={up('cityId')} options={cityOptions} />
        <Textarea label={t.orgFAboutRu} value={f.aboutRu} onChange={up('aboutRu')} placeholder={t.orgFAboutPh} />
        <Textarea label={t.orgFAboutKz} value={f.aboutKz} onChange={up('aboutKz')} placeholder={t.orgFAboutPh} />
        <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.45 }}>{t.orgVerHint}</div>
        <Button loading={saving} onClick={save} style={{ alignSelf: 'flex-start' }}>{t.orgSaveCta}</Button>
      </div>
    </div>
  );
}

// Рассылка своей базе волонтёров (тем, кто приходил на сборы). Бэк лимитит 5/час —
// 429 показываем внятным тостом, а не общей ошибкой.
function Broadcast() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const showToast = useUiStore((s) => s.showToast);
  const [f, setF] = useState({ title: '', textRu: '', textKz: '' });
  const [sending, setSending] = useState(false);
  const up = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const send = async () => {
    if (sending) return;
    if (!f.title.trim() && !f.textRu.trim() && !f.textKz.trim()) { showToast(t.orgCastEmpty); return; }
    setSending(true);
    try {
      const res = await api.orgBroadcast({ title: f.title.trim(), textRu: f.textRu.trim(), textKz: f.textKz.trim() });
      const n = (res && res.sent) || 0;
      if (n === 0) {
        showToast(t.orgCastNoone);
      } else {
        showToast(isRu
          ? `Рассылка отправлена — ${n} ${plural(n, ['волонтёру', 'волонтёрам', 'волонтёрам'])}`
          : `Хабарлама ${n} волонтёрге жіберілді`);
      }
      setF({ title: '', textRu: '', textKz: '' });
    } catch (e) {
      showToast(e && e.status === 429 ? t.orgCastLimit : t.orgCastErr);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={cardBox}>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 16px' }}>{t.orgCastSub}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label={t.orgCastFTitle} value={f.title} onChange={up('title')} placeholder={t.orgCastFTitlePh} />
        <Textarea label={t.orgCastTextRu} value={f.textRu} onChange={up('textRu')} placeholder={t.orgCastTextPh} />
        <Textarea label={t.orgCastTextKz} value={f.textKz} onChange={up('textKz')} placeholder={t.orgCastTextPh} />
        <Button icon="send" loading={sending} onClick={send} style={{ alignSelf: 'flex-start' }}>{t.orgCastSend}</Button>
      </div>
    </div>
  );
}

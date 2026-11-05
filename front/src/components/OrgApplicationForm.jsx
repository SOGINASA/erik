import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { Field, Textarea } from './ui/controls';
import Button from './ui/Button';
import './Organizations.css';

const blank = { legalName: '', legalForm: '', bin: '', legalAddress: '', cityId: '', cat: '', aboutRu: '', representativeName: '', authority: '', email: '', phone: '', publicContact: '', authorityConfirmed: false, dataConsent: false };
const forms = ['Общественное объединение', 'Общественный фонд', 'Корпоративный фонд', 'Частный фонд', 'Частное учреждение', 'Ассоциация (союз)', 'Иная некоммерческая форма'];

export default function OrgApplicationForm({ cities, themes, onRefresh }) {
  const ru = useLang() === 'ru';
  const tr = (a, b) => ru ? a : b;
  const [form, setForm] = useState(blank);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    api.myOrgApplications().then(({ applications }) => {
      if (!alive) return;
      setLoaded(true);
      const latest = applications[0] || null;
      setApplication(latest);
      if (latest?.status === 'rejected') setForm({ ...blank, ...latest.data, authorityConfirmed: false, dataConsent: false });
    }).catch((e) => { if (alive) setError(e.message || 'Не удалось загрузить заявку'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);
  const up = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { const res = await api.createOrg(form); setApplication(res.application); }
    catch (err) { setError(err?.data?.error || err.message); }
    finally { setBusy(false); }
  };
  if (loading) return <p role="status">{tr('Загружаем заявку…', 'Өтінім жүктелуде…')}</p>;
  if (!loaded) return <div role="alert" className="nko-error">{error} <Button onClick={() => setRetry((n) => n + 1)}>{tr('Повторить', 'Қайталау')}</Button></div>;
  if (application?.status === 'pending' || application?.status === 'approved') return <section className="nko-panel" aria-live="polite">
    <span className="nko-eyebrow">{tr('Заявка НКО', 'КЕҰ өтінімі')} №{application.id}</span>
    <h2>{application.status === 'pending' ? tr('Заявка на проверке', 'Өтінім тексерілуде') : tr('Организация одобрена', 'Ұйым мақұлданды')}</h2>
    <p>{application.data.legalName} · {tr('БИН', 'БСН')} {application.data.bin}</p>
    <p>{tr('Администратор проверяет регистрацию и полномочия представителя. После одобрения страница организации и кабинет появятся автоматически.', 'Әкімші тіркеуді және өкілдің өкілеттігін тексереді. Мақұлдағаннан кейін ұйым беті мен кабинеті автоматты түрде ашылады.')}</p>
    <Button onClick={onRefresh}>{tr('Проверить статус', 'Мәртебені тексеру')}</Button>
  </section>;
  return <div className="nko-flow">
    <section className="nko-panel nko-intro">
      <span className="nko-eyebrow">{tr('Организации Казахстана', 'Қазақстан ұйымдары')}</span>
      <h2>{tr('Ваша НКО на erik', 'Сіздің КЕҰ erik-те')}</h2>
      <p>{tr('Подайте одну заявку. Мы проверим сведения и создадим страницу организации после одобрения.', 'Бір өтінім беріңіз. Деректерді тексеріп, мақұлдағаннан кейін ұйым бетін жасаймыз.')}</p>
      <ol className="nko-steps"><li>{tr('Заполните сведения', 'Деректерді толтырыңыз')}</li><li>{tr('Дождитесь проверки', 'Тексеруді күтіңіз')}</li><li>{tr('Заполните страницу и создавайте события', 'Бетті толтырып, іс-шаралар жасаңыз')}</li></ol>
      <p className="nko-help">{tr('Для уже зарегистрированных в Казахстане некоммерческих юридических лиц. Это регистрация на платформе, а не государственная регистрация НКО.', 'Қазақстанда тіркелген коммерциялық емес заңды тұлғаларға арналған. Бұл КЕҰ-ны мемлекеттік тіркеу емес, платформаға тіркелу.')}</p>
    </section>
    {application?.status === 'rejected' && <section className="nko-panel" role="status"><h2>{tr('Нужны исправления', 'Түзету қажет')}</h2><p>{application.reason}</p><p>{tr('Исправьте данные ниже и отправьте новую заявку.', 'Төмендегі деректерді түзетіп, жаңа өтінім жіберіңіз.')}</p></section>}
    {error && <div role="alert" className="nko-error">{error} <Button type="button" variant="secondary" onClick={() => setRetry((n) => n + 1)}>{tr('Обновить', 'Жаңарту')}</Button></div>}
    <form onSubmit={submit} className="nko-flow">
      <fieldset className="nko-panel" disabled={busy}><legend>{tr('1. Организация', '1. Ұйым')}</legend>
        <p className="nko-help">{tr('Все поля обязательны, кроме направления. Название и форму укажите как в регистрационных сведениях.', 'Бағыттан басқа барлық өріс міндетті. Атауы мен нысанын тіркеу деректеріне сәйкес көрсетіңіз.')}</p>
        <div className="nko-grid">
          <Field label={tr('БИН · 12 цифр', 'БСН · 12 сан')} inputMode="numeric" pattern="[0-9]{12}" required maxLength={12} value={form.bin} onChange={up('bin')} />
          <Field label={tr('Полное наименование', 'Толық атауы')} required maxLength={200} value={form.legalName} onChange={up('legalName')} />
          <label>{tr('Организационно-правовая форма', 'Ұйымдық-құқықтық нысаны')}<input className="erik-input" list="nko-legal-forms" required maxLength={100} value={form.legalForm} onChange={up('legalForm')} /><datalist id="nko-legal-forms">{forms.map((f) => <option key={f} value={f} />)}</datalist></label>
          <label>{tr('Город деятельности', 'Қызмет қаласы')}<select required value={form.cityId} onChange={up('cityId')}><option value="">{tr('Выберите город', 'Қаланы таңдаңыз')}</option>{cities.map((c) => <option key={c.id} value={c.id}>{ru ? c.ru : c.kz}</option>)}</select></label>
        </div>
        <Field label={tr('Юридический адрес · только для проверки', 'Заңды мекенжай · тек тексеру үшін')} required maxLength={500} value={form.legalAddress} onChange={up('legalAddress')} />
        <label>{tr('Направление · необязательно', 'Бағыты · міндетті емес')}<select value={form.cat} onChange={up('cat')}><option value="">{tr('Выберите направление', 'Бағытты таңдаңыз')}</option>{themes.map((t) => <option key={t.id} value={t.id}>{ru ? t.ru : t.kz}</option>)}</select></label>
        <Textarea label={tr('Чем занимается организация и для чего нужны волонтёры', 'Ұйым қызметі және волонтёрлер не үшін қажет')} required maxLength={2000} value={form.aboutRu} onChange={up('aboutRu')} />
        <Field label={tr('Публичный контакт НКО · email, телефон или Telegram', 'КЕҰ ашық байланысы · email, телефон немесе Telegram')} required maxLength={300} value={form.publicContact} onChange={up('publicContact')} />
      </fieldset>
      <fieldset className="nko-panel" disabled={busy}><legend>{tr('2. Представитель', '2. Өкіл')}</legend>
        <p className="nko-help">{tr('Этот раздел виден только вам и администрации. Не присылайте ИИН, удостоверение личности, ЭЦП или пароли.', 'Бұл бөлім тек сізге және әкімшілікке көрінеді. ЖСН, жеке куәлік, ЭЦҚ немесе құпиясөз жібермеңіз.')}</p>
        <Field label={tr('Ваши ФИО', 'Аты-жөніңіз')} autoComplete="name" required maxLength={150} value={form.representativeName} onChange={up('representativeName')} />
        <Textarea label={tr('Должность и основание полномочий', 'Лауазым және өкілеттік негізі')} placeholder={tr('Например: руководитель, действую на основании устава; либо представитель по доверенности, её номер и дата.', 'Мысалы: жарғы негізінде әрекет ететін басшы немесе сенімхат бойынша өкіл, оның нөмірі мен күні.')} required maxLength={500} value={form.authority} onChange={up('authority')} />
        <div className="nko-grid"><Field label="Email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={up('email')} /><Field label={tr('Телефон с кодом страны', 'Ел коды бар телефон')} type="tel" autoComplete="tel" required maxLength={32} value={form.phone} onChange={up('phone')} /></div>
      </fieldset>
      <section className="nko-panel">
        <h2>{tr('Перед отправкой', 'Жіберу алдында')}</h2>
        <p className="nko-help">{tr('Администратор сверит БИН, наименование и статус юрлица, затем проверит ваши полномочия. При необходимости свяжется с вами для уточнений. Фото, адрес офиса и координаторов добавите после одобрения.', 'Әкімші БСН, атауы мен заңды тұлға мәртебесін, содан кейін өкілеттігіңізді тексереді. Қажет болса, сізбен байланысады. Фото, кеңсе мен үйлестірушілерді мақұлдағаннан кейін қосасыз.')}</p>
        <label className="nko-check"><input type="checkbox" required disabled={busy} checked={form.authorityConfirmed} onChange={(e) => setForm((f) => ({ ...f, authorityConfirmed: e.target.checked }))} /><span>{tr('Подтверждаю достоверность сведений и право представлять НКО. Публичный контакт предназначен для публикации.', 'Деректердің дұрыстығын және КЕҰ атынан әрекет ету құқығын растаймын. Ашық байланыс жариялауға арналған.')}</span></label>
        <label className="nko-check"><input type="checkbox" required disabled={busy} checked={form.dataConsent} onChange={(e) => setForm((f) => ({ ...f, dataConsent: e.target.checked }))} /><span>{tr('Даю согласие на обработку указанных в заявке сведений, включая мои ФИО, должность, основание полномочий, email и телефон, для проверки НКО, связи со мной и сохранения истории решений. Порядок хранения и отзыва согласия описан в политике конфиденциальности.', 'КЕҰ-ны тексеру, менімен байланысу және шешімдер тарихын сақтау үшін өтінімдегі деректерді, соның ішінде аты-жөнімді, лауазымды, өкілеттік негізін, email мен телефонды өңдеуге келісемін. Сақтау және келісімді қайтарып алу тәртібі құпиялылық саясатында көрсетілген.')}</span></label>
        <p className="nko-help"><Link to="/privacy">{tr('Обработка персональных данных', 'Дербес деректерді өңдеу')}</Link> · <a href="https://adilet.zan.kz/rus/docs/Z010000142_" target="_blank" rel="noreferrer">{tr('Закон РК «О некоммерческих организациях»', '«Коммерциялық емес ұйымдар туралы» ҚР Заңы')}</a></p>
        <Button type="submit" loading={busy}>{tr('Отправить на проверку', 'Тексеруге жіберу')}</Button>
      </section>
    </form>
  </div>;
}

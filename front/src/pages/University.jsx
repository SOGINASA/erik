import ReviewDialog from '../components/ReviewDialog';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { useSessionStore } from '../store/useSessionStore';
import { useGatheringStore } from '../store/useGatheringStore';
import { Container } from '../components/Container';
import { Field } from '../components/ui/controls';
import Button from '../components/ui/Button';
import EventCard from '../components/EventCard';
import ApplicationQuestionnaire, { emptyDetails, detailsComplete } from '../components/ApplicationQuestionnaire';
import { UniversityEditor } from './Universities';
import './Universities.css';

function JoinForm({ university, onJoined, ru }) {
  const name = useSessionStore((s) => s.name);
  const phone = useSessionStore((s) => s.phone);
  const [form, setForm] = useState({ fullName: name || '', phone: phone || '', consent: false });
  const [file, setFile] = useState(null);
  const [applicationDetails, setApplicationDetails] = useState(emptyDetails);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); if (busy) return;
    if (!detailsComplete('university_membership', applicationDetails)) { setError(ru ? 'Заполните факультет, курс и интересы.' : 'Факультетті, курсты және қызығушылықтарды толтырыңыз.'); return; }
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
      setError(ru ? 'Выберите PNG, JPEG или WebP до 5 МБ.' : '5 МБ дейін PNG, JPEG немесе WebP таңдаңыз.'); return;
    }
    setBusy(true); setError('');
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(ru ? 'Не удалось прочитать файл' : 'Файл оқылмады')); reader.readAsDataURL(file);
      });
      await api.joinUniversity(university.id, { ...form, studentCard: data, applicationDetails }); onJoined();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <form className="uni-panel uni-form" onSubmit={submit}>
    <h2>{ru ? 'Присоединиться к университету' : 'Университетке қосылу'}</h2>
    <p>{ru ? 'Заполни данные и прикрепи студбилет. Координатор проверит заявку, после чего откроется запись на мероприятия.' : 'Деректерді толтырып, студенттік билетіңді тірке. Үйлестіруші тексергеннен кейін іс-шараларға жазыла аласың.'}</p>
    <Field label={ru ? 'ФИО полностью' : 'Толық аты-жөніңіз'} required maxLength={100} autoComplete="name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
    <Field label={ru ? 'Номер телефона' : 'Телефон нөмірі'} required maxLength={32} type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
    <label className="uni-file">{ru ? 'Фото студенческого билета' : 'Студенттік билеттің фотосы'}<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); }} disabled={busy} /><small>PNG, JPEG, WebP · {ru ? 'до 5 МБ' : '5 МБ дейін'}</small></label>
    <ApplicationQuestionnaire kind="university_membership" value={applicationDetails} onChange={setApplicationDetails} disabled={busy} />
    <label className="uni-check"><input required type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />{ru ? 'Согласен передать ФИО, телефон и студбилет проверяющим университета и администрации erik для подтверждения обучения.' : 'Оқуымды растау үшін аты-жөнімді, телефонымды және студенттік билетті университеттің тексерушілеріне және erik әкімшілігіне беруге келісемін.'}</label>
    <p><Link to="/privacy">{ru ? 'Политика конфиденциальности' : 'Құпиялық саясаты'}</Link></p>
    {error && <p role="alert" className="uni-error">{error}</p>}
    <Button type="submit" loading={busy}>{ru ? 'Отправить заявку' : 'Өтінім жіберу'}</Button>
  </form>;
}

function MembershipRequest({ row, ru, onDecided }) {
  const [image, setImage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { if (image) URL.revokeObjectURL(image); }, [image]);
  const view = async () => {
    setBusy(true); setError('');
    try { const blob = await api.studentCard(row.id); setImage(URL.createObjectURL(blob)); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <article className="uni-request"><strong>{row.fullName}</strong><p>{row.phone} · ID {row.userId} · {new Date(row.createdAt).toLocaleDateString(ru ? 'ru-RU' : 'kk-KZ')}</p>
    {row.hasStudentCard && <Button size="sm" variant="secondary" disabled={busy} onClick={view}>{ru ? 'Посмотреть студбилет' : 'Студенттік билетті көру'}</Button>}
    {image && <><img src={image} alt={ru ? 'Студенческий билет заявителя' : 'Өтінім берушінің студенттік билеті'} /><Button size="sm" variant="ghost" onClick={() => setImage('')}>{ru ? 'Скрыть студбилет' : 'Билетті жасыру'}</Button></>}
    {row.status === 'pending' ? <><Button onClick={() => setReviewOpen(true)}>{ru ? 'Рассмотреть заявку' : 'Өтінімді қарау'}</Button>{reviewOpen && <ReviewDialog kind="university_membership" sourceId={row.id} onClose={() => setReviewOpen(false)} onDecision={async (status, body) => { await api.decideUniversityMembership(row.id, { status, ...body }); onDecided(); }} />}</> : <p>{row.status === 'approved' ? (ru ? 'Одобрено' : 'Мақұлданды') : (ru ? 'Отклонено' : 'Қабылданбады')}{row.verificationMethod === 'microsoft' && ' · Microsoft'}{row.rejectionReason && ` · ${row.rejectionReason}`}</p>}
    {error && <p className="uni-error" role="alert">{error}</p>}
  </article>;
}

export default function University() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ru = useLang() === 'ru';
  const [params] = useSearchParams();
  const token = useSessionStore((s) => s.token);
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const isAdmin = useSessionStore((s) => s.isAdmin());
  const role = useSessionStore((s) => s.role);
  const regs = useGatheringStore((s) => s.regs);
  const [data, setData] = useState(null);
  const [requests, setRequests] = useState([]);
  const [state, setState] = useState('loading');
  const [requestsState, setRequestsState] = useState('loading');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [microsoftBusy, setMicrosoftBusy] = useState(false);
  const [error, setError] = useState('');
  const canManage = data?.university?.canManage;
  useEffect(() => {
    let alive = true; setState('loading');
    api.university(id).then((r) => { if (alive) { setData(r); setState('ready'); } }, () => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [id, token, retry]);
  useEffect(() => {
    if (!canManage) { setRequests([]); return undefined; }
    let alive = true; setRequestsState('loading');
    api.universityMemberships(id).then((r) => { if (alive) { setRequests(r.memberships); setRequestsState('ready'); } }, () => { if (alive) setRequestsState('error'); });
    return () => { alive = false; };
  }, [id, token, canManage, retry]);
  const reload = () => setRetry((n) => n + 1);
  const microsoft = async () => {
    if (microsoftBusy) return; setMicrosoftBusy(true); setError('');
    try { const { authorizationUrl } = await api.universityMicrosoftStart(id); window.location.assign(authorizationUrl); }
    catch (err) { setError(err.message); setMicrosoftBusy(false); }
  };
  const u = data?.university;
  const status = u?.membership?.status;
  const microsoftResult = params.get('microsoft');
  return <Container style={{ paddingTop: 26, paddingBottom: 56 }}><div className="uni-flow">
    <Link to="/universities">← {ru ? 'Все университеты' : 'Барлық университеттер'}</Link>
    {state === 'loading' && <p role="status">{ru ? 'Загружаем университет…' : 'Университет жүктелуде…'}</p>}
    {state === 'error' && <div className="uni-panel" role="alert"><p>{ru ? 'Университет не найден или временно недоступен.' : 'Университет табылмады немесе уақытша қолжетімсіз.'}</p><Button onClick={reload}>{ru ? 'Повторить' : 'Қайталау'}</Button></div>}
    {state === 'ready' && u && <>
      <section className="uni-hero"><span className="uni-eyebrow">ERIK CAMPUS · {u.city}</span><h1>{ru ? u.name : u.nameKz}</h1><p>{u.about || (ru ? 'Волонтёрское сообщество студентов. Помогай рядом с теми, с кем учишься.' : 'Студенттердің еріктілер қауымдастығы. Бірге оқитындармен бірге көмектес.')}</p>
        {u.website && <p style={{ marginTop: 16 }}><a href={u.website} target="_blank" rel="noreferrer">{ru ? 'Сайт университета ↗' : 'Университет сайты ↗'}</a></p>}
      </section>
      {microsoftResult && <div className="uni-panel" role="status"><p className={microsoftResult === 'success' ? 'uni-success' : 'uni-error'}>{microsoftResult === 'success' ? (ru ? 'Принадлежность к университету подтверждена через Microsoft.' : 'Университетке қатыстылық Microsoft арқылы расталды.') : (ru ? 'Не удалось подтвердить аккаунт. Используй корпоративную почту этого университета и повтори вход. Если аккаунт уже связан с профилем erik, войди в тот профиль.' : 'Аккаунт расталмады. Осы университеттің корпоративтік поштасымен қайталаңыз. Аккаунт erik профилімен байланысқан болса, сол профильге кіріңіз.')}</p></div>}
      {isAdmin && <Button variant="secondary" onClick={() => setEditing(!editing)}>{ru ? 'Настройки университета' : 'Университет баптаулары'}</Button>}
      {editing && <UniversityEditor key={u.id} university={u} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {canManage && ['coord', 'org'].includes(role) && <div className="uni-actions"><Button onClick={() => navigate(`/new?universityId=${u.id}`)}>{ru ? 'Создать мероприятие вуза' : 'ЖОО іс-шарасын құру'}</Button></div>}
      {status === 'approved' && <div className="uni-panel"><h2>{ru ? 'Ты в сообществе ✓' : 'Сен қауымдастықтасың ✓'}</h2><p>{ru ? 'Выбирай мероприятие и записывайся. Участие, явка и часы будут в твоём обычном профиле.' : 'Іс-шараны таңдап, жазыл. Қатысу, келу және сағаттар өз профиліңде сақталады.'}</p></div>}
      {status === 'pending' && <div className="uni-panel" role="status"><h2>{ru ? 'Заявка на проверке' : 'Өтінім тексерілуде'}</h2><p>{ru ? 'Координатор проверит студбилет. О решении сообщим в уведомлениях.' : 'Үйлестіруші студенттік билетті тексереді. Шешім туралы хабарлама жібереміз.'}</p><Button variant="ghost" onClick={reload}>{ru ? 'Проверить статус' : 'Күйін тексеру'}</Button></div>}
      {status === 'rejected' && <div className="uni-panel" role="alert"><h2>{ru ? 'Заявка отклонена' : 'Өтінім қабылданбады'}</h2><p>{u.membership.rejectionReason}</p><p>{ru ? 'Исправь данные и отправь заявку повторно.' : 'Деректерді түзетіп, өтінімді қайта жібер.'}</p></div>}
      {status !== 'approved' && <>
        {!loggedIn ? <div className="uni-panel"><h2>{ru ? 'Присоединяйся к своему вузу' : 'Өз университетіңе қосыл'}</h2><p>{ru ? 'Войди или создай профиль erik, затем подтверди обучение.' : 'erik профиліне кір немесе тіркел, содан кейін оқуыңды раста.'}</p><Link to={`/login?returnTo=${encodeURIComponent(`/universities/${u.id}`)}`}>{ru ? 'Войти / зарегистрироваться →' : 'Кіру / тіркелу →'}</Link></div> : <>
          {u.microsoftEnabled && <section className="uni-panel uni-form"><h2>{ru ? 'Подтверди обучение через Microsoft' : 'Оқуыңды Microsoft арқылы раста'}</h2><p>{ru ? 'Используй корпоративный аккаунт университета. После успешной проверки доступ откроется автоматически.' : 'Университеттің корпоративтік аккаунтын қолдан. Тексеруден кейін қолжетімділік автоматты түрде ашылады.'}</p><Button variant="secondary" loading={microsoftBusy} onClick={microsoft}>{ru ? 'Продолжить с Microsoft' : 'Microsoft арқылы жалғастыру'}</Button>{error && <p className="uni-error" role="alert">{error}</p>}</section>}
          {status !== 'pending' && <JoinForm key={u.id} university={u} onJoined={reload} ru={ru} />}
        </>}
      </>}
      <section><h2>{ru ? 'Мероприятия университета' : 'Университет іс-шаралары'}</h2><p className="uni-muted" style={{ marginBottom: 18 }}>{ru ? 'Для записи нужно подтверждённое участие в сообществе вуза.' : 'Жазылу үшін ЖОО қауымдастығына мүшелік расталуы керек.'}</p>
        {!data.events.length ? <div className="uni-panel"><p>{ru ? 'Пока нет опубликованных мероприятий. Здесь появятся новые инициативы университета.' : 'Әзірге жарияланған іс-шаралар жоқ. Университеттің жаңа бастамалары осы жерде пайда болады.'}</p></div> : <div className="uni-grid">{data.events.map((event) => <EventCard key={event.id} event={event} reg={regs[`e${event.id}`]} onOpen={() => navigate(`/e/${event.id}`)} />)}</div>}
      </section>
      {canManage && <section className="uni-panel"><h2>{ru ? 'Заявки студентов' : 'Студенттердің өтінімдері'}</h2><p>{ru ? 'Студбилеты и телефоны доступны только назначенному координатору и администрации.' : 'Студенттік билеттер мен телефондар тек тағайындалған үйлестірушіге және әкімшілікке қолжетімді.'}</p>
        {requestsState === 'loading' && <p role="status">{ru ? 'Загружаем заявки…' : 'Өтінімдер жүктелуде…'}</p>}
        {requestsState === 'error' && <div role="alert"><p>{ru ? 'Не удалось загрузить заявки' : 'Өтінімдер жүктелмеді'}</p><Button onClick={reload}>{ru ? 'Повторить' : 'Қайталау'}</Button></div>}
        {requestsState === 'ready' && (!requests.length ? <p>{ru ? 'Заявок пока нет.' : 'Әзірге өтінім жоқ.'}</p> : [...requests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).map((row) => <MembershipRequest key={`${row.id}-${row.createdAt}`} row={row} ru={ru} onDecided={reload} />))}
      </section>}
    </>}
  </div></Container>;
}

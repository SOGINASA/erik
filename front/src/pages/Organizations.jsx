import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLang } from '../i18n';
import { useSessionStore } from '../store/useSessionStore';
import { Container } from '../components/Container';
import { Field } from '../components/ui/controls';
import Button from '../components/ui/Button';
import '../components/Organizations.css';

export default function Organizations() {
  const ru = useLang() === 'ru';
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const [orgs, setOrgs] = useState([]);
  const [state, setState] = useState('loading');
  const [q, setQ] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true; setState('loading');
    api.getOrgs().then(({ orgs: rows }) => { if (alive) { setOrgs(rows); setState('ready'); } }, () => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [retry]);
  const filtered = orgs.filter((o) => `${o.name} ${o.city || ''} ${o.bin || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <Container style={{ paddingTop: 24, paddingBottom: 56 }}>
    <div className="nko-flow">
      <section className="nko-panel nko-intro">
        <span className="nko-eyebrow">{ru ? 'Сообщество erik' : 'erik қауымдастығы'}</span>
        <h1>{ru ? 'НКО, которым можно помогать' : 'Көмектесуге болатын КЕҰ'}</h1>
        <p>{ru ? 'Знакомьтесь с организациями, смотрите их события, команду и отзывы. Здесь опубликованы НКО, одобренные администрацией платформы.' : 'Ұйымдармен танысып, іс-шараларын, командасын және пікірлерін көріңіз. Мұнда платформа әкімшілігі мақұлдаған КЕҰ жарияланған.'}</p>
        <Link className="community-link" to={loggedIn ? '/manage/org' : '/login?returnTo=%2Fmanage%2Forg'}>{ru ? 'Представляете НКО? Подать заявку / открыть кабинет →' : 'КЕҰ өкілісіз бе? Өтінім беру / кабинетті ашу →'}</Link>
      </section>
      <Field label={ru ? 'Найти организацию' : 'Ұйымды табу'} placeholder={ru ? 'Название, город или БИН' : 'Атауы, қаласы немесе БСН'} type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      {state === 'loading' && <p role="status">{ru ? 'Загружаем организации…' : 'Ұйымдар жүктелуде…'}</p>}
      {state === 'error' && <div role="alert" className="nko-panel"><p>{ru ? 'Не удалось загрузить организации.' : 'Ұйымдарды жүктеу мүмкін болмады.'}</p><Button onClick={() => setRetry((n) => n + 1)}>{ru ? 'Повторить' : 'Қайталау'}</Button></div>}
      {state === 'ready' && <>
        <p role="status" className="nko-help">{ru ? 'Найдено организаций' : 'Табылған ұйымдар'}: {filtered.length}</p>
        {filtered.length === 0 && <div className="nko-panel"><h2>{ru ? (q ? 'Ничего не найдено' : 'Каталог пока пуст') : (q ? 'Ештеңе табылмады' : 'Каталог әзірге бос')}</h2><p>{ru ? (q ? 'Попробуйте другое название или город.' : 'НКО появятся здесь после проверки заявки.') : (q ? 'Басқа атауды немесе қаланы көріңіз.' : 'КЕҰ өтінім тексерілгеннен кейін осында пайда болады.')}</p></div>}
        <div className="nko-catalog">{filtered.map((org) => <Link className="nko-card" key={org.id} to={`/o/o${org.id}`}>
          {org.photos?.[0] && <img src={org.photos[0]} alt="" loading="lazy" />}
          <div className="nko-card-body"><span className="nko-eyebrow">{ru ? 'Проверена на erik' : 'erik-те тексерілген'}</span><h2>{org.name}</h2><p className="nko-help">{org.city || (ru ? 'Казахстан' : 'Қазақстан')}</p><p className="nko-card-about">{(ru ? org.aboutRu : org.aboutKz) || org.aboutRu}</p><p>{org.events} {ru ? 'событий' : 'іс-шара'} · {org.vol} {ru ? 'волонтёров' : 'волонтёр'}</p><span className="community-link">{ru ? 'Об организации →' : 'Ұйым туралы →'}</span></div>
        </Link>)}</div>
      </>}
    </div>
  </Container>;
}

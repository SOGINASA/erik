import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { useSessionStore } from '../store/useSessionStore';
import Icon from '../components/Icon';
import LegalLinks from '../components/LegalLinks';
import { homeContent } from './homeContent';
import './Home.css';

function Arrow({ diagonal = false }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} /></svg>;
}

function Brand({ label }) {
  return <Link className="eh-brand" to="/" aria-label={label}>erik<span>.</span></Link>;
}

function SectionHeading({ number, label, title, children }) {
  return <div className="eh-section-heading"><p className="eh-eyebrow">{number} <span>/</span> {label}</p><h2>{title}</h2>{children}</div>;
}

function PeopleArt({ name, sizes = '(max-width: 700px) 90vw, 30vw' }) {
  const path = `/assets/landing/${name}`;
  return <img src={`${path}-800.webp`} srcSet={`${path}-400.webp 400w, ${path}-800.webp 800w`} sizes={sizes} alt="" width="1024" height="1024" loading="lazy" decoding="async" />;
}

const stepArt = ['step-discover', 'step-join', 'step-help'];

// Styles and copy are scoped to the landing; application screens keep their UI.
export default function Home() {
  const isRu = useLang() === 'ru';
  const c = homeContent[isRu ? 'ru' : 'kz'];
  const setLang = useSessionStore((s) => s.setLang);
  const loggedIn = useSessionStore((s) => s.loggedIn);
  const cities = usePlatformStore((s) => s.cities);
  const setFeedFilter = usePlatformStore((s) => s.setFeedFilter);
  const [menuOpen, setMenuOpen] = useState(false);
  const browse = (theme = 'all', city = 'all') => setFeedFilter({ fTheme: theme, fCity: city, fFormat: 'all' });

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="erik-home" lang={isRu ? 'ru' : 'kk'} id="top">
      <a className="eh-skip" href="#home-main">{c.skip}</a>
      <header className="eh-header"><div className="eh-container eh-header-inner">
        <Brand label={c.home} />
        <nav className={`eh-nav${menuOpen ? ' is-open' : ''}`} id="home-navigation" aria-label={c.navigation}>
          {c.nav.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{label}</a>)}
          {!loggedIn && <Link className="eh-mobile-login" to="/login">{c.login}</Link>}
        </nav>
        <div className="eh-header-actions">
          <div className="eh-language" role="group" aria-label={c.language}><button type="button" aria-pressed={isRu} onClick={() => setLang('ru')}>RU</button><span aria-hidden="true">/</span><button type="button" aria-pressed={!isRu} onClick={() => setLang('kz')}>KZ</button></div>
          <Link className="eh-header-login" to={loggedIn ? '/feed' : '/login'}>{loggedIn ? c.openApp : c.login}<Arrow /></Link>
          <button className="eh-menu-toggle" type="button" aria-label={menuOpen ? c.closeMenu : c.openMenu} aria-expanded={menuOpen} aria-controls="home-navigation" onClick={() => setMenuOpen((open) => !open)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={menuOpen ? 'm6 6 12 12M6 18 18 6' : 'M4 8h16M4 16h16'} /></svg></button>
        </div>
      </div></header>

      <main id="home-main">
        <section className="eh-hero" aria-labelledby="hero-title"><div className="eh-container eh-hero-inner">
          <div className="eh-hero-art" aria-hidden="true"><img src="/assets/landing/heart-1600.webp" srcSet="/assets/landing/heart-960.webp 960w, /assets/landing/heart-1600.webp 1600w" sizes="(max-width: 700px) 110vw, 78vw" alt="" width="1536" height="1024" fetchPriority="high" /></div>
          <div className="eh-hero-copy">
            <p className="eh-eyebrow eh-hero-eyebrow"><span className="eh-dot" />{c.eyebrow}</p>
            <h1 id="hero-title">{c.heroTitle}<span>{c.heroAccent}</span></h1>
            <p className="eh-hero-description">{c.heroDescription}</p>
            <div className="eh-hero-actions"><Link className="eh-button" to="/feed" onClick={() => browse()}>{c.find}<Arrow /></Link><a className="eh-text-link" href="#how-it-works"><span className="eh-play" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="m6 3 6 5-6 5V3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg></span>{c.howLink}</a></div>
            <p className="eh-hero-note"><Icon name="leaf" size={17} />{c.guestNote}</p>
          </div>
          <div className="eh-hero-footer"><span>ERIK / {c.heroFootLeft}</span><span>{c.heroFootRight}</span><a href="#opportunities" aria-label={c.scroll}><Arrow /></a></div>
        </div></section>

        <div className="eh-container eh-principles">{c.principles.map(([icon, title, text]) => <div className="eh-principle" key={icon}><Icon name={icon} size={27} stroke={1.5} /><div><h2>{title}</h2><p>{text}</p></div></div>)}</div>

        <section className="eh-container eh-section" id="opportunities">
          <div className="eh-heading-row"><SectionHeading number="01" label={c.opportunitiesLabel} title={c.opportunitiesTitle}><p>{c.opportunitiesDescription}</p></SectionHeading><Link className="eh-text-link" to="/feed" onClick={() => browse()}>{c.allDirections}<Arrow /></Link></div>
          <div className="eh-directions">{c.directions.map((direction) => <Link to="/feed" className="eh-direction" key={direction.theme} onClick={() => browse(direction.theme)}><div className="eh-direction-image"><img src={direction.image} alt="" width="640" height="480" loading="lazy" /><span className="eh-direction-tag">{direction.tag}</span></div><div className="eh-direction-text"><div><h3>{direction.title}</h3><p>{direction.description}</p></div><span className="eh-round-arrow"><Arrow diagonal /></span></div></Link>)}</div>
        </section>

        <section className="eh-container eh-section eh-how" id="how-it-works">
          <SectionHeading number="02" label={c.howLabel} title={c.howTitle} />
          {/* Keep list semantics in Safari when list markers are hidden. */}
          {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
          <ol className="eh-steps" role="list">
            {c.steps.map(([title, text], i) => <li className="eh-step" key={stepArt[i]}>
              <div className="eh-step-visual"><span className="eh-step-number" aria-hidden="true">0{i + 1}</span><PeopleArt name={stepArt[i]} /></div>
              <div className="eh-step-copy"><h3>{title}</h3><p>{text}</p></div>
            </li>)}
          </ol>
        </section>

        <section className="eh-community-band" id="community"><div className="eh-container eh-community">
          <div className="eh-community-photo"><img src="/assets/landing/together-1200.webp" srcSet="/assets/landing/together-720.webp 720w, /assets/landing/together-1200.webp 1200w" sizes="(max-width: 700px) 100vw, 50vw" alt={c.communityAlt} width="1536" height="1024" loading="lazy" /><span className="eh-photo-caption"><Icon name="leaf" size={18} />{c.photoCaption}</span></div>
          <div className="eh-community-copy"><p className="eh-eyebrow">{c.communityLabel}</p><h2>{c.communityTitle}</h2><p className="eh-body-large">{c.communityDescription}</p><Link className="eh-text-link" to={loggedIn ? '/feed' : '/register'}>{loggedIn ? c.openApp : c.join}<Arrow /></Link></div>
        </div></section>

        <section className="eh-container eh-organizers" aria-labelledby="organizers-title">
          <div className="eh-organizers-copy"><p className="eh-eyebrow">{c.organizerLabel}</p><h2 id="organizers-title">{c.organizerTitle}</h2><p>{c.organizerDescription}</p>
            <ul className="eh-organizer-features">{c.organizerFeatures.map(([icon, label]) => <li key={icon}><Icon name={icon} size={17} />{label}</li>)}</ul>
            <Link className="eh-button" to={loggedIn ? '/manage/org' : '/register'}>{c.organizerCta}<Arrow /></Link>
          </div>
          <div className="eh-organizer-art" aria-hidden="true"><PeopleArt name="organize-team" sizes="(max-width: 700px) 90vw, 45vw" /></div>
        </section>

        <section className="eh-container eh-section eh-cities" aria-labelledby="cities-title"><h2 id="cities-title">{c.citiesTitle}</h2><div className="eh-city-list">{cities.map((city) => <Link to="/feed" key={city.id} onClick={() => browse('all', city.id)}><span className="eh-dot" />{isRu ? city.ru : city.kz}<Arrow diagonal /></Link>)}</div><Link className="eh-text-link" to="/map">{c.map}<Arrow /></Link></section>

        <section className="eh-faq-band" id="faq"><div className="eh-container eh-faq"><SectionHeading number="03" label={c.faqLabel} title={c.faqTitle} /><div className="eh-questions">{c.questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true"><Icon name="plus" size={20} /></span></summary><p>{answer}</p></details>)}</div></div></section>

        <section className="eh-container eh-partners" aria-labelledby="partners-title">
          <div className="eh-partners-copy"><p className="eh-eyebrow">{c.partnersLabel}</p><h2 id="partners-title">{c.partnersTitle}</h2><p>{c.partnersDescription}</p></div>
          <div className="eh-partner"><div className="eh-partner-logo"><img className="eh-partner-aitu" src="/assets/partners/aitu-logo.png" alt="" width="600" height="315" loading="lazy" decoding="async" /></div><h3>Astana IT University</h3></div>
          <div className="eh-partner"><div className="eh-partner-logo"><img className="eh-partner-network" src="/assets/partners/national-volunteer-network.jpg" alt="" width="350" height="171" loading="lazy" decoding="async" /></div><h3>{c.volunteerNetwork}</h3></div>
        </section>

        <section className="eh-container eh-final"><h2>{c.finalTitle}<span>{c.finalAccent}</span></h2><Link className="eh-button" to="/feed" onClick={() => browse()}>{c.find}<Arrow /></Link><span className="eh-final-note">{c.guestNote}</span></section>
      </main>

      <footer className="eh-footer"><div className="eh-container"><div className="eh-footer-top"><div><Brand label={c.home} /><p>{c.footerDescription}</p></div><a className="eh-back-top" href="#top">{c.backTop}<span><Arrow /></span></a></div><div className="eh-footer-bottom"><LegalLinks compact /><Link className="eh-credits" to="/project-rights" aria-label={c.credits}>Made by <strong>ITshechka</strong><Arrow diagonal /></Link></div><p className="eh-demo-note">{c.demoNote}</p></div></footer>
    </div>
  );
}

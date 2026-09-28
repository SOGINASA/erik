import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Logo } from '../components/shell/Brand';
import Icon from '../components/Icon';
import LegalLinks from '../components/LegalLinks';
import './Legal.css';

const TITLES = {
  terms: 'Условия использования',
  privacy: 'Политика конфиденциальности',
  consent: 'Согласие на обработку персональных данных',
};

export default function Legal({ documentKey = 'privacy' }) {
  const navigate = useNavigate();
  const [legal, setLegal] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(false);
    setLegal(null);
    api.legal().then((data) => {
      if (active) {
        if (!data?.documents?.[documentKey]?.sections) setError(true);
        else setLegal(data);
      }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [documentKey, attempt]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${TITLES[documentKey]} — erik`;
    return () => { document.title = previousTitle; };
  }, [documentKey]);

  const doc = legal?.documents?.[documentKey];
  const operator = legal?.operator || {};

  return (
    <div className="legal-page" lang="ru">
      <a className="legal-skip" href="#legal-content">Перейти к документу</a>
      <header className="legal-header">
        <div className="legal-header-inner">
          <Logo size={24} onClick={() => navigate('/')} />
          <Link to="/" className="legal-home"><Icon name="back" size={18} /> На главную</Link>
        </div>
      </header>
      <main className="legal-main" id="legal-content">
        <div className="legal-eyebrow">Правовые документы · Республика Казахстан</div>
        <h1>{TITLES[documentKey]}</h1>
        {error ? (
          <div className="legal-notice" role="alert">
            <h2>Не удалось загрузить документ</h2>
            <p>Проверьте соединение и попробуйте ещё раз. Перед регистрацией важно прочитать актуальную редакцию.</p>
            <button type="button" className="legal-action" onClick={() => setAttempt((value) => value + 1)}>Попробовать снова</button>
          </div>
        ) : !doc ? <p role="status">Загружаем актуальную редакцию…</p> : (
          <>
            <p className="legal-lead">{doc.summary}</p>
            <div className="legal-meta">
              <span>Редакция от <time dateTime={legal.publishedAt}>{new Date(`${legal.publishedAt}T00:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })}</time></span>
              <span className="legal-version">Версия {legal.version}</span>
              <button type="button" className="legal-print" onClick={() => window.print()}>Сохранить / распечатать</button>
            </div>
            <LegalLinks />
            {!legal.registrationAvailable && (
              <aside className="legal-notice" role="status">
                <strong>Регистрация пока недоступна</strong>
                <p>Сведения об операторе и условиях обработки ещё не опубликованы полностью. Документы доступны для ознакомления; подтверждение регистрации станет доступно после их заполнения.</p>
              </aside>
            )}
            <section className="legal-operator" aria-labelledby="legal-operator-title">
              <h2 id="legal-operator-title">Оператор и обращения</h2>
              <dl>
                <div><dt>Наименование / ФИО</dt><dd>{operator.name || 'Не опубликовано'}</dd></div>
                <div><dt>БИН / ИИН</dt><dd>{operator.bin || 'Не опубликован'}</dd></div>
                <div><dt>Адрес для обращений</dt><dd>{operator.address || 'Не опубликован'}</dd></div>
                <div><dt>Персональные данные и поддержка</dt><dd>{operator.email ? <a href={`mailto:${operator.email}`}>{operator.email}</a> : 'Email ещё не опубликован'}</dd></div>
                <div><dt>Размещение базы по сведениям оператора</dt><dd>{legal.storageCountry === 'KZ' ? 'Республика Казахстан' : 'Не подтверждено'}</dd></div>
                <div><dt>Инфраструктура и получатели данных</dt><dd className="legal-processors">{legal.processors || 'Сведения ещё не опубликованы'}</dd></div>
              </dl>
              <p className="legal-small">Для обращения укажите аккаунт и суть требования. Не отправляйте пароль. Реквизиты и сведения выше — часть этой редакции документа.</p>
            </section>
            <div className="legal-layout">
              <nav className="legal-toc" aria-label="Содержание документа">
                <h2>Содержание</h2>
                <ol>{doc.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.title.replace(/^\d+\.\s*/, '')}</a></li>)}</ol>
              </nav>
              <article className="legal-article" aria-label={doc.title}>
                {doc.sections.map((section) => (
                  <section id={section.id} key={section.id}>
                    <h2>{section.title}</h2>
                    {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                    {section.items?.length > 0 && <ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
                  </section>
                ))}
                <section className="legal-sources" aria-labelledby="legal-sources-title">
                  <h2 id="legal-sources-title">Правовая основа и обращения</h2>
                  <p>Официальные тексты актов и государственный сервис обращений. При изменении закона применяются его обязательные положения.</p>
                  <ul>{legal.sources?.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span className="legal-new-tab"> ↗</span></a></li>)}</ul>
                </section>
              </article>
            </div>
          </>
        )}
      </main>
      <footer className="legal-footer"><LegalLinks /><Link to="/project-rights">Авторы и права на проект</Link><span>© erik · 2026</span></footer>
    </div>
  );
}

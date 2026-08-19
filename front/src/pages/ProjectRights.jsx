import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/shell/Brand';
import Icon from '../components/Icon';

const AUTHORS = [
  {
    name: 'Пинигин Артём Александрович',
    phone: '+7 705 610 1182',
    phoneHref: 'tel:+77056101182',
    telegram: '@ArtemSogi',
    telegramHref: 'https://t.me/ArtemSogi',
  },
  {
    name: 'Жумабек Алихан Азаматович',
    phone: '+7 705 132 9557',
    phoneHref: 'tel:+77051329557',
    telegram: '@Gaklelk',
    telegramHref: 'https://t.me/Gaklelk',
  },
  {
    name: 'Ефремов Иван Александрович',
    phone: '+7 776 122 9953',
    phoneHref: 'tel:+77761229953',
    telegram: '@Vanek3222',
    telegramHref: 'https://t.me/Vanek3222',
  },
];

const SOURCES = [
  {
    title: 'Закон РК «Об авторском праве и смежных правах»',
    text: 'Статьи 6, 7, 9, 10, 16, 48 и 49: охраняемые произведения, программное обеспечение, возникновение прав, соавторство, исключительные права и способы судебной защиты.',
    href: 'https://adilet.zan.kz/rus/docs/Z960000006_',
  },
  {
    title: 'Гражданский кодекс РК (Особенная часть)',
    text: 'Статьи 961–964, 970–972: объекты интеллектуальной собственности, права авторов, исключительные права и их защита.',
    href: 'https://adilet.zan.kz/rus/docs/K990000409_',
  },
  {
    title: 'Уголовный кодекс РК',
    text: 'Статья 198: ответственность за незаконное использование объектов авторского права, контрафакт, присвоение авторства и принуждение к соавторству.',
    href: 'https://adilet.zan.kz/rus/docs/K1400000226',
  },
];

function ContactLink({ href, children, external = false }) {
  return (
    <a
      className="rights-contact"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      {children}
      {external && <Icon name="external" size={15} />}
    </a>
  );
}

export default function ProjectRights() {
  const navigate = useNavigate();

  return (
    <div className="rights-page">
      <header className="rights-header">
        <div className="rights-header-inner">
          <Logo size={24} onClick={() => navigate('/')} />
          <button type="button" className="rights-back erik-btn" onClick={() => navigate('/')}>
            <Icon name="back" size={18} />
            На главную
          </button>
        </div>
      </header>

      <main className="rights-main">
        <section className="rights-hero">
          <div className="rights-eyebrow">О проекте · ITshechka team</div>
          <h1>Авторы и права на проект</h1>
          <p className="rights-lead">
            Проект erik создан командой ITshechka в рамках хакатона Tech Vision 2026
            и продолжает развиваться после его завершения.
          </p>
          <div className="rights-notice">
            <span className="rights-copyright">©</span>
            <div>
              <strong>Все права защищены</strong>
              <p>© 2026 ITshechka team. Использование охраняемых материалов — только с письменного согласия правообладателей.</p>
            </div>
          </div>
        </section>

        <section className="rights-section" aria-labelledby="authors-title">
          <div className="rights-section-heading">
            <span>01</span>
            <div>
              <h2 id="authors-title">Авторы проекта</h2>
              <p>Авторами и правообладателями проекта заявлены участники команды, перечисленные ниже.</p>
            </div>
          </div>
          <div className="rights-authors">
            {AUTHORS.map((author, index) => (
              <article className="rights-author" key={author.name}>
                <div className="rights-author-index">0{index + 1}</div>
                <h3>{author.name}</h3>
                <div className="rights-author-contacts">
                  <ContactLink href={author.phoneHref}>
                    <Icon name="phone" size={16} /> {author.phone}
                  </ContactLink>
                  {author.telegram && (
                    <ContactLink href={author.telegramHref} external>
                      {author.telegram}
                    </ContactLink>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="rights-fineprint">
            Исключительные права на совместно созданные охраняемые элементы проекта принадлежат
            указанным соавторам совместно. Если письменным соглашением между авторами или иным
            договором установлено другое распределение прав, применяется такое соглашение;
            самостоятельные части используются с учётом личного творческого вклада каждого автора.
          </p>
        </section>

        <section className="rights-section" aria-labelledby="protected-title">
          <div className="rights-section-heading">
            <span>02</span>
            <div>
              <h2 id="protected-title">Что именно охраняется</h2>
              <p>Правовая охрана относится к конкретной форме реализации проекта.</p>
            </div>
          </div>
          <div className="rights-grid">
            <div className="rights-card">
              <h3>Материалы проекта</h3>
              <ul>
                <li>исходный и объектный программный код;</li>
                <li>архитектура, оригинальные программные модули и документация;</li>
                <li>дизайн интерфейса, графика, иллюстрации и тексты;</li>
                <li>оригинальный подбор и расположение материалов и данных;</li>
                <li>презентации, прототипы и иные творческие результаты команды.</li>
              </ul>
            </div>
            <div className="rights-card rights-card-warm">
              <h3>Без разрешения нельзя</h3>
              <ul>
                <li>копировать, перерабатывать или распространять охраняемые материалы;</li>
                <li>публиковать, продавать, лицензировать или иным образом использовать их;</li>
                <li>выдавать работу команды за свою или навязывать соавторство;</li>
                <li>удалять или изменять сведения об авторах и правообладателях.</li>
              </ul>
            </div>
          </div>
          <div className="rights-idea-note">
            <Icon name="shield" size={24} />
            <div>
              <h3>Важное уточнение об идее</h3>
              <p>
                По пункту 4 статьи 6 Закона РК авторское право не распространяется на идеи,
                концепции, принципы, методы, системы, процессы, открытия и факты как таковые.
                Поэтому запрет относится не к абстрактной идее волонтёрской платформы, а к
                копированию конкретной реализации erik. Независимая реализация общей идеи без
                заимствования охраняемых элементов сама по себе не является нарушением авторского права.
              </p>
            </div>
          </div>
        </section>

        <section className="rights-section" aria-labelledby="law-title">
          <div className="rights-section-heading">
            <span>03</span>
            <div>
              <h2 id="law-title">Правовая основа в Казахстане</h2>
              <p>Права возникают с момента создания произведения — регистрация для этого не обязательна.</p>
            </div>
          </div>
          <div className="rights-sources">
            {SOURCES.map((source) => (
              <a className="rights-source erik-lift" href={source.href} target="_blank" rel="noreferrer" key={source.title}>
                <div>
                  <h3>{source.title}</h3>
                  <p>{source.text}</p>
                </div>
                <Icon name="external" size={19} />
              </a>
            ))}
          </div>
        </section>

        <section className="rights-consequences" aria-labelledby="consequences-title">
          <div className="rights-eyebrow rights-eyebrow-light">Ответственность</div>
          <h2 id="consequences-title">Нарушение прав может повлечь судебные требования и наказание</h2>
          <p>
            Правообладатели могут потребовать признания прав, прекращения нарушения,
            восстановления положения, возмещения убытков и упущенной выгоды, взыскания дохода
            нарушителя либо установленной судом компенсации от 100 до 15 000 МРП — в случаях
            и порядке, предусмотренных статьёй 49 Закона РК.
          </p>
          <p>
            При наличии состава уголовного правонарушения статья 198 УК РК предусматривает
            штраф, исправительные или общественные работы, а при отягчающих обстоятельствах —
            ограничение либо лишение свободы; максимальная санкция по статье может достигать
            шести лет. Вид и размер ответственности определяются только компетентным органом
            или судом с учётом обстоятельств конкретного дела.
          </p>
        </section>

        <section className="rights-disclaimer">
          <h2>Юридический статус уведомления</h2>
          <p>
            Эта страница является публичным уведомлением об авторстве и заявляемой принадлежности
            прав. Она не заменяет соглашение между соавторами, договор об отчуждении исключительных
            прав, лицензионный договор, регистрацию товарного знака или депонирование материалов.
            Для коммерческого использования проекта, передачи прав или ведения спора рекомендуется
            оформить отдельное письменное соглашение и получить консультацию специалиста по праву РК.
          </p>
          <div className="rights-updated">Правовая информация проверена по действующим редакциям официальной ИПС «Әділет» · 20 августа 2026 года</div>
        </section>
      </main>
    </div>
  );
}

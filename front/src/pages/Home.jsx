import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { Logo, LangToggle } from '../components/shell/Brand';
import Button from '../components/ui/Button';
// деплой
const F = (isRu, ru, kz, sru, skz) => ({ title: isRu ? ru : kz, sub: isRu ? sru : skz });

// Маркетинговый лендинг — точка входа «/». Standalone, без шелла.
export default function Home() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const cities = usePlatformStore((s) => s.cities);

  const features = [
    F(isRu, 'Находите своё', 'Өзіңіздікін табыңыз', 'Лента и карта сборов по всему Казахстану — по теме, городу и дате.', 'Бүкіл Қазақстан бойынша жиындар — тақырып, қала, күн бойынша.'),
    F(isRu, 'Прогноз явки', 'Келу болжамы', 'Координатор видит честное число за 24 часа до сбора, а не поток «+» в чате.', 'Үйлестіруші чаттағы «+» ағыны емес, нақты санды 24 сағат бұрын көреді.'),
    F(isRu, 'Часы и бейджи', 'Сағат пен бейдж', 'История участия, подтверждённые часы и достижения — ваш волонтёрский профиль.', 'Қатысу тарихы, расталған сағаттар мен жетістіктер — сіздің профиліңіз.'),
    F(isRu, 'НКО и сообщества', 'ҮЕҰ мен қауымдар', 'Организации ведут волонтёров, события и сбор помощи в одном месте.', 'Ұйымдар волонтёрлерді, іс-шаралар мен көмекті бір жерде жүргізеді.'),
  ];
  const motifs = [['#E8F1EB', '#2F6F4F'], ['#FBF0E2', '#C8842B'], ['#E4EAEE', '#3d5566'], ['#EDE6E8', '#6b4550']];
  const steps = [
    F(isRu, 'Найдите сбор', 'Жиын табыңыз', 'Откройте ленту или карту и выберите, куда прийти.', 'Лента не картаны ашып, қайда баратыныңызды таңдаңыз.'),
    F(isRu, 'Ответьте одним тапом', 'Бір рет жауап беріңіз', 'Приду · Пока не знаю · Не в этот раз. Честно и без стыда.', 'Келемін · Білмеймін · Бұл жолы емес. Шынайы әрі ұялмай.'),
    F(isRu, 'Приходите и растите', 'Келіп, өсіңіз', 'Отмечайтесь, копите часы и бейджи, зовите соседей.', 'Белгіленіп, сағат пен бейдж жинап, көршілерді шақырыңыз.'),
  ];
  const roles = [
    { title: t.roleVol, sub: t.roleVolDesc },
    { title: t.roleCoord, sub: t.roleCoordDesc },
    { title: t.roleOrg, sub: t.roleOrgDesc },
  ];

  const wrap = { width: '100%', maxWidth: 1120, margin: '0 auto', padding: '0 clamp(20px,4vw,40px)' };
  const eyebrow = { fontFamily: 'var(--fm)', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' };
  const h2 = { fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 'clamp(24px,3vw,30px)', letterSpacing: '-.02em', margin: '0 0 22px' };
  const frame = { position: 'relative', width: '100%', borderRadius: 'var(--r-l)', overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--yard-soft)' };
  const img = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

  return (
    <div style={{ minHeight: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(244,245,241,.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <Logo size={24} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LangToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>{t.mLogin}</Button>
            <Button size="sm" onClick={() => navigate('/register')}>{t.mStart}</Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section style={{ ...wrap, padding: 'clamp(40px,7vw,72px) clamp(20px,4vw,40px) 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40, alignItems: 'center' }}>
        <div>
          <div style={{ ...eyebrow, marginBottom: 16 }}>{isRu ? 'Соседская взаимопомощь · Казахстан' : 'Көршілік өзара көмек · Қазақстан'}</div>
          <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 'clamp(34px,5vw,54px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 18px', textWrap: 'balance' }}>{t.mHeroTitle}</h1>
          <p style={{ fontSize: 17, lineHeight: 1.5, color: 'var(--ink-2)', margin: '0 0 28px', maxWidth: 520 }}>{t.mHeroSub}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button size="lg" onClick={() => navigate('/register')}>{t.mStart}</Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/feed')}>{t.mBrowse}</Button>
          </div>
        </div>
        <div style={{ ...frame, aspectRatio: '3 / 2' }}>
          <img src="/assets/hero-yard.png" alt="" loading="lazy" style={img} />
        </div>
      </section>

      {/* features */}
      <section style={{ ...wrap, padding: '24px clamp(20px,4vw,40px) 48px' }}>
        <h2 style={h2}>{t.mValuesTitle}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
          {features.map((f, i) => (
            <div key={i} style={{ padding: 20, borderRadius: 'var(--r-m)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: motifs[i][0], color: motifs[i][1], display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, fontFamily: 'var(--fd)', fontWeight: 700 }}>{i + 1}</div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 17, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.45 }}>{f.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* how */}
      <section style={{ ...wrap, padding: '48px clamp(20px,4vw,40px)', borderTop: '1px solid var(--line)' }}>
        <h2 style={{ ...h2, marginBottom: 28 }}>{t.mHowTitle}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 32 }}>
          {steps.map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 40, letterSpacing: '-.03em', color: 'var(--yard)', lineHeight: 1, marginBottom: 14 }}>0{i + 1}</div>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 19, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.5 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* world */}
      <section style={{ ...wrap, padding: '24px clamp(20px,4vw,40px) 48px' }}>
        <div style={{ ...eyebrow, marginBottom: 16 }}>Мир erik</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div style={{ ...frame, aspectRatio: '3 / 2' }}>
            <img src="/assets/erik-collage.png" alt="Субботник во дворе" loading="lazy" style={img} />
          </div>
          <div style={{ ...frame, aspectRatio: '3 / 2' }}>
            <img src="/assets/help-elder.png" alt="Помощь пожилому соседу" loading="lazy" style={img} />
          </div>
        </div>
      </section>

      {/* roles */}
      <section style={{ width: '100%', maxWidth: 1080, margin: '0 auto', padding: '40px clamp(20px,4vw,40px)' }}>
        <h2 style={{ ...h2, margin: '0 0 4px' }}>{t.mRolesTitle}</h2>
        <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 24px' }}>{t.mRolesSub}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {roles.map((r, i) => (
            <div key={i} style={{ padding: 22, border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 18, marginBottom: 6 }}>{r.title}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>{r.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* cities */}
      <section style={{ ...wrap, padding: '48px clamp(20px,4vw,40px)', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 40, alignItems: 'center' }}>
          <div>
            <div style={{ ...eyebrow, marginBottom: 8 }}>{t.mNavCities}</div>
            <h2 style={{ ...h2, margin: '0 0 4px' }}>{t.mCitiesTitle}</h2>
            <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 20px' }}>{t.mCitiesSub}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {cities.map((c) => (
                <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 14, color: 'var(--ink)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--yard)' }} />
                  {isRu ? c.ru : c.kz} <span style={{ color: 'var(--ink-3)', fontFamily: 'var(--fm)', fontSize: 12 }}>{c.active}</span>
                </span>
              ))}
            </div>
          </div>
          <div style={{ ...frame, aspectRatio: '4 / 3' }}>
            <img src="/assets/map-kz.png" alt="Карта активных городов Казахстана" loading="lazy" style={img} />
          </div>
        </div>
      </section>

      {/* footer cta */}
      <section style={{ width: '100%', maxWidth: 1080, margin: '0 auto', padding: '32px clamp(20px,4vw,40px) 72px' }}>
        <div style={{ borderRadius: 'var(--r-l)', background: 'var(--yard)', color: '#fff', padding: 'clamp(32px,5vw,44px) 32px', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--fd)', fontWeight: 700, fontSize: 32, letterSpacing: '-.02em', margin: '0 0 8px' }}>{t.mFooterTitle}</h2>
          <p style={{ fontSize: 16, opacity: 0.85, margin: '0 0 24px' }}>{t.mFooterSub}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <button type="button" className="erik-press" onClick={() => navigate('/register')} style={{ height: 52, padding: '0 28px', border: 'none', borderRadius: 'var(--r-m)', background: '#fff', color: 'var(--yard)', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--fb)' }}>{t.mStart}</button>
            <button type="button" className="erik-press" onClick={() => navigate('/feed')} style={{ height: 52, padding: '0 24px', border: '1px solid rgba(255,255,255,.35)', borderRadius: 'var(--r-m)', background: 'transparent', color: '#fff', fontWeight: 500, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--fb)' }}>{t.mBrowse}</button>
          </div>
          <div style={{ marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,.7)' }}>{t.mMade}</div>
        </div>
      </section>
    </div>
  );
}

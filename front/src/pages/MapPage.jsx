import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT, useLang } from '../i18n';
import { usePlatformStore } from '../store/usePlatformStore';
import { THEMES } from '../lib/data';
import { cityGeo, nearestCity } from '../lib/geo';
import { useIsDesktop } from '../lib/nav';
import Globe from '../components/Globe';
import Icon from '../components/Icon';

// Карта сборов: интерактивный 3D-глобус + удобный поиск/фильтр мероприятий.
export default function MapPage() {
  const t = useT();
  const isRu = useLang() === 'ru';
  const navigate = useNavigate();
  const desktop = useIsDesktop();

  const cities = usePlatformStore((s) => s.cities);
  const events = usePlatformStore((s) => s.events);
  const orgs = usePlatformStore((s) => s.orgs);

  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('all');
  const [selectedCity, setSelectedCity] = useState(null);
  const [focus, setFocus] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | locating | granted | denied

  // Города с реальными координатами — для глобуса и поиска ближайшего.
  const citiesGeo = useMemo(
    () => cities.map((c) => ({ ...c, ...(cityGeo(c) || {}) })).filter((c) => c.lat != null),
    [cities]
  );
  const markers = useMemo(
    () => citiesGeo.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, active: c.active, name: isRu ? c.ru : c.kz })),
    [citiesGeo, isRu]
  );
  const citiesGeoRef = useRef(citiesGeo);
  citiesGeoRef.current = citiesGeo;

  const cityName = (id) => { const c = cities.find((x) => x.id === id); return c ? (isRu ? c.ru : c.kz) : ''; };
  const orgName = (id) => (orgs.find((o) => o.id === id) || {}).name || '';

  const selectCity = (id, doFocus) => {
    setSelectedCity(id);
    if (doFocus) {
      const c = citiesGeoRef.current.find((x) => x.id === id);
      if (c) setFocus({ lat: c.lat, lng: c.lng, key: Date.now() });
    }
  };

  const requestGeo = () => {
    if (!navigator.geolocation) { setGeoStatus('denied'); return; }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus('granted');
        const near = nearestCity({ lat: pos.coords.latitude, lng: pos.coords.longitude }, citiesGeoRef.current);
        if (near) selectCity(near.city.id, true);
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  };

  // Автозапрос геолокации один раз при входе.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    requestGeo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = events.filter((e) => {
    if (theme !== 'all' && e.theme !== theme) return false;
    if (selectedCity && e.cityId !== selectedCity) return false;
    if (q) {
      const hay = `${isRu ? e.titleRu : e.titleKz} ${cityName(e.cityId)} ${orgName(e.orgId)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const chip = (active, tint, ink) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999,
    border: `1px solid ${active ? (ink || 'var(--ink)') : 'var(--line)'}`, background: active ? (tint || 'var(--ink)') : 'var(--surface)',
    color: active ? (ink || '#fff') : 'var(--ink-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none',
  });

  const geoLine = {
    idle: isRu ? 'Найти сборы рядом со мной' : 'Жақын жердегі жиындарды табу',
    locating: isRu ? 'Определяем местоположение…' : 'Орналасқан жеріңізді анықтаудамыз…',
    granted: selectedCity ? (isRu ? `Ближайший город: ${cityName(selectedCity)}` : `Ең жақын қала: ${cityName(selectedCity)}`) : (isRu ? 'Местоположение определено' : 'Орналасқан жер анықталды'),
    denied: isRu ? 'Геолокация недоступна — выберите город на глобусе' : 'Геолокация қолжетімсіз — глобустан қаланы таңдаңыз',
  }[geoStatus];

  // --- панель поиска ---
  const panel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: desktop ? '24px 20px' : '20px', minHeight: 0 }}>
      <div>
        <h1 style={{ fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 26, letterSpacing: '-.02em', margin: '0 0 2px' }}>{t.mapTitle}</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>
          {isRu ? 'Крутите глобус, выбирайте город и находите сборы рядом' : 'Глобусты айналдырып, қала таңдап, жиын табыңыз'}
        </p>
      </div>

      {/* поиск */}
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }}><Icon name="search" size={18} /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isRu ? 'Поиск: название, город, НКО' : 'Іздеу: атауы, қала, ҮЕҰ'}
          className="erik-input"
          style={{ width: '100%', height: 46, padding: '0 38px 0 38px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', fontSize: 15, outline: 'none' }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Очистить" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', padding: 4 }}><Icon name="close" size={16} /></button>
        )}
      </div>

      {/* геолокация */}
      <button
        type="button"
        className="erik-btn erik-btn-secondary"
        onClick={requestGeo}
        disabled={geoStatus === 'locating'}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', color: geoStatus === 'denied' ? 'var(--maybe)' : 'var(--ink)', cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left' }}
      >
        <span style={{ color: geoStatus === 'granted' ? 'var(--yard)' : geoStatus === 'denied' ? 'var(--maybe)' : 'var(--ink-2)', flex: 'none', display: 'flex' }}>
          <Icon name="pin" size={18} />
        </span>
        <span style={{ flex: 1 }}>{geoLine}</span>
        {geoStatus === 'locating' && <span style={{ width: 14, height: 14, border: '2px solid var(--line)', borderTopColor: 'var(--yard)', borderRadius: 999, animation: 'erik-spin .7s linear infinite', flex: 'none' }} />}
      </button>

      {/* темы */}
      <div className="erik-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, margin: '-2px 0' }}>
        <button className="erik-btn" style={chip(theme === 'all')} onClick={() => setTheme('all')}>{isRu ? 'Все темы' : 'Барлық тақырып'}</button>
        {Object.keys(THEMES).map((k) => (
          <button key={k} className="erik-btn" style={chip(theme === k, THEMES[k].tint, THEMES[k].ink)} onClick={() => setTheme(k)}>{isRu ? THEMES[k].ru : THEMES[k].kz}</button>
        ))}
      </div>

      {/* заголовок списка + выбранный город */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{filtered.length}</b> {isRu ? 'сборов' : 'жиын'}
          {selectedCity ? ` · ${cityName(selectedCity)}` : ''}
        </span>
        {selectedCity && (
          <button type="button" onClick={() => setSelectedCity(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 8px 0 10px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12, cursor: 'pointer' }}>
            {isRu ? 'все города' : 'барлық қала'} <Icon name="close" size={13} />
          </button>
        )}
      </div>

      {/* список сборов */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: desktop ? 'auto' : 'visible', flex: desktop ? 1 : 'none', minHeight: 0 }} className="erik-scroll">
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 8px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            {isRu ? 'Ничего не нашлось. Смените город или тему.' : 'Ештеңе табылмады. Қаланы не тақырыпты өзгертіңіз.'}
          </div>
        ) : (
          filtered.map((e) => {
            const T = THEMES[e.theme] || { tint: 'var(--line)', ink: 'var(--ink)' };
            return (
              <button
                key={e.id}
                type="button"
                className="erik-row-hover"
                onClick={() => navigate(`/e/${e.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: T.ink, flex: 'none' }} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--fd)', fontWeight: 600, fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isRu ? e.titleRu : e.titleKz}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orgName(e.orgId)} · {cityName(e.cityId)} · {isRu ? e.dateRu : e.dateKz}</span>
                </span>
                <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--ink-2)', flex: 'none' }}>{e.going}/{e.needed}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // --- сцена глобуса ---
  const stage = (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'radial-gradient(circle at 50% 42%, #12211a 0%, #0a0f0d 72%)' }}>
      <Globe markers={markers} selectedId={selectedCity} onSelect={(id) => selectCity(id, false)} focus={focus} />
      {/* подсказка */}
      <div style={{ position: 'absolute', left: 16, bottom: 16, color: 'rgba(234,255,244,.65)', fontSize: 12, fontFamily: 'var(--fb)', pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="map" size={14} /> {isRu ? 'Крутите глобус · клик по городу' : 'Глобусты айналдырыңыз · қалаға басыңыз'}
      </div>
      {/* моё местоположение поверх глобуса */}
      <button
        type="button"
        onClick={requestGeo}
        aria-label={isRu ? 'Моё местоположение' : 'Менің орналасуым'}
        title={isRu ? 'Моё местоположение' : 'Менің орналасуым'}
        style={{ position: 'absolute', right: 16, bottom: 16, width: 44, height: 44, borderRadius: 999, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(10,18,15,.6)', color: geoStatus === 'granted' ? '#8ff0bd' : '#eafff4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
      >
        <Icon name="pin" size={20} />
      </button>
    </div>
  );

  if (desktop) {
    return (
      <div style={{ display: 'flex', height: '100dvh', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
        <div className="erik-scroll" style={{ width: 380, flex: 'none', height: '100dvh', overflowY: 'auto', borderRight: '1px solid var(--line)', background: 'var(--paper)' }}>{panel}</div>
        <div style={{ flex: 1, minWidth: 0 }}>{stage}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', animation: 'erik-fade var(--t-base) var(--ease-out)' }}>
      <div style={{ height: '46vh', minHeight: 300, flex: 'none' }}>{stage}</div>
      <div>{panel}</div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import Globe from 'globe.gl';
import { KZ_CENTER } from '../lib/geo';

// Локальные текстуры Земли (лежат в public/assets — работают и офлайн).
const EARTH = '/assets/earth-blue-marble.jpg';
const BUMP = '/assets/earth-topology.png';

// Интерактивный 3D-глобус на globe.gl. Метки городов — HTML-элементы
// (шрифт страницы, чтобы корректно рендерилась кириллица; WebGL-спрайты её ломают).
// Пропсы: markers=[{id,lat,lng,active,name}], selectedId, onSelect(id), focus={lat,lng,key}.
export default function GlobeView({ markers = [], selectedId = null, onSelect, focus }) {
  const mountRef = useRef(null);
  const gRef = useRef(null);
  const elsRef = useRef(new Map()); // id -> { d, wrap }
  const selRef = useRef(selectedId);
  const onSelRef = useRef(onSelect);
  const markersRef = useRef(markers);
  selRef.current = selectedId;
  onSelRef.current = onSelect;
  markersRef.current = markers;

  useEffect(() => {
    const el = mountRef.current;

    const styleWrap = (d, wrap) => {
      const sel = d.id === selRef.current;
      const size = 9 + Math.min(11, (d.active || 0) * 0.35);
      const dot = wrap.querySelector('.gdot');
      dot.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${sel ? '#c9ffe2' : '#63d69b'};box-shadow:0 0 ${sel ? 18 : 9}px ${sel ? '#8ff0bd' : '#3fae74'},0 0 2px #fff;border:1.5px solid rgba(255,255,255,.55)`;
      const lab = wrap.querySelector('.glabel');
      lab.textContent = `${d.name} · ${d.active}`;
      lab.style.cssText = `white-space:nowrap;font-family:var(--fb);font-weight:${sel ? 700 : 600};font-size:${sel ? 13 : 12}px;padding:2px 8px;border-radius:999px;background:${sel ? 'rgba(47,111,79,.96)' : 'rgba(10,18,15,.72)'};color:${sel ? '#fff' : '#eafff4'};box-shadow:0 1px 6px rgba(0,0,0,.45);backdrop-filter:blur(3px)`;
    };

    const makeEl = (d) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;pointer-events:auto;will-change:transform';
      wrap.innerHTML = '<span class="gdot"></span><span class="glabel"></span>';
      wrap.addEventListener('click', (e) => { e.stopPropagation(); if (onSelRef.current) onSelRef.current(d.id); });
      styleWrap(d, wrap);
      elsRef.current.set(d.id, { d, wrap });
      return wrap;
    };

    const world = Globe()(el)
      .width(el.clientWidth || 600)
      .height(el.clientHeight || 480)
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl(EARTH)
      .bumpImageUrl(BUMP)
      .showAtmosphere(true)
      .atmosphereColor('#7fe6ad')
      .atmosphereAltitude(0.16)
      .htmlLat((d) => d.lat)
      .htmlLng((d) => d.lng)
      .htmlAltitude(0.008)
      .htmlElement(makeEl)
      .htmlElementsData(markers);

    if (typeof world.htmlElementVisibilityModifier === 'function') {
      world.htmlElementVisibilityModifier((elm, isVisible) => {
        elm.style.opacity = isVisible ? '1' : '0';
        elm.style.pointerEvents = isVisible ? 'auto' : 'none';
      });
    }

    // стартовый кадр — Казахстан, видно и окружающую сушу
    world.pointOfView({ lat: KZ_CENTER.lat, lng: KZ_CENTER.lng, altitude: 2.05 }, 0);
    el.style.cursor = 'grab';

    const controls = world.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.enablePan = false;
    controls.minDistance = 180;
    controls.maxDistance = 520;

    // авто-вращение паузится на время взаимодействия, возобновляется после простоя
    let idle;
    const onStart = () => { controls.autoRotate = false; clearTimeout(idle); };
    const onEnd = () => { clearTimeout(idle); idle = setTimeout(() => { controls.autoRotate = true; }, 3500); };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    gRef.current = world;
    gRef.current._styleWrap = styleWrap;

    const ro = new ResizeObserver(() => {
      if (el.clientWidth) { world.width(el.clientWidth); world.height(el.clientHeight); }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      clearTimeout(idle);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      try { world._destructor(); } catch (e) { /* noop */ }
      elsRef.current.clear();
      el.replaceChildren();
      gRef.current = null;
    };
  }, []);

  // обновление списка городов
  useEffect(() => {
    if (gRef.current) { elsRef.current.clear(); gRef.current.htmlElementsData(markers); }
  }, [markers]);

  // смена выбранного города — переstylить существующие метки
  useEffect(() => {
    selRef.current = selectedId;
    const style = gRef.current && gRef.current._styleWrap;
    if (style) elsRef.current.forEach(({ d, wrap }) => style(d, wrap));
  }, [selectedId]);

  // фокус (геолокация / выбор из панели) — довернуть и приблизить
  useEffect(() => {
    if (focus && gRef.current) gRef.current.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.35 }, 900);
  }, [focus]);

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />;
}

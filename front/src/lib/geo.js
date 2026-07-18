// Гео-данные городов Казахстана (реальные координаты) и хелперы для 3D-глобуса.

export const CITY_GEO = {
  ast: { lat: 51.16, lng: 71.43 }, // Астана
  alm: { lat: 43.24, lng: 76.89 }, // Алматы
  shy: { lat: 42.32, lng: 69.59 }, // Шымкент
  kar: { lat: 49.8, lng: 73.1 }, // Караганда
  pet: { lat: 54.87, lng: 69.15 }, // Петропавловск
  akt: { lat: 50.28, lng: 57.17 }, // Актобе
  pav: { lat: 52.29, lng: 76.97 }, // Павлодар
  tar: { lat: 42.9, lng: 71.39 }, // Тараз
  ukk: { lat: 49.95, lng: 82.61 }, // Усть-Каменогорск
};

// Фолбэк по русскому названию — на случай, если id из API отличаются.
export const NAME_GEO = {
  Астана: CITY_GEO.ast, Нур: CITY_GEO.ast, Алматы: CITY_GEO.alm, Шымкент: CITY_GEO.shy,
  Караганда: CITY_GEO.kar, Петропавловск: CITY_GEO.pet, Актобе: CITY_GEO.akt,
  Павлодар: CITY_GEO.pav, Тараз: CITY_GEO.tar, 'Усть-Каменогорск': CITY_GEO.ukk,
};

// Центр карты Казахстана (для стартового кадра глобуса).
export const KZ_CENTER = { lat: 48.5, lng: 68.0 };

export function cityGeo(city) {
  if (!city) return null;
  if (city.lat != null && city.lng != null) return { lat: city.lat, lng: city.lng };
  return CITY_GEO[city.id] || NAME_GEO[city.ru] || NAME_GEO[city.name] || null;
}

const DEG = Math.PI / 180;

// Расстояние по большому кругу (км).
export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Ближайший к точке город из списка (у элементов должны быть lat/lng).
export function nearestCity(point, cities) {
  let best = null;
  let bestD = Infinity;
  for (const c of cities) {
    if (c.lat == null || c.lng == null) continue;
    const d = haversine(point, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best ? { city: best, distanceKm: bestD } : null;
}

// lat/lng → точка на сфере радиуса r (совместимо с equirectangular-текстурой Земли).
export function latLngToXYZ(lat, lng, r = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return {
    x: -(r * Math.sin(phi) * Math.cos(theta)),
    z: r * Math.sin(phi) * Math.sin(theta),
    y: r * Math.cos(phi),
  };
}

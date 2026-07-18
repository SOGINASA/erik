// Разделы админ-панели — по одному роуту на раздел.
// Используется и сайдбаром (Shell), и страницей Admin.
export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Обзор', icon: 'feed', path: '/admin' },
  { id: 'users', label: 'Пользователи', icon: 'users', path: '/admin/users' },
  { id: 'orgs', label: 'Организации', icon: 'shield', path: '/admin/orgs' },
  { id: 'events', label: 'События', icon: 'calendar', path: '/admin/events' },
  { id: 'moderation', label: 'Модерация', icon: 'filter', path: '/admin/moderation' },
  { id: 'charity', label: 'Помощь', icon: 'heart', path: '/admin/charity' },
  { id: 'cities', label: 'Города', icon: 'map', path: '/admin/cities' },
  { id: 'broadcast', label: 'Рассылки', icon: 'bell', path: '/admin/broadcast' },
  { id: 'analytics', label: 'Аналитика', icon: 'trophy', path: '/admin/analytics' },
];

// id активного раздела из пути (/admin -> overview, /admin/users -> users).
export function adminSectionId(pathname) {
  const sub = pathname.replace(/^\/admin\/?/, '');
  return sub || 'overview';
}

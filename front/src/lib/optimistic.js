// Общий помощник оптимистичных мутаций (штаб организатора).
// Раньше каждая мутация тостила успех ДО ответа сервера и глотала ошибку
// (`api.…().catch(() => {})`) — провал показывался как успех, а локальное
// состояние молча расходилось с бэком. Здесь: применяем локально → ждём API →
// при успехе тостим успех, при ошибке ОТКАТЫВАЕМ и тостим внятную причину.
//
// Циклического импорта нет (проверено): useUiStore тянет только zustand,
// useSessionStore — zustand + lib/api, ни один не импортирует этот модуль.
// Направление всегда стор → optimistic → (useSessionStore|useUiStore), поэтому
// приёмы api.js (setAuth/onAuthRefresh) здесь не нужны.
import { useSessionStore } from '../store/useSessionStore';
import { useUiStore } from '../store/useUiStore';

const isRu = () => useSessionStore.getState().lang === 'ru';
const toast = (text) => useUiStore.getState().showToast(text);
const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// Сеть недоступна: браузер сообщил офлайн ИЛИ fetch упал, не дойдя до сервера
// (у такой ошибки нет status — его проставляет только request() по ответу).
export function isOffline(err) {
  if (!isOnline()) return true;
  return !!err && err.status === undefined;
}

// Нет прав на действие: чужой сбор, снятая роль владельца.
export function isForbidden(err) {
  return !!err && err.status === 403;
}

// Текст ошибки: офлайн и «нет прав» разводим отдельно, остальное — переданный
// вызывающим текст, иначе общий фолбэк.
function errorText(err, errRu, errKz) {
  if (isOffline(err)) return isRu() ? 'Нет сети — изменение не сохранено' : 'Желі жоқ — өзгеріс сақталмады';
  if (isForbidden(err)) return isRu() ? 'Недостаточно прав для этого действия' : 'Бұл әрекетке құқық жеткіліксіз';
  if (isRu() ? errRu : errKz) return isRu() ? errRu : errKz;
  return isRu() ? 'Не удалось сохранить — попробуйте ещё раз' : 'Сақтау мүмкін болмады — қайталап көріңіз';
}

// apply/rollback — синхронные мутации стора, call — () => Promise.
// Возвращает { ok: true, data } либо { ok: false, error }; наружу не бросает,
// чтобы вызывающий обработчик не падал на отменённом действии.
export async function commit({ apply, rollback, call, okRu, okKz, errRu, errKz }) {
  if (apply) apply();
  try {
    const data = await call();
    if (okRu || okKz) toast(isRu() ? okRu : okKz);
    return { ok: true, data };
  } catch (err) {
    // Откат до тоста: пользователь должен увидеть ошибку уже на прежнем состоянии.
    if (rollback) {
      try { rollback(); } catch (_) { /* стор мог уйти дальше — сообщение важнее */ }
    }
    toast(errorText(err, errRu, errKz));
    return { ok: false, error: err };
  }
}

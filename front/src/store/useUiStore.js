import { create } from 'zustand';

// Состояние интерфейса: активный лист/модалка, тост, фильтр полосы, стиль полосы,
// поиск на экране отметки. Не персистится.
let toastTimer = null;

export const useUiStore = create((set) => ({
  sheet: null,          // 'code'|'share'|'person'|'remind'|'settings'|'guest'|'confirm'|'auth'|'register'|'donate'|'more'|null
  sheetPayload: null,
  toast: null,
  filter: null,         // выбранный сегмент полосы явки: 'yes'|'maybe'|'no'|null
  barStyle: 'compose',  // 'compose'|'dots'|'range'
  search: '',

  openSheet: (kind, payload = null) => set({ sheet: kind, sheetPayload: payload }),
  closeSheet: () => set({ sheet: null }),
  setSheetPayload: (payload) => set({ sheetPayload: payload }),

  showToast: (text) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: text });
    toastTimer = setTimeout(() => set({ toast: null }), 3500);
  },
  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },

  setFilter: (f) => set((s) => ({ filter: s.filter === f ? null : f })),
  clearFilter: () => set({ filter: null }),
  setBarStyle: (barStyle) => set({ barStyle }),
  setSearch: (search) => set({ search }),
}));

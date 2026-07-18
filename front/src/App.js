import useCounterStore from './store/useCounterStore';

function App() {
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);
  const decrement = useCounterStore((state) => state.decrement);
  const reset = useCounterStore((state) => state.reset);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-gradient-to-br from-slate-900 to-slate-700 text-white">
      <h1 className="text-4xl font-bold tracking-tight">CRA + Tailwind v4 + Zustand</h1>
      <p className="text-slate-300">Счётчик хранится в Zustand-сторе</p>

      <div className="font-mono text-7xl font-bold tabular-nums">{count}</div>

      <div className="flex gap-4">
        <button
          onClick={decrement}
          className="rounded-lg bg-rose-500 px-5 py-2 font-semibold transition hover:bg-rose-600"
        >
          −
        </button>
        <button
          onClick={reset}
          className="rounded-lg bg-slate-600 px-5 py-2 font-semibold transition hover:bg-slate-500"
        >
          Сброс
        </button>
        <button
          onClick={increment}
          className="rounded-lg bg-emerald-500 px-5 py-2 font-semibold transition hover:bg-emerald-600"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default App;

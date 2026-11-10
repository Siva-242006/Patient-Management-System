import React, { useEffect } from 'react';

export default function Toast({ toasts, onDismiss }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      onDismiss(toasts[0].id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto p-3.5 rounded-lg border shadow-sm text-sm transition-all ${
            t.isError
              ? 'bg-rose-50 border-rose-200 text-rose-900 border-l-4 border-l-rose-600'
              : 'bg-white border-slate-200 text-slate-800 border-l-4 border-l-blue-700'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="font-medium">{t.message}</div>
          {t.status ? (
            <div className="text-xs text-slate-500 mt-0.5">HTTP {t.status}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

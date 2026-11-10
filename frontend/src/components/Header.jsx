import React from 'react';

export default function Header() {
  return (
    <header className="mb-6 text-center">
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
        Patient Follow-Up System
      </h1>
      <p className="text-sm md:text-base text-slate-500 mt-1">
        Clinic Staff Portal &amp; AI Follow-Up Review
      </p>
      <div className="mt-3 inline-block bg-blue-50 text-blue-800 border border-blue-200 text-xs font-semibold px-4 py-1.5 rounded-full">
        Demo mode: no messages are ever sent. Fictional data only.
      </div>
    </header>
  );
}

import React from 'react';

export default function SummarySection({ summary, onRefresh, loading }) {
  if (!summary) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Today's Summary</h2>
        <p className="text-sm text-slate-500">Loading summary data...</p>
      </section>
    );
  }

  const { date, patients = {}, drafts = {}, summaryText, summarySource } = summary;

  const statItems = [
    { label: 'Total Patients', value: patients.total, highlight: false },
    { label: 'Pending', value: patients.pending, highlight: false },
    { label: 'Due Today', value: patients.dueToday, highlight: true },
    { label: 'Overdue', value: patients.overdue, highlight: patients.overdue > 0 },
    { label: 'Completed', value: patients.completed, highlight: false },
    { label: 'Drafts Review', value: drafts.pendingReview, highlight: drafts.pendingReview > 0 },
    { label: 'Approved', value: drafts.approved, highlight: false },
    { label: 'Rejected', value: drafts.rejected, highlight: false },
    { label: 'Cancelled', value: drafts.cancelled, highlight: false }
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Today's Summary</h2>
          <p className="text-xs text-slate-500">Clinic follow-up status for {date}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2.5 mb-4">
        {statItems.map(item => (
          <div
            key={item.label}
            className={`p-2.5 rounded-lg border ${
              item.highlight
                ? 'bg-blue-50/50 border-blue-200'
                : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="text-[11px] font-medium text-slate-500 truncate">{item.label}</div>
            <div className={`text-xl font-bold mt-0.5 ${item.highlight ? 'text-blue-900' : 'text-slate-800'}`}>
              {item.value ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Daily Narrative Briefing
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              summarySource === 'ai'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            {summarySource ? summarySource.toUpperCase() : 'MOCK'}
          </span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">
          {summaryText || 'No summary text available.'}
        </p>
      </div>
    </section>
  );
}

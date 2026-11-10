import React from 'react';

export default function PatientTable({
  patients,
  filterStatus,
  onFilterStatusChange,
  dueTodayOnly,
  onDueTodayChange,
  includeOverdue,
  onIncludeOverdueChange,
  onMarkCompleted,
  loading
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-status" className="text-xs font-medium text-slate-700">
            Status:
          </label>
          <select
            id="filter-status"
            value={filterStatus}
            disabled={dueTodayOnly}
            onChange={e => onFilterStatusChange(e.target.value)}
            className="text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-800 disabled:opacity-50"
          >
            <option value="all">All Patients</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={dueTodayOnly}
              onChange={e => onDueTodayChange(e.target.checked)}
              className="rounded text-blue-900 focus:ring-blue-800"
            />
            <span>Due Today Only</span>
          </label>

          <label
            className={`flex items-center gap-1.5 ${
              !dueTodayOnly ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              checked={includeOverdue}
              disabled={!dueTodayOnly}
              onChange={e => onIncludeOverdueChange(e.target.checked)}
              className="rounded text-blue-900 focus:ring-blue-800"
            />
            <span>Include Overdue</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
            <tr>
              <th scope="col" className="px-3.5 py-2.5">Name</th>
              <th scope="col" className="px-3.5 py-2.5">Consultation Date</th>
              <th scope="col" className="px-3.5 py-2.5">Follow-Up Date</th>
              <th scope="col" className="px-3.5 py-2.5">Status</th>
              <th scope="col" className="px-3.5 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400 italic">
                  Loading patients from database...
                </td>
              </tr>
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400 italic">
                  No patients found matching current filter.
                </td>
              </tr>
            ) : (
              patients.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3.5 py-2.5 font-medium text-slate-900">{p.name}</td>
                  <td className="px-3.5 py-2.5 text-slate-600">{p.consultationDate}</td>
                  <td className="px-3.5 py-2.5 text-slate-600">{p.followUpDate}</td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        p.followUpStatus === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {p.followUpStatus}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {p.followUpStatus === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => onMarkCompleted(p)}
                        className="text-[11px] font-medium px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        Mark Completed
                      </button>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

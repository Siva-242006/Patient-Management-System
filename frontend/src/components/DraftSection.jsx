import React, { useState } from 'react';

function DraftCard({ draft, onApprove, onReject }) {
  const isPending = draft.status === 'pending_review';
  const [editedText, setEditedText] = useState(draft.message);
  const [acting, setActing] = useState(false);

  const len = editedText.trim().length;
  const hasLetter = /\p{L}/u.test(editedText);
  const isValidLength = len >= 100 && len <= 500 && hasLetter;

  async function handleApprove() {
    setActing(true);
    const isEdited = editedText.trim() !== draft.message.trim();
    const payload = isEdited ? { message: editedText.trim() } : {};
    await onApprove(draft.id, payload);
    setActing(false);
  }

  async function handleReject() {
    if (!confirm('Reject follow-up draft for ' + draft.patientName + '?')) return;
    setActing(true);
    await onReject(draft.id);
    setActing(false);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start gap-2 mb-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{draft.patientName}</h4>
            <p className="text-xs text-slate-500">Follow-up: {draft.followUpDate}</p>
          </div>
          <div className="flex gap-1.5">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                draft.source === 'ai'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {draft.source.toUpperCase()}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                draft.status === 'approved'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : draft.status === 'rejected'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : draft.status === 'cancelled'
                  ? 'bg-slate-100 border-slate-200 text-slate-600'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {draft.status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {isPending ? (
          <div className="mt-2">
            <textarea
              value={editedText}
              onChange={e => setEditedText(e.target.value)}
              maxLength={500}
              rows={4}
              className="w-full text-xs p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-800 leading-relaxed resize-y"
            />
            <div className="flex justify-between items-center text-[11px] mt-1">
              <span className={isValidLength ? 'text-slate-500' : 'text-rose-600 font-semibold'}>
                {len} / 500 characters
              </span>
              <span className="text-slate-400">Rule: 100–500 chars with letters</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 p-3 bg-slate-50 border border-slate-200/80 rounded-lg text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
            {draft.message}
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
          <button
            type="button"
            disabled={acting}
            onClick={handleReject}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={acting || !isValidLength}
            onClick={handleApprove}
            className="text-xs font-medium px-3.5 py-1.5 rounded-lg bg-blue-900 text-white hover:bg-blue-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {acting ? 'Approving...' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DraftSection({
  drafts,
  filterStatus,
  onFilterStatusChange,
  onGenerateDrafts,
  generating,
  onApproveDraft,
  onRejectDraft,
  loading
}) {
  const [includeOverdue, setIncludeOverdue] = useState(false);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Draft Messages (Staff Review)</h2>
          <p className="text-xs text-slate-500">
            Review, edit, and approve personalized reminders before simulated send
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOverdue}
              onChange={e => setIncludeOverdue(e.target.checked)}
              className="rounded text-blue-900 focus:ring-blue-800"
            />
            <span>Include Overdue</span>
          </label>

          <button
            type="button"
            onClick={() => onGenerateDrafts(includeOverdue)}
            disabled={generating}
            className="text-xs font-semibold px-3.5 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {generating ? 'Generating Drafts...' : 'Generate Drafts for Due Patients'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
        <label htmlFor="filter-draft-status" className="text-xs font-medium text-slate-700">
          Filter Drafts:
        </label>
        <select
          id="filter-draft-status"
          value={filterStatus}
          onChange={e => onFilterStatusChange(e.target.value)}
          className="text-xs px-2.5 py-1 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-800"
        >
          <option value="all">All Drafts</option>
          <option value="pending_review">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400 italic text-sm">
          Loading drafts from database...
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-10 text-slate-400 italic text-sm border border-dashed border-slate-200 rounded-xl">
          No drafts found. Click "Generate Drafts for Due Patients" to create review drafts.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map(d => (
            <DraftCard
              key={d.id}
              draft={d}
              onApprove={onApproveDraft}
              onReject={onRejectDraft}
            />
          ))}
        </div>
      )}
    </section>
  );
}

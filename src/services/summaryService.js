import { getDb } from '../db.js';
import { getToday } from '../utils/dates.js';
import { summaryNarrative } from './summaryAiService.js';

export function buildSummaryText({ date, patients, drafts }) {
  return `On ${date}, ${patients.dueToday} patient(s) are due for follow-up with ${patients.overdue} overdue. There are ${drafts.pendingReview} draft(s) pending review, ${drafts.approved} approved, and ${drafts.rejected} rejected.`;
}

export function computeSummaryCounts(db = getDb(), today = getToday()) {
  const patientRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN follow_up_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN follow_up_status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN follow_up_status = 'pending' AND follow_up_date = ? THEN 1 ELSE 0 END) as dueToday,
      SUM(CASE WHEN follow_up_status = 'pending' AND follow_up_date < ? THEN 1 ELSE 0 END) as overdue
    FROM patients
  `).get(today, today);

  const draftRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pendingReview,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM drafts
  `).get();

  return {
    date: today,
    patients: {
      total: patientRow?.total ?? 0,
      pending: patientRow?.pending ?? 0,
      completed: patientRow?.completed ?? 0,
      dueToday: patientRow?.dueToday ?? 0,
      overdue: patientRow?.overdue ?? 0
    },
    drafts: {
      total: draftRow?.total ?? 0,
      pendingReview: draftRow?.pendingReview ?? 0,
      approved: draftRow?.approved ?? 0,
      rejected: draftRow?.rejected ?? 0,
      cancelled: draftRow?.cancelled ?? 0
    }
  };
}

export async function getDraftsSummary({ db = getDb(), aiOptions = {} } = {}) {
  const counts = computeSummaryCounts(db);
  const narrative = await summaryNarrative(counts, aiOptions);

  return {
    date: counts.date,
    patients: counts.patients,
    drafts: counts.drafts,
    summaryText: narrative.summaryText,
    summarySource: narrative.summarySource,
    fallbackReason: narrative.fallbackReason
  };
}

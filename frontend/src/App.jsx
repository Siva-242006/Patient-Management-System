import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header.jsx';
import SummarySection from './components/SummarySection.jsx';
import PatientForm from './components/PatientForm.jsx';
import PatientTable from './components/PatientTable.jsx';
import DraftSection from './components/DraftSection.jsx';
import Toast from './components/Toast.jsx';
import { apiRequest } from './api.js';

export default function App() {
  const [toasts, setToasts] = useState([]);
  const [wakingUp, setWakingUp] = useState(false);

  // Data states
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientFilter, setPatientFilter] = useState('all');
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [includeOverduePatients, setIncludeOverduePatients] = useState(false);

  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftFilter, setDraftFilter] = useState('all');
  const [generatingDrafts, setGeneratingDrafts] = useState(false);

  const showToast = useCallback((message, status, isError = false) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, status, isError }]);
  }, []);

  const dismissToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Fetch Summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    const { ok, status, body } = await apiRequest('/drafts/summary', {}, setWakingUp);
    setSummaryLoading(false);

    if (ok && body?.success) {
      setSummary(body.data);
    } else {
      showToast(body?.error?.message || 'Failed to load summary', status, true);
    }
  }, [showToast]);

  // Fetch Patients
  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true);
    let url = '/patients';
    if (dueTodayOnly) {
      url = '/patients/due-today' + (includeOverduePatients ? '?includeOverdue=true' : '');
    } else if (patientFilter !== 'all') {
      url = '/patients?status=' + encodeURIComponent(patientFilter);
    }

    const { ok, status, body } = await apiRequest(url, {}, setWakingUp);
    setPatientsLoading(false);

    if (ok && body?.success) {
      setPatients(body.data || []);
    } else {
      showToast(body?.error?.message || 'Failed to load patients', status, true);
    }
  }, [dueTodayOnly, includeOverduePatients, patientFilter, showToast]);

  // Fetch Drafts
  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    let url = '/drafts';
    if (draftFilter !== 'all') {
      url = '/drafts?status=' + encodeURIComponent(draftFilter);
    }

    const { ok, status, body } = await apiRequest(url, {}, setWakingUp);
    setDraftsLoading(false);

    if (ok && body?.success) {
      setDrafts(body.data || []);
    } else {
      showToast(body?.error?.message || 'Failed to load drafts', status, true);
    }
  }, [draftFilter, showToast]);

  // Initial Load
  useEffect(() => {
    fetchSummary();
    fetchPatients();
    fetchDrafts();
  }, [fetchSummary, fetchPatients, fetchDrafts]);

  // Actions
  async function handleMarkCompleted(patient) {
    if (!confirm('Mark follow-up completed for ' + patient.name + '?')) return;
    const { ok, status, body } = await apiRequest('/patients/' + patient.id + '/complete', {
      method: 'PATCH'
    });

    if (ok && body?.success) {
      showToast(body.message, status);
      fetchPatients();
      fetchDrafts();
      fetchSummary();
    } else {
      showToast(body?.error?.message || 'Completion failed', status, true);
    }
  }

  async function handleGenerateDrafts(includeOverdue) {
    setGeneratingDrafts(true);
    const { ok, status, body } = await apiRequest(
      '/drafts/generate',
      {
        method: 'POST',
        body: JSON.stringify({ includeOverdue })
      },
      setWakingUp
    );
    setGeneratingDrafts(false);

    if (ok && body?.success) {
      showToast(body.message, status);
      fetchDrafts();
      fetchSummary();
    } else {
      showToast(body?.error?.message || 'Draft generation failed', status, true);
    }
  }

  async function handleApproveDraft(draftId, payload) {
    const { ok, status, body } = await apiRequest('/drafts/' + draftId + '/approve', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (ok && body?.success) {
      showToast(body.message, status);
      fetchDrafts();
      fetchSummary();
    } else {
      showToast(body?.error?.message || 'Approval failed', status, true);
    }
  }

  async function handleRejectDraft(draftId) {
    const { ok, status, body } = await apiRequest('/drafts/' + draftId + '/reject', {
      method: 'PATCH'
    });

    if (ok && body?.success) {
      showToast(body.message, status);
      fetchDrafts();
      fetchSummary();
    } else {
      showToast(body?.error?.message || 'Rejection failed', status, true);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Header />
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {wakingUp && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs text-center font-medium rounded-lg">
          Server is waking up, please wait...
        </div>
      )}

      {/* Section 1: Summary */}
      <SummarySection
        summary={summary}
        onRefresh={fetchSummary}
        loading={summaryLoading}
      />

      {/* Section 2: Patients */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Patients</h2>
        <p className="text-xs text-slate-500 mb-4">
          Register new follow-ups and monitor status in SQLite database
        </p>

        <PatientForm
          onPatientAdded={() => {
            fetchPatients();
            fetchSummary();
          }}
          showToast={showToast}
        />

        <PatientTable
          patients={patients}
          filterStatus={patientFilter}
          onFilterStatusChange={setPatientFilter}
          dueTodayOnly={dueTodayOnly}
          onDueTodayChange={setDueTodayOnly}
          includeOverdue={includeOverduePatients}
          onIncludeOverdueChange={setIncludeOverduePatients}
          onMarkCompleted={handleMarkCompleted}
          loading={patientsLoading}
        />
      </section>

      {/* Section 3: Drafts */}
      <DraftSection
        drafts={drafts}
        filterStatus={draftFilter}
        onFilterStatusChange={setDraftFilter}
        onGenerateDrafts={handleGenerateDrafts}
        generating={generatingDrafts}
        onApproveDraft={handleApproveDraft}
        onRejectDraft={handleRejectDraft}
        loading={draftsLoading}
      />
    </div>
  );
}

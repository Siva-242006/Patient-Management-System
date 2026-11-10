import React, { useState } from 'react';
import { apiRequest } from '../api.js';

export default function PatientForm({ onPatientAdded, showToast }) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    consultationDate: '',
    followUpDate: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({ ...prev, [name]: '' }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError('');
    setSubmitting(true);

    try {
      const { ok, status, body } = await apiRequest('/patients', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          consultationDate: formData.consultationDate,
          followUpDate: formData.followUpDate
        })
      });

      if (ok && body?.success) {
        showToast(body.message, status);
        setFormData({ name: '', phone: '', consultationDate: '', followUpDate: '' });
        onPatientAdded();
      } else {
        if (body?.error?.details && Array.isArray(body.error.details)) {
          const errors = {};
          body.error.details.forEach(d => {
            errors[d.field] = d.issue;
          });
          setFieldErrors(errors);
        } else {
          setGeneralError(body?.error?.message || 'Failed to add patient');
        }
        showToast(body?.error?.message || 'Validation failed', status, true);
      }
    } catch (err) {
      setGeneralError('Network error connecting to backend API');
      showToast('Network error connecting to backend API', 0, true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 mb-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Add New Patient</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div>
            <label htmlFor="input-name" className="block text-xs font-medium text-slate-700 mb-1">
              Patient Name
            </label>
            <input
              type="text"
              id="input-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Anita Rao"
              required
              className="w-full text-sm px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
            {fieldErrors.name && (
              <span className="text-[11px] text-rose-600 block mt-0.5">{fieldErrors.name}</span>
            )}
          </div>

          <div>
            <label htmlFor="input-phone" className="block text-xs font-medium text-slate-700 mb-1">
              Phone (10 digits)
            </label>
            <input
              type="tel"
              id="input-phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="e.g. 9876543210"
              required
              className="w-full text-sm px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
            {fieldErrors.phone && (
              <span className="text-[11px] text-rose-600 block mt-0.5">{fieldErrors.phone}</span>
            )}
          </div>

          <div>
            <label htmlFor="input-consultation" className="block text-xs font-medium text-slate-700 mb-1">
              Consultation Date
            </label>
            <input
              type="date"
              id="input-consultation"
              name="consultationDate"
              value={formData.consultationDate}
              onChange={handleChange}
              required
              className="w-full text-sm px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
            {fieldErrors.consultationDate && (
              <span className="text-[11px] text-rose-600 block mt-0.5">
                {fieldErrors.consultationDate}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="input-followup" className="block text-xs font-medium text-slate-700 mb-1">
              Follow-Up Date
            </label>
            <input
              type="date"
              id="input-followup"
              name="followUpDate"
              value={formData.followUpDate}
              onChange={handleChange}
              required
              className="w-full text-sm px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
            {fieldErrors.followUpDate && (
              <span className="text-[11px] text-rose-600 block mt-0.5">{fieldErrors.followUpDate}</span>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center">
          {generalError ? (
            <span className="text-xs font-medium text-rose-600">{generalError}</span>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={submitting}
            className="text-xs font-medium px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Saving to Database...' : 'Add Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}

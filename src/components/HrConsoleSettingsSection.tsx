'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2, Mail, Shield } from 'lucide-react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { DEFAULT_SERVICE_ADMIN_EMAIL } from '@/lib/hrServiceEmail';
import { AttendanceRequestWindowSettings } from '@/components/AttendanceRequestWindowSettings';

export const HrConsoleSettingsSection: React.FC = () => {
  const [serviceEmail, setServiceEmail] = useState(DEFAULT_SERVICE_ADMIN_EMAIL);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requestOtp = async () => {
    setOtpLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/password/request-otp',
        hrCredentialsInit({ method: 'POST' })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to send OTP');
      }
      setSessionId(json.data.sessionId);
      setOtp('');
      const msg = json.data.message || `OTP sent to ${DEFAULT_SERVICE_ADMIN_EMAIL}`;
      setMessage(msg);
      const match = msg.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (match) setServiceEmail(match[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      setError('Request an OTP first');
      return;
    }
    setSaveLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/password/change',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            otp: otp.trim(),
            newPassword,
            confirmPassword,
          }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to change password');
      }
      setMessage(json.data.message || 'Password updated');
      setSessionId(null);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-blue-200/65 bg-panel p-6 shadow-sm">
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
          <Shield className="h-3.5 w-3.5" aria-hidden />
          Settings
        </div>
        <h2 className="text-lg font-semibold text-slate-900">HR console password</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Change the shared HR login password used on the admin sign-in screen. An OTP is sent to{' '}
          <span className="font-medium text-slate-800">{serviceEmail}</span> before the new password is saved.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      <div className="max-w-lg space-y-5">
        <button
          type="button"
          onClick={() => void requestOtp()}
          disabled={otpLoading}
          className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {otpLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Mail className="h-4 w-4" aria-hidden />
          )}
          Send OTP to {serviceEmail}
        </button>

        <form onSubmit={(e) => void changePassword(e)} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <div>
            <label htmlFor="settings-otp" className="mb-1 block text-xs font-medium text-slate-600">
              OTP from {serviceEmail}
            </label>
            <input
              id="settings-otp"
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit OTP"
              maxLength={6}
              disabled={!sessionId}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tracking-widest text-slate-900 disabled:bg-slate-100"
            />
          </div>
          <div>
            <label htmlFor="settings-new-password" className="mb-1 block text-xs font-medium text-slate-600">
              New password
            </label>
            <input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={!sessionId}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
            />
          </div>
          <div>
            <label htmlFor="settings-confirm-password" className="mb-1 block text-xs font-medium text-slate-600">
              Confirm new password
            </label>
            <input
              id="settings-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              disabled={!sessionId}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={saveLoading || !sessionId || otp.length !== 6 || !newPassword || !confirmPassword}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden />
            )}
            Update HR password
          </button>
        </form>
      </div>

      <div className="mt-10 border-t border-slate-200 pt-10">
        <AttendanceRequestWindowSettings />
      </div>
    </section>
  );
};

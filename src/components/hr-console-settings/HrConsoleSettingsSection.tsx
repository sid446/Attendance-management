'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, KeyRound, Loader2, Mail, Shield } from 'lucide-react';
import { AttendanceCalcPolicySettings } from '@/components/attendance-calc-policy-settings';
import { AttendanceRequestWindowSettings } from '@/components/attendance-request-window-settings';
import { PresenceCreditSettings } from '@/components/presence-credit-settings';
import { SETTINGS_CATEGORIES } from './constants';
import { useHrConsoleSettingsSectionLogic } from './hooks';

export const HrConsoleSettingsSection: React.FC = () => {
  const {
    panel,
    setPanel,
    serviceEmail,
    sessionId,
    otp,
    setOtp,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    otpLoading,
    saveLoading,
    error,
    message,
    requestOtp,
    changePassword,
    activeCategory,
  } = useHrConsoleSettingsSectionLogic();

  return (
    <section className="rounded-xl border border-blue-200/65 bg-panel p-6 shadow-sm">
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
          <Shield className="h-3.5 w-3.5" aria-hidden />
          Settings
        </div>
        {activeCategory ? (
          <>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-blue-800 hover:text-blue-950"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              All settings
            </button>
            <h2 className="text-lg font-semibold text-slate-900">{activeCategory.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{activeCategory.description}</p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Choose a category. Only that part opens.
            </p>
          </>
        )}
      </header>

      {!activeCategory && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {SETTINGS_CATEGORIES.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setPanel(item.id)}
                  className="flex h-full w-full items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60"
                >
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-800">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                    <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {panel === 'password' && (
        <>
      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        An OTP is sent to <span className="font-medium text-slate-800">{serviceEmail}</span> before the new password is saved.
      </p>

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
        </>
      )}

      {panel === 'presence' && <PresenceCreditSettings />}
      {panel === 'calculation' && <AttendanceCalcPolicySettings />}
      {panel === 'requestWindow' && <AttendanceRequestWindowSettings />}
    </section>
  );
};

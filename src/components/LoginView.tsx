import React from 'react';
import Link from 'next/link';
import { FileSpreadsheet, Lock, Mail, UserCircle } from 'lucide-react';
import { HR_OTP_TTL_MINUTES } from '@/lib/hrOtpConstants';

function formatOtpCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface LoginViewProps {
  loginStep: 'password' | 'otp';
  password: string;
  onPasswordChange: (val: string) => void;
  onPasswordSubmit: () => void;
  email: string;
  onEmailChange: (val: string) => void;
  otp: string;
  onOtpChange: (val: string) => void;
  onOtpSubmit: () => void;
  onBackToPassword: () => void;
  otpSecondsLeft: number | null;
  isLoading: boolean;
  error: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  loginStep,
  password,
  onPasswordChange,
  onPasswordSubmit,
  email,
  onEmailChange,
  otp,
  onOtpChange,
  onOtpSubmit,
  onBackToPassword,
  otpSecondsLeft,
  isLoading,
  error
}) => {
  const otpExpired = otpSecondsLeft !== null && otpSecondsLeft <= 0;
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400/50 via-blue-200/85 to-[var(--surface)] text-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-blue-300/70 bg-[var(--panel)] p-8 shadow-lg shadow-blue-400/35">
          {/* Logo and Company Name */}
          <div className="flex flex-col items-center mb-6">
            <img src="/lg.png" alt="Asija Logo" className="w-20 h-20 object-contain mb-3" />
            <h2 className="text-lg font-semibold text-blue-700">Asija and Associates LLP</h2>
          </div>
          <div className="flex items-center justify-center gap-3 mb-6">
            <FileSpreadsheet className="w-10 h-10 text-blue-600" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Attendance Console</h1>
              <p className="text-xs text-slate-500">HR Login</p>
            </div>
          </div>

          {loginStep === 'password' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  <Mail className="w-3 h-3 inline mr-1" />
                  Admin Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onPasswordSubmit()}
                  placeholder="e.g. hr@asija.in"
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Must be on the Access control allowlist. Login OTP goes to this address.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  <Lock className="w-3 h-3 inline mr-1" />
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onPasswordSubmit()}
                  placeholder="Enter HR password"
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors"
                />
              </div>

              {error && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                  {error}
                </div>
              )}

              <button
                onClick={onPasswordSubmit}
                disabled={isLoading || !password || !email}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {isLoading ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                <Mail className="w-3 h-3 inline mr-1" />
                OTP sent to <span className="font-medium">{email || 'your admin email'}</span>. Please check your inbox.
                {otpSecondsLeft !== null && (
                  <p className="mt-2 font-medium">
                    {otpExpired ? (
                      <span className="text-red-700">OTP expired — go back and sign in again to get a new code.</span>
                    ) : (
                      <>
                        Valid for {HR_OTP_TTL_MINUTES} minutes · expires in{' '}
                        <span className="tabular-nums text-blue-800">{formatOtpCountdown(otpSecondsLeft)}</span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => onOtpChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onOtpSubmit()}
                  placeholder="6-digit code"
                  maxLength={6}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-center text-xl tracking-widest text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors"
                />
              </div>

              {error && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                  {error}
                </div>
              )}

              <button
                onClick={onOtpSubmit}
                disabled={isLoading || otp.length !== 6 || otpExpired}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {isLoading ? 'Verifying...' : otpExpired ? 'OTP expired' : 'Verify OTP'}
              </button>

              <button
                onClick={onBackToPassword}
                className="w-full px-4 py-2 text-xs text-slate-500 transition-colors hover:text-blue-700"
              >
                ← Back to password
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-[11px] text-slate-500">
            Sign-in OTP is sent to your admin email after password verification ({HR_OTP_TTL_MINUTES}-minute validity)
          </p>

          <div className="mt-4 border-t border-slate-200 pt-4">
            <Link
              href="/employee/login"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"
            >
              <UserCircle className="h-4 w-4 shrink-0" aria-hidden />
              Login as employee
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

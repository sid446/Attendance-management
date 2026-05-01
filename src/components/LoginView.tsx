import React from 'react';
import { FileSpreadsheet, Lock, Mail } from 'lucide-react';

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
  isLoading,
  error
}) => {
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
                  placeholder="e.g. it@asija.in"
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
                OTP sent to admin email. Please check your inbox.
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
                disabled={isLoading || otp.length !== 6}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
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
            OTP will be sent to the admin email for verification
          </p>
        </div>
      </div>
    </div>
  );
};

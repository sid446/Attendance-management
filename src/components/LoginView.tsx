import React from 'react';
import { FileSpreadsheet, Lock, Mail } from 'lucide-react';

interface LoginViewProps {
  loginStep: 'password' | 'otp';
  password: string;
  onPasswordChange: (val: string) => void;
  onPasswordSubmit: () => void;
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
  otp,
  onOtpChange,
  onOtpSubmit,
  onBackToPassword,
  isLoading,
  error
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <FileSpreadsheet className="w-10 h-10 text-emerald-400" />
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Attendance Console</h1>
              <p className="text-xs text-slate-400">HR Login</p>
            </div>
          </div>

          {loginStep === 'password' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  <Lock className="w-3 h-3 inline mr-1" />
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onPasswordSubmit()}
                  placeholder="Enter HR password"
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {error && (
                <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
                  {error}
                </div>
              )}

              <button
                onClick={onPasswordSubmit}
                disabled={isLoading || !password}
                className="w-full px-4 py-3 bg-emerald-500 text-slate-950 text-sm font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Verifying...' : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-emerald-950/30 border border-emerald-700/40 text-emerald-100 px-4 py-3 rounded-md text-xs">
                <Mail className="w-3 h-3 inline mr-1" />
                OTP sent to admin email. Please check your inbox.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Enter OTP
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => onOtpChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onOtpSubmit()}
                  placeholder="6-digit code"
                  maxLength={6}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-4 py-3 text-slate-100 text-center text-xl tracking-widest placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {error && (
                <div className="bg-rose-950/40 border border-rose-700/60 text-rose-100 px-4 py-3 rounded-md text-xs">
                  {error}
                </div>
              )}

              <button
                onClick={onOtpSubmit}
                disabled={isLoading || otp.length !== 6}
                className="w-full px-4 py-3 bg-emerald-500 text-slate-950 text-sm font-medium rounded-md hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
              </button>

              <button
                onClick={onBackToPassword}
                className="w-full px-4 py-2 text-slate-400 text-xs hover:text-slate-200 transition-colors"
              >
                ← Back to password
              </button>
            </div>
          )}

          <p className="text-center text-slate-500 text-[11px] mt-6">
            OTP will be sent to the admin email for verification
          </p>
        </div>
      </div>
    </div>
  );
};

"use client";
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import {
  formatOtpCountdown,
  EMPLOYEE_OTP_TTL_MINUTES,
  EMPLOYEE_OTP_TTL_MS,
} from '@/lib/hrOtpConstants';
import { employeeCredentialsInit } from '@/lib/employeeCredentialsInit';

const RESEND_COOLDOWN_SECONDS = 180;

function getSafeEmployeeRedirect(): string {
  if (typeof window === 'undefined') return '/employee/dashboard';
  const next = new URLSearchParams(window.location.search).get('next');
  if (next && next.startsWith('/employee/') && !next.startsWith('//')) {
    return next;
  }
  return '/employee/dashboard';
}

export default function EmployeeLoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number | null>(null);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    void fetch('/api/auth/warm-smtp').catch(() => {});
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/employee-session', employeeCredentialsInit());
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            localStorage.setItem('employeeUser', JSON.stringify(json.data));
            router.replace(getSafeEmployeeRedirect());
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [router]);

  const otpExpired = step === 'otp' && otpSecondsLeft !== null && otpSecondsLeft <= 0;

  const isAsijaEmail = (value: string) => value.trim().toLowerCase().endsWith('@asija.in');

  useEffect(() => {
    if (step !== 'otp' || otpExpiresAt == null) {
      setOtpSecondsLeft(null);
      return;
    }
    const tick = () => {
      setOtpSecondsLeft(Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [step, otpExpiresAt]);

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;
    const id = window.setInterval(() => {
      setResendSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [resendSecondsLeft]);

  const applyOtpSent = useCallback((data: { sessionId: string; expiresAt?: string }) => {
    setSessionId(data.sessionId);
    const expiresMs = data.expiresAt
      ? new Date(data.expiresAt).getTime()
      : Date.now() + EMPLOYEE_OTP_TTL_MS;
    setOtpExpiresAt(expiresMs);
    setStep('otp');
    setOtp('');
    setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
    setMessage(
      'OTP sent. Email delivery may take 1–2 minutes — please wait and check your spam/junk folder.'
    );
  }, []);

  const requestOtp = useCallback(async (normalizedEmail: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, role: 'employee' }),
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || 'Failed to send OTP');
    }
    applyOtpSent(json.data);
  }, [applyOtpSent]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    if (!isAsijaEmail(normalizedEmail)) {
      setError('Please enter your @asija.in email address');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await requestOtp(normalizedEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || resendSecondsLeft > 0 || resending) return;

    setResending(true);
    setError(null);
    setMessage(null);

    try {
      await requestOtp(normalizedEmail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || otp.trim().length !== 6) return;

    if (otpExpiresAt != null && otpExpiresAt <= Date.now()) {
      setError('OTP has expired. Resend a new code below.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(
        '/api/auth/verify-otp',
        employeeCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, otp: otp.trim(), role: 'employee' }),
        })
      );

      const json = await res.json();

      if (json.success) {
        localStorage.setItem('employeeUser', JSON.stringify(json.data));
        router.push(getSafeEmployeeRedirect());
      } else {
        setError(json.error || 'OTP verification failed');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setStep('email');
    setSessionId(null);
    setOtpExpiresAt(null);
    setResendSecondsLeft(0);
    setOtp('');
    setError(null);
    setMessage(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-2xl shadow-black/40">
        <div className="border-b border-zinc-800 bg-zinc-950/80 px-6 py-6 text-center">
          <div className="mb-4 flex flex-col items-center">
            <img src="/lg.png" alt="Asija Logo" className="mb-3 h-20 w-20 object-contain" />
            <p className="text-sm font-medium text-emerald-500/95">Asija and Associates LLP</p>
          </div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-zinc-50">Employee portal</h1>
          <p className="text-sm text-zinc-500">Attendance and profile</p>
        </div>

        <div className="p-8">
          <form onSubmit={step === 'email' ? handleSendOtp : handleVerifyOtp} className="space-y-6">
            {step === 'email' ? (
              <div className="space-y-2">
                <label htmlFor="employee-email" className="text-sm font-medium text-zinc-400">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" aria-hidden />
                  <input
                    id="employee-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@asija.in"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-3 pl-10 pr-4 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/40"
                    required
                    autoComplete="email"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Use your @asija.in email to receive a {EMPLOYEE_OTP_TTL_MINUTES}-minute OTP.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="employee-otp" className="text-sm font-medium text-zinc-400">
                  Enter OTP
                </label>
                <input
                  id="employee-otp"
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit OTP"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-3 px-4 text-zinc-100 tracking-[0.35em] placeholder:tracking-normal placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/40"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-zinc-500">OTP was sent to {email.trim().toLowerCase()}.</p>
                {otpSecondsLeft !== null && (
                  <p className="text-xs font-medium text-zinc-400">
                    {otpExpired ? (
                      <span className="text-rose-400">OTP expired — tap Resend OTP below.</span>
                    ) : (
                      <>
                        Valid for {EMPLOYEE_OTP_TTL_MINUTES} minutes · expires in{' '}
                        <span className="tabular-nums text-emerald-400">
                          {formatOtpCountdown(otpSecondsLeft)}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            {message && (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/40 p-3 text-sm text-emerald-300">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-500/25 bg-rose-950/40 p-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || resending || (step === 'otp' && (otp.trim().length !== 6 || otpExpired))}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  {step === 'email' ? 'Sending OTP…' : 'Verifying OTP…'}
                </>
              ) : (
                <>
                  {step === 'email' ? 'Send OTP' : otpExpired ? 'OTP expired' : 'Verify OTP'}
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </>
              )}
            </button>

            {step === 'otp' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void handleResendOtp()}
                  disabled={resending || loading || resendSecondsLeft > 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-emerald-600/50 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Resending…
                    </>
                  ) : resendSecondsLeft > 0 ? (
                    `Resend OTP in ${resendSecondsLeft}s`
                  ) : (
                    'Resend OTP'
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  className="w-full text-sm text-zinc-400 transition-colors hover:text-emerald-400"
                >
                  Change email
                </button>
              </div>
            )}
          </form>

          <div className="mt-6 border-t border-zinc-800 pt-6">
            <Link
              href="/admin"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:border-emerald-600/50 hover:bg-zinc-900 hover:text-emerald-400"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              Login as admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

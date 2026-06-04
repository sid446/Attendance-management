"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { formatOtpCountdown, HR_OTP_TTL_MINUTES, HR_OTP_TTL_MS } from '@/lib/hrOtpConstants';

export default function EmployeeLoginPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number | null>(null);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, role: 'employee' }),
      });

      const json = await res.json();

      if (json.success) {
        setSessionId(json.data.sessionId);
        const expiresMs = json.data.expiresAt
          ? new Date(json.data.expiresAt).getTime()
          : Date.now() + HR_OTP_TTL_MS;
        setOtpExpiresAt(expiresMs);
        setStep('otp');
        setOtp('');
        setMessage('OTP sent to your email. Please check your inbox.');
      } else {
        setError(json.error || 'Login failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || otp.trim().length !== 6) return;

    if (otpExpiresAt != null && otpExpiresAt <= Date.now()) {
      setError('OTP has expired. Change email and request a new code.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, otp: otp.trim(), role: 'employee' }),
      });

      const json = await res.json();

      if (json.success) {
        localStorage.setItem('employeeUser', JSON.stringify(json.data));
        router.push('/employee/dashboard');
      } else {
        setError(json.error || 'OTP verification failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setStep('email');
    setSessionId(null);
    setOtpExpiresAt(null);
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
                  Use your @asija.in email to receive a {HR_OTP_TTL_MINUTES}-minute OTP.
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
                      <span className="text-rose-400">
                        OTP expired — use Change email below to request a new code.
                      </span>
                    ) : (
                      <>
                        Valid for {HR_OTP_TTL_MINUTES} minutes · expires in{' '}
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
              disabled={loading || (step === 'otp' && (otp.trim().length !== 6 || otpExpired))}
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
              <button
                type="button"
                onClick={handleChangeEmail}
                className="w-full text-sm text-zinc-400 transition-colors hover:text-emerald-400"
              >
                Change email
              </button>
            )}
          </form>

          <div className="mt-6 border-t border-zinc-800 pt-6">
            <Link
              href="/"
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

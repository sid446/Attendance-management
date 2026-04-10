"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ArrowRight, Loader2 } from 'lucide-react';

export default function EmployeeLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/employee/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const json = await res.json();

      if (json.success) {
        localStorage.setItem('employeeUser', JSON.stringify(json.data));
        router.push('/employee/dashboard');
      } else {
        setError(json.error || 'Login failed');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
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
          <form onSubmit={handleLogin} className="space-y-6">
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
                  placeholder="name@company.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-3 pl-10 pr-4 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600/40"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/25 bg-rose-950/40 p-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

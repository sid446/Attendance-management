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
        // Store user info in localStorage (Simplified "Session")
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-slate-950 p-6 border-b border-slate-800 text-center">
           <h1 className="text-2xl font-bold text-white mb-2">Employee Portal</h1>
           <p className="text-slate-400 text-sm">Access your attendance and profile</p>
        </div>
        
        <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input 
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                          required
                        />
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm">
                        {error}
                    </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Signing in...
                      </>
                  ) : (
                      <>
                        Sign In <ArrowRight className="w-5 h-5" />
                      </>
                  )}
                </button>
            </form>
        </div>
      </div>
    </div>
  );
}

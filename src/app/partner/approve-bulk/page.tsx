'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function ApproveBulkContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');
  
  const [remark, setRemark] = useState('');
  const [value, setValue] = useState('1'); // Default to 1
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (idsParam) {
        setIds(idsParam.split(','));
    }
  }, [idsParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ids.length === 0) {
        setError('No Request IDs found to process.');
        return;
    }
    
    setLoading(true);
    setError('');
    
    try {
        const res = await fetch('/api/partner/approve-bulk-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids,
                remark,
                value: parseFloat(value)
            })
        });
        
        if (res.ok) {
            setSubmitted(true);
        } else {
            const txt = await res.text();
            setError(txt || 'Failed to process requests.');
        }
    } catch (err) {
        setError('An error occurred during submission.');
    } finally {
        setLoading(false);
    }
  };

  if (submitted) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 font-sans">
            <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md text-center">
                 <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
                    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                 </div>
                 <h1 className="text-2xl font-bold text-gray-900 mb-2">Success!</h1>
                 <p className="text-gray-600">
                    <strong>{ids.length}</strong> request{ids.length !== 1 ? 's' : ''} have been approved.
                 </p>
                 <div className="mt-4 p-4 bg-gray-50 rounded text-left text-sm">
                    <p><strong>Value Applied:</strong> {value}</p>
                    <p><strong>Remark:</strong> {remark}</p>
                 </div>
                 <p className="text-sm text-gray-500 mt-6">You can close this window now.</p>
            </div>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Bulk Approve Requests</h1>
        <p className="text-center text-gray-600 mb-6 text-sm">
            You are about to approve <strong>{ids.length}</strong> request{ids.length !== 1 ? 's' : ''}.
        </p>

        {ids.length === 0 ? (
            <div className="bg-yellow-50 text-yellow-800 p-4 rounded text-center">
                No valid Request IDs found in the link.
            </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Attendance Value (0 - 1)
                </label>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. 1.0, 0.75, 0.5"
                />
                <p className="text-xs text-gray-500 mt-1">
                    Typically: <strong>1</strong> = Present, <strong>0.75</strong> = Half Day, <strong>0</strong> = Leave/Absent
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remark (Applied to all)
                </label>
                <textarea
                    required
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Please provide a remark..."
                />
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} 
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
                {loading ? 'Processing...' : 'Confirm Approval'}
            </button>
        </form>
        )}
      </div>
    </div>
  );
}

export default function Page() {
    return (
        <Suspense fallback={<div className="p-10 text-center">Loading interface...</div>}>
            <ApproveBulkContent />
        </Suspense>
    );
}

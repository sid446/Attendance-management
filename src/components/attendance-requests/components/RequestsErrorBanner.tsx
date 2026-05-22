'use client';

import React from 'react';

export interface RequestsErrorBannerProps {
  message: string;
}

export const RequestsErrorBanner: React.FC<RequestsErrorBannerProps> = ({ message }) => (
  <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
    {message}
  </div>
);

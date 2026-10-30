'use client';

import React, { useState } from 'react';
import { hrCredentialsInit } from '@/lib/hrAuthHeaders';
import { DEFAULT_SERVICE_ADMIN_EMAIL } from '@/lib/hrServiceEmail';
import type { SettingsPanel } from '../types';
import { SETTINGS_CATEGORIES } from '../constants';

export function useHrConsoleSettingsSectionLogic() {
  const [panel, setPanel] = useState<SettingsPanel | null>(null);
  const [serviceEmail, setServiceEmail] = useState(DEFAULT_SERVICE_ADMIN_EMAIL);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requestOtp = async () => {
    setOtpLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/password/request-otp',
        hrCredentialsInit({ method: 'POST' })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to send OTP');
      }
      setSessionId(json.data.sessionId);
      setOtp('');
      const msg = json.data.message || `OTP sent to ${DEFAULT_SERVICE_ADMIN_EMAIL}`;
      setMessage(msg);
      const match = msg.match(/[\w.+-]+@[\w.-]+\.\w+/);
      if (match) setServiceEmail(match[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      setError('Request an OTP first');
      return;
    }
    setSaveLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        '/api/hr-console-settings/password/change',
        hrCredentialsInit({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            otp: otp.trim(),
            newPassword,
            confirmPassword,
          }),
        })
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to change password');
      }
      setMessage(json.data.message || 'Password updated');
      setSessionId(null);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setSaveLoading(false);
    }
  };

  const activeCategory = SETTINGS_CATEGORIES.find((item) => item.id === panel) ?? null;

  return {
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
  } as const;
}

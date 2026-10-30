import React from 'react';
import { CalendarClock, Clock, KeyRound, SlidersHorizontal } from 'lucide-react';
import type { SettingsPanel } from './types';

export const SETTINGS_CATEGORIES: {
  id: SettingsPanel;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'password',
    title: 'HR login password',
    description: 'Change the shared password used on the admin sign-in screen.',
    icon: KeyRound,
  },
  {
    id: 'presence',
    title: 'WFH and OSP day credit',
    description: 'Set how much credit work from home and outstation can carry, from a date.',
    icon: Clock,
  },
  {
    id: 'calculation',
    title: 'Attendance calculation rules',
    description: 'Extra hours, short hours, late arrival, and automatic half day.',
    icon: SlidersHorizontal,
  },
  {
    id: 'requestWindow',
    title: 'Request date window',
    description: 'Choose which dates employees can raise attendance requests for.',
    icon: CalendarClock,
  },
];

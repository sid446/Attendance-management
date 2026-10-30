'use client';

import { useEffect, useState } from 'react';
import type { DailySchedule } from '@/types/ui';
import { cloneDailySchedule, createDefaultDailySchedule } from '@/lib/defaultDailySchedule';
import type { ScheduleTemplateModalProps } from '../types';

export function useScheduleTemplateModalLogic({ isOpen, template }: Pick<ScheduleTemplateModalProps, 'isOpen' | 'template'>) {
  const [name, setName] = useState('');
  const [daily, setDaily] = useState<DailySchedule>(createDefaultDailySchedule());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (template) {
      setName(template.name);
      setDaily(cloneDailySchedule(template.daily));
    } else {
      setName('');
      setDaily(createDefaultDailySchedule());
    }
  }, [isOpen, template]);

  return {
    name,
    setName,
    daily,
    setDaily,
    mounted,
  } as const;
}

'use client';

import React from 'react';
import { Briefcase, Hash, Mail, Users } from 'lucide-react';
import type { User } from '@/types/ui';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface TeamMemberProfileCardProps {
  member: User;
  className?: string;
}

export function TeamMemberProfileCard({ member, className = '' }: TeamMemberProfileCardProps) {
  const employeeId = member.employeeCode?.trim() || member.odId?.trim() || '—';

  return (
    <div className={`flex items-start gap-4 ${className}`}>
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-background text-base font-semibold tracking-tight text-foreground ring-1 ring-border"
        aria-hidden
      >
        {initials(member.name)}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-lg font-semibold text-foreground">{member.name}</h3>
        {member.designation && (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">{member.designation}</span>
          </p>
        )}
        {member.team && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">{member.team}</span>
          </p>
        )}
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Email
            </dt>
            <dd className="truncate text-right text-foreground" title={member.email}>
              {member.email || '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">Attendance email</dt>
            <dd className="truncate text-right text-foreground" title={member.attendanceEmail}>
              {member.attendanceEmail || '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-3.5 w-3.5" aria-hidden />
              Code
            </dt>
            <dd className="font-mono text-xs text-foreground">{employeeId}</dd>
          </div>
          {member.workingUnderPartner && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Partner</dt>
              <dd className="truncate text-right text-foreground">{member.workingUnderPartner}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

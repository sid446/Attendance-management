"use client";

import type { TeamDailyUpdatesSectionProps } from './types';
import { useTeamDailyUpdatesSectionLogic } from './hooks';

export function TeamDailyUpdatesSection({
  viewerUserId,
  onSelectMember,
  showHeader = true,
  onLoaded,
}: TeamDailyUpdatesSectionProps) {
  const { periodSelection, body } = useTeamDailyUpdatesSectionLogic({
    viewerUserId,
    onSelectMember,
    showHeader,
    onLoaded,
  });

  if (!showHeader) {
    return (
      <div className="space-y-4">
        {periodSelection}
        {body}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-[inset_0_0_0_1px_rgba(147,197,253,0.18)]">
      <header className="border-b border-border bg-background/60 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Daily updates</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Who on your team is on leave, WFH, outstation, or has an approved or pending request
          for the selected dates (IST).
        </p>
        <div className="mt-4">{periodSelection}</div>
      </header>
      {body}
    </section>
  );
}

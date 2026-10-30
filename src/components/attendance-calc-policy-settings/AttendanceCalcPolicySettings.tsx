'use client';

import React from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { BUILTIN_ATTENDANCE_CALC_POLICY, describeAttendanceCalcPolicy, policyChanges, policyVersionStatus } from '@/lib/attendanceCalcPolicy';
import { STATUS_CLASS, METHOD_OPTIONS, EDGE_OPTIONS, GRACE_STYLE_OPTIONS, SHORTFALL_OPTIONS, SHARE_OPTIONS, STATUS_LABEL } from './constants';
import { formatPolicyDate, edgeNeedsGrace } from './utils';
import { SentenceList, RuleGroup, SelectField, NumberField, SwitchField, TimeField } from './components';
import { useAttendanceCalcPolicySettingsLogic } from './hooks';

export const AttendanceCalcPolicySettings: React.FC = () => {
  const {
    loading,
    saving,
    error,
    message,
    versions,
    today,
    draft,
    effectiveFrom,
    setEffectiveFrom,
    openId,
    setOpenId,
    inUseVersion,
    inUseSentences,
    history,
    setField,
    save,
    remove,
    previousFor,
  } = useAttendanceCalcPolicySettingsLogic();

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900">Attendance calculation rules</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Extra hours, short hours, late arrival, and automatic half day. Saving adds a new version from a date.
        It does not rewrite older versions. Summary and Daywise use the version in force on each day.
        A half-day or absent mark already saved on a day stays until that day is saved again.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}
      {message && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading rules
        </div>
      ) : (
        <>
          <section className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-900">In use today</h4>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS['in-use']}`}>
                In use
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {inUseVersion
                ? `From ${formatPolicyDate(inUseVersion.effectiveFrom)}.`
                : 'Original rules, in use from the start. Nothing has replaced them yet.'}
            </p>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extra and short hours</p>
                <SentenceList lines={inUseSentences.extra} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late arrival</p>
                <SentenceList lines={inUseSentences.late} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Automatic half day</p>
                <SentenceList lines={inUseSentences.half} />
              </div>
            </div>
          </section>

          <form onSubmit={(e) => void save(e)} className="mt-6 space-y-4">
            <h4 className="text-sm font-semibold text-slate-900">Schedule a change</h4>
            <p className="text-sm text-slate-600">
              The form starts as a copy of the rules in use today. Set the date this new version should start.
              Days before that date stay on the older version.
            </p>

            <RuleGroup title="Articles — extra and short hours">
              <SelectField
                label="How to compare the day"
                hint="Separately looks at coming in early and leaving late. Duration looks at the whole worked length."
                value={draft.articleExcessStyle}
                options={METHOD_OPTIONS}
                onChange={(value) => setField('articleExcessStyle', value)}
              />
              {draft.articleExcessStyle === 'edges' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Coming in early"
                    hint="Before the scheduled in time."
                    value={draft.articleEarlyInStyle}
                    options={EDGE_OPTIONS}
                    onChange={(value) => setField('articleEarlyInStyle', value)}
                  />
                  {edgeNeedsGrace(draft.articleEarlyInStyle) && (
                    <NumberField
                      label="Early grace (minutes)"
                      hint="Used by the early-arrival choice above."
                      value={draft.articleEarlyInGraceMinutes}
                      min={0}
                      max={720}
                      step={1}
                      onChange={(value) => setField('articleEarlyInGraceMinutes', value)}
                    />
                  )}
                  <SelectField
                    label="Leaving late"
                    hint="After the scheduled out time."
                    value={draft.articleLateOutStyle}
                    options={EDGE_OPTIONS}
                    onChange={(value) => setField('articleLateOutStyle', value)}
                  />
                  {edgeNeedsGrace(draft.articleLateOutStyle) && (
                    <NumberField
                      label="Late-out grace (minutes)"
                      hint="Used by the late-leaving choice above."
                      value={draft.articleLateOutGraceMinutes}
                      min={0}
                      max={720}
                      step={1}
                      onChange={(value) => setField('articleLateOutGraceMinutes', value)}
                    />
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Grace (minutes)"
                    hint="0 means every minute counts."
                    value={draft.articleDurationGraceMinutes}
                    min={0}
                    max={720}
                    step={1}
                    onChange={(value) => setField('articleDurationGraceMinutes', value)}
                  />
                  <SelectField
                    label="When the difference is larger than the grace"
                    hint="Applies to extra time and to a short day that counts in full."
                    value={draft.articleDurationGraceStyle}
                    options={GRACE_STYLE_OPTIONS}
                    onChange={(value) => setField('articleDurationGraceStyle', value)}
                  />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="A short day"
                  hint="Used when worked time is less than the schedule. Early and late minutes are not added on top."
                  value={draft.articleShortfallStyle}
                  options={SHORTFALL_OPTIONS}
                  onChange={(value) => setField('articleShortfallStyle', value)}
                />
                {draft.articleShortfallStyle === 'only-beyond' && (
                  <NumberField
                    label="Short-day grace (minutes)"
                    hint="Only the minutes past this grace count."
                    value={draft.articleShortfallGraceMinutes}
                    min={0}
                    max={720}
                    step={1}
                    onChange={(value) => setField('articleShortfallGraceMinutes', value)}
                  />
                )}
              </div>
            </RuleGroup>

            <RuleGroup title="Staff — extra and short hours">
              <SelectField
                label="How to compare the day"
                hint="Duration is the usual staff rule. Separately uses early arrival and late leaving."
                value={draft.staffExcessStyle}
                options={METHOD_OPTIONS}
                onChange={(value) => setField('staffExcessStyle', value)}
              />
              {draft.staffExcessStyle === 'duration' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Grace (minutes)"
                    hint="Differences within this many minutes count as zero."
                    value={draft.staffGraceMinutes}
                    min={0}
                    max={720}
                    step={1}
                    onChange={(value) => setField('staffGraceMinutes', value)}
                  />
                  <SelectField
                    label="When the difference is larger than the grace"
                    hint="A larger difference can count in full, or only the minutes past the grace."
                    value={draft.staffGraceStyle}
                    options={GRACE_STYLE_OPTIONS}
                    onChange={(value) => setField('staffGraceStyle', value)}
                  />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Coming in early"
                    hint="Before the scheduled in time."
                    value={draft.staffEarlyInStyle}
                    options={EDGE_OPTIONS}
                    onChange={(value) => setField('staffEarlyInStyle', value)}
                  />
                  {edgeNeedsGrace(draft.staffEarlyInStyle) && (
                    <NumberField
                      label="Early grace (minutes)"
                      hint="Used by the early-arrival choice above."
                      value={draft.staffEarlyInGraceMinutes}
                      min={0}
                      max={720}
                      step={1}
                      onChange={(value) => setField('staffEarlyInGraceMinutes', value)}
                    />
                  )}
                  <SelectField
                    label="Leaving late"
                    hint="After the scheduled out time."
                    value={draft.staffLateOutStyle}
                    options={EDGE_OPTIONS}
                    onChange={(value) => setField('staffLateOutStyle', value)}
                  />
                  {edgeNeedsGrace(draft.staffLateOutStyle) && (
                    <NumberField
                      label="Late-out grace (minutes)"
                      hint="Used by the late-leaving choice above."
                      value={draft.staffLateOutGraceMinutes}
                      min={0}
                      max={720}
                      step={1}
                      onChange={(value) => setField('staffLateOutGraceMinutes', value)}
                    />
                  )}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="A short day"
                  hint="When duration is selected and the short day counts in full, the grace above is used instead."
                  value={draft.staffShortfallStyle}
                  options={SHORTFALL_OPTIONS}
                  onChange={(value) => setField('staffShortfallStyle', value)}
                />
                {draft.staffShortfallStyle === 'only-beyond' && (
                  <NumberField
                    label="Short-day grace (minutes)"
                    hint="Only the minutes past this grace count."
                    value={draft.staffShortfallGraceMinutes}
                    min={0}
                    max={720}
                    step={1}
                    onChange={(value) => setField('staffShortfallGraceMinutes', value)}
                  />
                )}
              </div>
              <SwitchField
                label="Interns follow the article rules"
                hint="Off means interns follow the staff rules."
                checked={draft.internUsesArticleRules}
                onChange={(checked) => setField('internUsesArticleRules', checked)}
              />
            </RuleGroup>

            <RuleGroup title="Half days, leave, and remote days">
              <SelectField
                label="Scheduled hours on a half day"
                hint="Used when extra and short hours are calculated for a half day."
                value={String(draft.halfDayScheduledShare)}
                options={SHARE_OPTIONS}
                onChange={(value) => setField('halfDayScheduledShare', Number(value))}
              />
              <SwitchField
                label="Leave has no extra or short"
                hint="Approved extra work on a leave day is also left out."
                checked={draft.zeroExcessOnLeave}
                onChange={(checked) => setField('zeroExcessOnLeave', checked)}
              />
              <SwitchField
                label="Absent has no extra or short"
                hint="Approved extra work on an absent day is also left out."
                checked={draft.zeroExcessOnAbsent}
                onChange={(checked) => setField('zeroExcessOnAbsent', checked)}
              />
              <SwitchField
                label="Sunday has no punch extra or short"
                hint="Punch hours on a Sunday stay at zero when this is on."
                checked={draft.zeroExcessOnSunday}
                onChange={(checked) => setField('zeroExcessOnSunday', checked)}
              />
              <SwitchField
                label="A holiday has no punch extra or short"
                hint="Punch hours on a company holiday stay at zero when this is on."
                checked={draft.zeroExcessOnHoliday}
                onChange={(checked) => setField('zeroExcessOnHoliday', checked)}
              />
              <SwitchField
                label="A week off has no punch extra or short"
                hint="Punch hours on a week off stay at zero when this is on."
                checked={draft.zeroExcessOnWeekoff}
                onChange={(checked) => setField('zeroExcessOnWeekoff', checked)}
              />
              <SwitchField
                label="Approved extra work still counts on Sunday, holiday, and week off"
                hint="Leave and absent stay at zero when those switches are on."
                checked={draft.countApprovedExtraOnOffDays}
                onChange={(checked) => setField('countApprovedExtraOnOffDays', checked)}
              />
              <SwitchField
                label="Work from home has no hour extra or short"
                hint="Day credit for those days is set under WFH and OSP day credit."
                checked={draft.zeroExcessOnWfh}
                onChange={(checked) => setField('zeroExcessOnWfh', checked)}
              />
              <SwitchField
                label="Outstation has no hour extra or short"
                hint="Day credit for those days is set under WFH and OSP day credit."
                checked={draft.zeroExcessOnOsp}
                onChange={(checked) => setField('zeroExcessOnOsp', checked)}
              />
            </RuleGroup>

            <RuleGroup title="Late arrival">
              <SwitchField
                label="A late check-in can mark a half day"
                hint="From the half-day time until the absent time."
                checked={draft.lateHalfDayEnabled}
                onChange={(checked) => setField('lateHalfDayEnabled', checked)}
              />
              <SwitchField
                label="A late check-in can mark the day absent"
                hint="At or after the absent time."
                checked={draft.lateAbsentEnabled}
                onChange={(checked) => setField('lateAbsentEnabled', checked)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TimeField
                  label="Half day from"
                  hint="Check-in at or after this time, and before the absent time."
                  value={draft.lateCheckinHalfDayStart}
                  onChange={(value) => setField('lateCheckinHalfDayStart', value)}
                />
                <TimeField
                  label="Absent from"
                  hint="Check-in at or after this time."
                  value={draft.lateCheckinAbsentFrom}
                  onChange={(value) => setField('lateCheckinAbsentFrom', value)}
                />
              </div>
              <SwitchField
                label="Half-time employees are included"
                hint="Off means half-time employees skip these late check-in rules."
                checked={draft.lateRulesForHalftime}
                onChange={(checked) => setField('lateRulesForHalftime', checked)}
              />
              <SwitchField
                label="Articles use their own late check-in times"
                hint="Off means articles use the times above."
                checked={draft.separateArticleLateWindow}
                onChange={(checked) => setField('separateArticleLateWindow', checked)}
              />
              {draft.separateArticleLateWindow && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <TimeField
                    label="Articles, half day from"
                    hint="Article check-in at or after this time, and before their absent time."
                    value={draft.articleLateCheckinHalfDayStart}
                    onChange={(value) => setField('articleLateCheckinHalfDayStart', value)}
                  />
                  <TimeField
                    label="Articles, absent from"
                    hint="Article check-in at or after this time."
                    value={draft.articleLateCheckinAbsentFrom}
                    onChange={(value) => setField('articleLateCheckinAbsentFrom', value)}
                  />
                </div>
              )}
            </RuleGroup>

            <RuleGroup title="Automatic half day">
              <SwitchField
                label="Full-time: short hours mark a half day"
                hint="When worked hours are below the limit."
                checked={draft.fulltimeAutoHalfDayEnabled}
                onChange={(checked) => setField('fulltimeAutoHalfDayEnabled', checked)}
              />
              {draft.fulltimeAutoHalfDayEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Full-time, below (hours)"
                    hint="Worked hours under this mark a half day."
                    value={draft.fulltimeAutoHalfDayHours}
                    min={0}
                    max={24}
                    step={0.5}
                    onChange={(value) => setField('fulltimeAutoHalfDayHours', value)}
                  />
                  <SwitchField
                    label="Never above that day’s own schedule"
                    hint="A shorter scheduled day is not marked half just because it is under the hour limit."
                    checked={draft.fulltimeCapAtSchedule}
                    onChange={(checked) => setField('fulltimeCapAtSchedule', checked)}
                  />
                </div>
              )}
              <SwitchField
                label="Full-time: a late check-in also marks a half day"
                hint="Separate from the late-arrival window above."
                checked={draft.fulltimeAlsoAfterCheckin}
                onChange={(checked) => setField('fulltimeAlsoAfterCheckin', checked)}
              />
              {draft.fulltimeAlsoAfterCheckin && (
                <TimeField
                  label="Full-time, check-in from"
                  hint="A check-in at or after this time marks a half day."
                  value={draft.fulltimeAutoHalfDayFrom}
                  onChange={(value) => setField('fulltimeAutoHalfDayFrom', value)}
                />
              )}
              <SwitchField
                label="Articles: a late check-in marks a half day"
                hint="Uses the article check-in time below."
                checked={draft.articleAutoHalfDayByTime}
                onChange={(checked) => setField('articleAutoHalfDayByTime', checked)}
              />
              {draft.articleAutoHalfDayByTime && (
                <TimeField
                  label="Articles, check-in from"
                  hint="A check-in at or after this time marks a half day."
                  value={draft.articleAutoHalfDayFrom}
                  onChange={(value) => setField('articleAutoHalfDayFrom', value)}
                />
              )}
              <SwitchField
                label="Articles: short hours mark a half day"
                hint="Uses the article hour limit below."
                checked={draft.articleAutoHalfDayByHours}
                onChange={(checked) => setField('articleAutoHalfDayByHours', checked)}
              />
              {draft.articleAutoHalfDayByHours && (
                <NumberField
                  label="Articles, below (hours)"
                  hint="Worked hours under this mark a half day."
                  value={draft.articleAutoHalfDayBelowHours}
                  min={0}
                  max={24}
                  step={0.5}
                  onChange={(value) => setField('articleAutoHalfDayBelowHours', value)}
                />
              )}
              <SwitchField
                label="One punch marks a half day"
                hint="When check-in or check-out is missing, and the other is present."
                checked={draft.singlePunchIsHalfDay}
                onChange={(checked) => setField('singlePunchIsHalfDay', checked)}
              />
              <SwitchField
                label="Leave scheduled half days alone"
                hint="When the schedule day is already a half day, hour rules do not mark it again."
                checked={draft.skipScheduledHalfDay}
                onChange={(checked) => setField('skipScheduledHalfDay', checked)}
              />
            </RuleGroup>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-end">
              <label className="block text-xs font-medium text-slate-600 sm:w-56">
                Effective from
                <input
                  type="date"
                  required
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </label>
              <button
                type="submit"
                disabled={saving || !effectiveFrom}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                Save new version
              </button>
            </div>
          </form>

          <section className="mt-8">
            <h4 className="text-sm font-semibold text-slate-900">History</h4>
            <p className="mt-1 text-sm text-slate-600">
              Newest first. In use is the version for today. Scheduled starts later. Earlier versions stay so past months do not change.
            </p>
            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
              {history.map((version) => {
                const status = policyVersionStatus(version.effectiveFrom, versions, today);
                const changes = policyChanges(version, previousFor(version));
                const sentences = describeAttendanceCalcPolicy(version);
                const open = openId === version._id;
                return (
                  <li key={version._id || version.effectiveFrom} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : version._id || version.effectiveFrom)}
                        className="text-left text-sm font-medium text-slate-900"
                      >
                        From {formatPolicyDate(version.effectiveFrom)}
                        <span className="ml-2 font-normal text-slate-500">
                          {open ? 'Hide' : 'Show'} details
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                        {status === 'scheduled' && version._id && (
                          <button
                            type="button"
                            onClick={() => void remove(version._id!)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {version.updatedBy ? `Saved by ${version.updatedBy}` : 'Saved'}
                      {version.createdAt
                        ? ` on ${new Date(version.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
                        : ''}
                    </p>
                    {open && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What changed</p>
                          {changes.length === 0 ? (
                            <p className="mt-1 text-sm text-slate-600">Same rules as the version before it.</p>
                          ) : (
                            <SentenceList lines={changes} />
                          )}
                        </div>
                        <div className="grid gap-3 lg:grid-cols-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extra and short</p>
                            <SentenceList lines={sentences.extra} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late arrival</p>
                            <SentenceList lines={sentences.late} />
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Automatic half day</p>
                            <SentenceList lines={sentences.half} />
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              <li className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === 'builtin' ? null : 'builtin')}
                    className="text-left text-sm font-medium text-slate-900"
                  >
                    Original rules
                    <span className="ml-2 font-normal text-slate-500">
                      {openId === 'builtin' ? 'Hide' : 'Show'} details
                    </span>
                  </button>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      STATUS_CLASS[inUseVersion ? 'earlier' : 'in-use']
                    }`}
                  >
                    {inUseVersion ? 'Earlier' : 'In use'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">From the start, until the first saved version.</p>
                {openId === 'builtin' && (
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Extra and short</p>
                      <SentenceList lines={describeAttendanceCalcPolicy(BUILTIN_ATTENDANCE_CALC_POLICY).extra} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Late arrival</p>
                      <SentenceList lines={describeAttendanceCalcPolicy(BUILTIN_ATTENDANCE_CALC_POLICY).late} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Automatic half day</p>
                      <SentenceList lines={describeAttendanceCalcPolicy(BUILTIN_ATTENDANCE_CALC_POLICY).half} />
                    </div>
                  </div>
                )}
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
};

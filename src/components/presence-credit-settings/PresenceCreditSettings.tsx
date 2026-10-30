'use client';

import React from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { PresenceCreditKind, PresenceCreditScope } from '@/lib/presenceCredit';
import { scopeLabel } from './utils';
import { usePresenceCreditSettingsLogic } from './hooks';

export const PresenceCreditSettings: React.FC = () => {
  const {
    loading,
    saving,
    error,
    message,
    rules,
    teams,
    people,
    kind,
    setKind,
    scope,
    setScope,
    credit,
    setCredit,
    effectiveFrom,
    setEffectiveFrom,
    team,
    setTeam,
    selectedIds,
    personQuery,
    setPersonQuery,
    filteredPeople,
    togglePerson,
    addRule,
    removeRule,
  } = usePresenceCreditSettingsLogic();

  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900">WFH and OSP day credit</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Set the credit partners may approve for work from home and outstation or onsite presence, from a date.
        A more specific rule (one person, then a custom list, then a team, then articles or staff, then everyone)
        overrides a wider one. With no rule, WFH is 0.75, and from 1 Oct 2026 it is 0.5 for articles and interns. Employees stay at 0.75. OSP stays 1.2 for articles and 1 for staff.
        Client place stays at 1. Saving or removing a rule brings days that are above the new limit down to it, from that date.
        A day already within the limit is left as it was. HR can still change one day afterwards, up to 1.2.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading rules
        </div>
      ) : (
        <>
          <form onSubmit={(e) => void addRule(e)} className="mt-5 space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs font-medium text-slate-600">
                Type
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as PresenceCreditKind)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="wfh">WFH</option>
                  <option value="osp">OSP (outstation / onsite)</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Credit (0 to 1.2)
                <input
                  type="number"
                  min={0}
                  max={1.2}
                  step={0.05}
                  value={credit}
                  onChange={(e) => setCredit(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Applies to
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as PresenceCreditScope)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                >
                  <option value="everyone">Everyone</option>
                  <option value="articles">Articles only</option>
                  <option value="staff">Staff only</option>
                  <option value="team">One team</option>
                  <option value="people">Selected people</option>
                </select>
              </label>
            </div>

            {scope === 'team' && (
              <label className="block max-w-sm text-xs font-medium text-slate-600">
                Team
                {teams.length > 0 ? (
                  <select
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                  >
                    <option value="">Choose a team</option>
                    {teams.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    required
                    placeholder="Team name"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                  />
                )}
              </label>
            )}

            {scope === 'people' && (
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  People
                  <input
                    value={personQuery}
                    onChange={(e) => setPersonQuery(e.target.value)}
                    placeholder="Search name, team, or code"
                    className="mt-1 w-full max-w-md rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                  />
                </label>
                <div className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white">
                  {filteredPeople.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-500">No people match.</p>
                  ) : (
                    filteredPeople.map((person) => (
                      <label key={person._id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-sm text-slate-800 last:border-0">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(person._id)}
                          onChange={() => togglePerson(person._id)}
                        />
                        <span>
                          {person.name}
                          {person.team ? <span className="text-slate-500"> · {person.team}</span> : null}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedIds.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">{selectedIds.length} selected</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              Add rule
            </button>
          </form>

          <div className="mt-5 overflow-x-auto">
            {rules.length === 0 ? (
              <p className="text-sm text-slate-500">No rules yet. Built-in credits stay in force.</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">From</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Credit</th>
                    <th className="py-2 pr-3 font-medium">Who</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule._id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 text-slate-800">{rule.effectiveFrom}</td>
                      <td className="py-2 pr-3 text-slate-800">{rule.kind === 'wfh' ? 'WFH' : 'OSP'}</td>
                      <td className="py-2 pr-3 text-slate-800">{rule.credit}</td>
                      <td className="py-2 pr-3 text-slate-700">{scopeLabel(rule, people)}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void removeRule(rule._id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}
      {message && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>
      )}
    </div>
  );
};

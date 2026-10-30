import React from 'react';
import { Search, Download, Loader2, Newspaper, CreditCard, Award, Settings } from 'lucide-react';
import { ARTICLE_CREDITS_WORKFLOW_STEPS } from './constants';
import { useArticleCreditsManagerLogic } from './hooks';

export const ArticleCreditsManager: React.FC = () => {
  const {
    rows,
    loading,
    range,
    setRange,
    search,
    setSearch,
    setSortField,
    sortDir,
    setSortDir,
    showRangeModal,
    setShowRangeModal,
    showCalcModal,
    setShowCalcModal,
    calcRow,
    setCalcRow,
    config,
    showRuleModal,
    setShowRuleModal,
    stats,
    sortedRows,
    handleExport,
    RangeModal,
    CalculationModal,
    RuleSettingsModal,
    periodBtnOn,
    periodBtnOff,
    periodBtnCustomOn,
    thBase,
    thRight,
    tdMono,
  } = useArticleCreditsManagerLogic();

  return (
    <section className="space-y-5 text-slate-900" aria-labelledby="article-credits-heading">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h2 id="article-credits-heading" className="text-lg font-semibold text-slate-900 sm:text-xl">
            Article credits
          </h2>
          <button
            type="button"
            onClick={() => setShowRuleModal(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            title="Edit the article credit rule settings"
          >
            <Settings className="h-4 w-4 text-slate-600" aria-hidden />
            Rule settings
          </button>
        </div>
        <p className="max-w-3xl text-sm text-slate-600">
          Credits for <span className="font-medium text-slate-800">Article</span> category staff: base credit from
          master data, leave after {config.cutoffMonth}, and excess hours from {config.cutoffMonth} onward (by selected attendance period).
        </p>
        <p className="max-w-3xl text-xs text-slate-500">
          Current rule: cutoff <span className="font-mono">{config.cutoffMonth}</span>, weekday hours{' '}
          {config.weekdayHoursMode === 'fixed'
            ? `fixed ${config.defaultWeekdayHours}h`
            : `from schedule (default ${config.defaultWeekdayHours}h)`}
          {config.floorFinalCreditAtZero ? ', floored at 0' : ''}.
        </p>
        <ol className="flex list-none flex-wrap gap-2 text-xs text-slate-700" aria-label="Article credits workflow">
          {ARTICLE_CREDITS_WORKFLOW_STEPS.map((t, i) => (
            <li
              key={t}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
      </header>

      <div className="flex flex-col gap-4 rounded-xl border border-blue-200/65 bg-panel p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium text-slate-600">Attendance period (for excess totals)</span>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex flex-wrap gap-1 rounded-lg border border-blue-200/65 bg-panel p-0.5 shadow-sm"
              role="group"
              aria-label="Period preset"
            >
              <button
                type="button"
                className={!range.start && !range.end ? periodBtnOn : periodBtnOff}
                onClick={() => setRange({ start: '', end: '' })}
              >
                All
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === ym && range.end === ym;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start: ym, end: ym });
                }}
              >
                Current month
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === start && range.end === end;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start, end });
                }}
              >
                Last 3 months
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === start && range.end === end;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start, end });
                }}
              >
                Last 6 months
              </button>
              <button
                type="button"
                className={
                  (() => {
                    const now = new Date();
                    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
                    const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                    return range.start === start && range.end === end;
                  })()
                    ? periodBtnOn
                    : periodBtnOff
                }
                onClick={() => {
                  const now = new Date();
                  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
                  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
                  setRange({ start, end });
                }}
              >
                Last 12 months
              </button>
              <button
                type="button"
                className={
                  range.start && range.end && range.start !== range.end ? periodBtnCustomOn : periodBtnOff
                }
                onClick={() => setShowRangeModal(true)}
              >
                Custom
              </button>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {range.start && range.end ? `${range.start} → ${range.end}` : 'All months'}
            </span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto md:max-w-md">
          <label htmlFor="article-credits-search" className="sr-only">
            Search by name or employee ID
          </label>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              id="article-credits-search"
              type="search"
              placeholder="Search by name or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-blue-200/65 bg-panel py-2 pl-10 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue-200/65 bg-panel px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Export article credits to Excel"
          >
            <Download className="h-4 w-4 text-slate-600" aria-hidden />
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
            <Newspaper className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{stats.totalArticles}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Article employees</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700">
            <CreditCard className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{stats.sumCredits}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sum credits (1 Jan 26)</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Award className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{stats.sumFinalCredits.toFixed(2)}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sum final credits</div>
          </div>
        </div>
      </div>

      <section
        className="overflow-hidden rounded-xl border border-blue-200/65 bg-panel shadow-sm"
        aria-labelledby="article-credits-table-heading"
      >
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 id="article-credits-table-heading" className="text-sm font-semibold text-slate-900">
            Detail by employee
          </h3>
          <p className="text-xs text-slate-600">Click final credit to see the calculation breakdown.</p>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center text-slate-600">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
            <p role="status">Loading article credits…</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="px-4 py-14 text-center text-slate-600">
            <p>No article-category employees for this view, or no rows match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className={`${thBase} text-left`}
                    onClick={() => {
                      setSortField('empId');
                      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                    }}
                  >
                    Emp ID
                  </th>
                  <th
                    scope="col"
                    className={`${thBase} text-left text-slate-600`}
                    onClick={() => {
                      setSortField('name');
                      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                    }}
                  >
                    Name
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('creditAsOnJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Credit (1 Jan 26)
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('leaveTakenBeforeJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Leave before 1 Jan 2026
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('leaveTakenAfterJan26'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Leave on/after 1 Jan 2026
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('totalExcessHours'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Excess hours (Jan 2026+)
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('totalExcessDays'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Excess days (Jan 2026+)
                  </th>
                  <th scope="col" className={thRight} onClick={() => { setSortField('finalCredit'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }}>
                    Final credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-200 transition-colors hover:bg-slate-50/90">
                    <td className="px-4 py-3 text-left font-mono text-xs text-slate-600">{row.empId}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                    <td className={`${tdMono} text-blue-800`}>{row.creditAsOnJan26}</td>
                    <td className={`${tdMono} text-rose-800`}>{row.leaveTakenBeforeJan26}</td>
                    <td className={`${tdMono} text-sky-800`}>{row.leaveTakenAfterJan26}</td>
                    <td className={`${tdMono} text-amber-900`}>{row.totalExcessHours}</td>
                    <td className={`${tdMono} text-orange-900`}>{row.totalExcessDays}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="font-mono text-sm font-semibold tabular-nums text-emerald-800 underline decoration-dotted underline-offset-2 transition-colors hover:text-blue-800"
                        title="Show calculation"
                        onClick={() => {
                          setCalcRow(row);
                          setShowCalcModal(true);
                        }}
                      >
                        {row.finalCredit}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RangeModal isOpen={showRangeModal} onClose={() => setShowRangeModal(false)} />
      <CalculationModal row={calcRow} isOpen={showCalcModal} onClose={() => setShowCalcModal(false)} />
      <RuleSettingsModal isOpen={showRuleModal} onClose={() => setShowRuleModal(false)} />
    </section>
  );
};

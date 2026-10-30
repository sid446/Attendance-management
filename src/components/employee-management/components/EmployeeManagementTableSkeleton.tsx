export function EmployeeManagementTableSkeleton() {
  const rowCount = 8;
  return (
    <div className="overflow-x-auto" aria-busy="true" aria-label="Loading employees">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs font-medium uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3.5" scope="col">
              Employee
            </th>
            <th className="hidden px-4 py-3.5 md:table-cell" scope="col">
              Email
            </th>
            <th className="hidden px-4 py-3.5 lg:table-cell" scope="col">
              Team
            </th>
            <th className="hidden px-4 py-3.5 sm:table-cell" scope="col">
              Designation
            </th>
            <th className="hidden px-4 py-3.5 xl:table-cell" scope="col">
              Joined
            </th>
            <th className="hidden px-4 py-3.5 md:table-cell" scope="col">
              Status
            </th>
            <th className="px-4 py-3.5 text-right" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 animate-pulse">
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-sky-100/40' : 'bg-panel/80'}>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-xl bg-slate-200/80" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3.5 max-w-full w-36 rounded bg-slate-200" />
                    <div className="h-2.5 max-w-full w-24 rounded bg-slate-100" />
                  </div>
                </div>
              </td>
              <td className="hidden px-4 py-3.5 md:table-cell">
                <div className="h-3 w-40 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 lg:table-cell">
                <div className="h-3 w-28 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 sm:table-cell">
                <div className="h-3 w-24 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 xl:table-cell">
                <div className="h-3 w-20 rounded bg-slate-200" />
              </td>
              <td className="hidden px-4 py-3.5 md:table-cell">
                <div className="h-3 w-16 rounded bg-slate-200" />
              </td>
              <td className="px-4 py-3.5 text-right">
                <div className="ml-auto h-8 w-20 rounded-lg bg-slate-200" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

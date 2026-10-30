'use client';

export function SentenceList({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

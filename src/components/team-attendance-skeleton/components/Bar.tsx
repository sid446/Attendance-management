"use client";

export function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface ${className}`}
      aria-hidden
    />
  );
}

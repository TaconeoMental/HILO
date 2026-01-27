"use client";

export default function Timer({ mobileLabel, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-bg-surface-light bg-bg-surface/80 px-4 py-2 text-sm text-text-secondary lg:hidden">
      {mobileLabel}
    </div>
  );
}

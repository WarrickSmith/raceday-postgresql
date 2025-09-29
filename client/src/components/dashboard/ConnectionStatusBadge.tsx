'use client';

import { ConnectionState } from '@/hooks/useMeetingsPolling';

interface ConnectionStatusBadgeProps {
  state: ConnectionState;
  className?: string;
}

const STATE_STYLES: Record<ConnectionState, { dot: string; border: string; text: string; label: string }> = {
  connecting: {
    dot: 'bg-amber-400 animate-pulse',
    border: 'border-amber-300/70 bg-amber-50/50 text-amber-700',
    text: 'Connecting to data…',
    label: 'Connecting to RaceDay data',
  },
  connected: {
    dot: 'bg-emerald-400',
    border: 'border-emerald-300/70 bg-emerald-50/60 text-emerald-700',
    text: 'Connected',
    label: 'Connected to RaceDay data',
  },
  disconnected: {
    dot: 'bg-rose-500 animate-pulse',
    border: 'border-rose-300/70 bg-rose-50/60 text-rose-700',
    text: 'Disconnected',
    label: 'Disconnected from RaceDay data',
  },
};

function cx(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function ConnectionStatusBadge({ state, className }: ConnectionStatusBadgeProps) {
  const styles = STATE_STYLES[state];

  return (
    <div
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium shadow-sm transition-colors',
        styles.border,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cx('h-2.5 w-2.5 rounded-full', styles.dot)} aria-hidden="true" />
      <span>{styles.text}</span>
      <span className="sr-only">{styles.label}</span>
    </div>
  );
}

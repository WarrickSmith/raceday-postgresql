'use client';

import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { ConnectionState } from '@/hooks/useMeetingsPolling';

interface ConnectionStatusPanelProps {
  state: ConnectionState;
  retryCountdown: number | null;
  connectionAttempts: number;
  onRetry?: () => void;
}

const PANEL_COPY: Record<ConnectionState, { title: string; body: string; cta: string }> = {
  connecting: {
    title: 'Connecting to RaceDay data…',
    body: 'Hang tight while we establish a secure connection to the RaceDay database. This usually takes just a moment.',
    cta: 'Refresh connection',
  },
  connected: {
    title: 'RaceDay data is available',
    body: 'The connection has been restored and data updates will resume automatically.',
    cta: 'Refresh data',
  },
  disconnected: {
    title: 'RaceDay data connection unavailable',
    body: 'We could not reach the RaceDay database. We will retry automatically, or you can try again manually now.',
    cta: 'Retry connection',
  },
};

function formatCountdown(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }

  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  const formatted = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;

  return formatted;
}

export function ConnectionStatusPanel({ state, retryCountdown, connectionAttempts, onRetry }: ConnectionStatusPanelProps) {
  const copy = PANEL_COPY[state];
  const countdownLabel = formatCountdown(retryCountdown);
  const isRetryAvailable = typeof onRetry === 'function';

  return (
    <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white/70 p-8 text-center shadow-sm">
      <div className="max-w-xl space-y-6">
        <ConnectionStatusBadge state={state} className="mx-auto" />
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-slate-900">{copy.title}</h2>
          <p className="text-sm text-slate-600">{copy.body}</p>
        </div>

        {state !== 'connected' && (
          <div className="space-y-2 text-sm text-slate-500">
            <p>
              Automatic retry{connectionAttempts > 0 ? ' attempts continue' : ' begins'} in{' '}
              <span className="font-medium text-slate-700">
                {countdownLabel ?? 'a few moments'}
              </span>
              .
            </p>
            {connectionAttempts > 0 && (
              <p className="text-xs text-slate-400">
                Attempts so far: {connectionAttempts}
              </p>
            )}
          </div>
        )}

        {isRetryAvailable ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {copy.cta}
          </button>
        ) : (
          <p className="text-xs text-slate-400">Please wait while we finish the initial connection check.</p>
        )}
      </div>
    </div>
  );
}

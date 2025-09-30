'use client';

interface NoMeetingsPlaceholderProps {
  onRefresh: () => void;
}

export function NoMeetingsPlaceholder({ onRefresh }: NoMeetingsPlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center shadow-inner">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-8 w-8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V5a4 4 0 1 1 8 0v2m3 4v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6m14 0H5"
          />
        </svg>
      </div>
      <h3 className="mt-6 text-xl font-semibold text-slate-900">No Meeting Information is currently available</h3>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        We&apos;ll keep checking for new meetings and update this page automatically. You can also manually refresh the data below.
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="mt-6 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Re-check meetings data
      </button>
    </div>
  );
}

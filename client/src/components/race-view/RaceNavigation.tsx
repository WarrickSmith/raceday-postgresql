'use client'

import React, { memo } from 'react'
import { RaceNavigationData } from '@/types/meetings'

interface RaceNavigationProps {
  navigationData: RaceNavigationData
  currentRaceId?: string // Optional for future use
}

export const RaceNavigation = memo(function RaceNavigation({
  navigationData,
}: RaceNavigationProps) {



  // Enhanced button classes with consistent sizing, improved styling, and responsive scaling
  const buttonClasses =
    'flex items-center justify-center gap-2 px-3 py-2.5 w-full h-10 text-sm font-medium text-gray-700 bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:bg-gradient-to-b hover:from-gray-50 hover:to-gray-100 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-opacity-50 focus:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:bg-white disabled:from-white disabled:to-white transition-all duration-200 ease-in-out overflow-hidden whitespace-nowrap'

  return (
    <div
      className="grid grid-cols-4 gap-2 sm:gap-3 w-full"
      role="navigation"
      aria-label="Race navigation"
    >
      {/* Meetings Button */}
      <button
        className={buttonClasses}
        aria-label="Navigate back to meetings list"
      >
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"
          />
        </svg>
        <span className="truncate">Meetings</span>
      </button>

      {/* Next Scheduled Button */}
      <button
        className={buttonClasses}
        aria-label="Navigate to next scheduled race"
      >
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="truncate">Next Scheduled</span>
      </button>

      {/* Previous Race Button */}
      <button
        className={buttonClasses}
        aria-label="Navigate to previous race"
      >
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span className="truncate">Previous</span>
      </button>

      {/* Next Race Button */}
      <button
        className={buttonClasses}
        aria-label="Navigate to next race"
      >
        <span className="truncate">Next</span>
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

    </div>
  )
})

'use client'

import { useState, useEffect, useRef } from 'react'

interface FlashState {
  isFlashing: boolean
  flashType: 'increase' | 'decrease' | null
}

/**
 * Hook for creating color flash effects when values change
 * @param value - The value to track for changes
 * @param duration - Flash duration in milliseconds (default: 1000)
 * @returns Object with flash state and CSS classes
 */
export function useValueFlash<T>(
  value: T,
  duration: number = 1000
): FlashState & { flashClasses: string } {
  const [flashState, setFlashState] = useState<FlashState>({
    isFlashing: false,
    flashType: null,
  })
  const previousValueRef = useRef<T>(value)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const previousValue = previousValueRef.current
    const currentValue = value

    // Only flash if value actually changed and is a number
    if (
      previousValue !== currentValue &&
      typeof currentValue === 'number' &&
      typeof previousValue === 'number' &&
      !isNaN(currentValue) &&
      !isNaN(previousValue)
    ) {
      const flashType = currentValue > previousValue ? 'increase' : 'decrease'

      setFlashState({
        isFlashing: true,
        flashType,
      })

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Stop flashing after duration
      timeoutRef.current = setTimeout(() => {
        setFlashState({
          isFlashing: false,
          flashType: null,
        })
      }, duration)
    }

    previousValueRef.current = currentValue

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [value, duration])

  // Generate CSS classes based on flash state
  const flashClasses = flashState.isFlashing
    ? flashState.flashType === 'increase'
      ? 'bg-green-100 transition-all duration-1000 ease-out'
      : 'bg-red-100 transition-all duration-1000 ease-out'
    : 'transition-all duration-1000 ease-out'

  return {
    ...flashState,
    flashClasses,
  }
}
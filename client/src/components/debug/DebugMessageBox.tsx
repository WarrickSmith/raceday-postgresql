'use client'

import React, { useState, useEffect, useCallback } from 'react'

export interface DebugMessage {
  id: string
  timestamp: Date
  type: 'info' | 'warning' | 'success' | 'error'
  title: string
  message: string
  data?: unknown
}

interface DebugMessageBoxProps {
  messages: DebugMessage[]
  onDismiss: (id: string) => void
  onClear: () => void
  className?: string
}

export function DebugMessageBox({
  messages,
  onDismiss,
  onClear,
  className = '',
}: DebugMessageBoxProps) {
  const [isMinimized, setIsMinimized] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  // Auto-hide after 10 seconds if no new messages
  useEffect(() => {
    if (messages.length === 0) return

    const timer = setTimeout(() => {
      setIsVisible(false)
    }, 10000)

    return () => clearTimeout(timer)
  }, [messages])

  const getIcon = (type: DebugMessage['type']) => {
    switch (type) {
      case 'warning':
        return (
          <svg className="h-4 w-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 19c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'error':
        return (
          <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 19c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      case 'success':
        return (
          <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getTypeStyles = (type: DebugMessage['type']) => {
    switch (type) {
      case 'warning':
        return 'border-l-yellow-500 bg-yellow-50'
      case 'error':
        return 'border-l-red-500 bg-red-50'
      case 'success':
        return 'border-l-green-500 bg-green-50'
      default:
        return 'border-l-blue-500 bg-blue-50'
    }
  }

  if (!isVisible || messages.length === 0) return null

  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <div className="bg-white border border-gray-300 rounded-lg shadow-xl max-w-md w-96">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            <h3 className="font-semibold text-sm text-gray-800">
              Race Debug Messages ({messages.length})
            </h3>
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
              title={isMinimized ? 'Maximize' : 'Minimize'}
            >
              {isMinimized ? (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              )}
            </button>
            <button
              onClick={onClear}
              className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700 text-xs"
              title="Clear all messages"
            >
              Clear
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
              title="Close"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        {!isMinimized && (
          <div className="max-h-96 overflow-y-auto">
            {messages.slice(-5).map((msg) => (
              <div
                key={msg.id}
                className={`p-3 border-l-4 border-b border-gray-100 last:border-b-0 ${getTypeStyles(
                  msg.type
                )}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2 flex-1">
                    {getIcon(msg.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm text-gray-800 truncate">
                          {msg.title}
                        </p>
                        <span className="text-xs text-gray-500 ml-2">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 break-words">
                        {msg.message}
                      </p>
                      {msg.data && typeof msg.data === 'object' && msg.data !== null ? (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                            View details
                          </summary>
                          <pre className="text-xs text-gray-600 mt-1 bg-white p-2 rounded border overflow-x-auto">
                            {JSON.stringify(msg.data, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => onDismiss(msg.id)}
                    className="ml-2 p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="Dismiss"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {!isMinimized && messages.length > 5 && (
          <div className="p-2 text-center text-xs text-gray-500 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            Showing last 5 of {messages.length} messages
          </div>
        )}
      </div>
    </div>
  )
}

// Debug message manager hook
export function useDebugMessages() {
  const [messages, setMessages] = useState<DebugMessage[]>([])

  const addMessage = useCallback((
    type: DebugMessage['type'],
    title: string,
    message: string,
    data?: unknown
  ) => {
    const newMessage: DebugMessage = {
      id: `debug-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      title,
      message,
      data,
    }

    setMessages((prev) => [...prev, newMessage])
  }, [])

  const dismissMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id))
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    addMessage,
    dismissMessage,
    clearMessages,
  }
}

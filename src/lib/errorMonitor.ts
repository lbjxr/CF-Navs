// Lightweight production error monitoring.
// Classifies runtime errors, attaches structured metadata, patches
// console.error, and reports batches to /api/error-report via sendBeacon.

import { isApiError, isUnauthorizedError, type ApiError } from './api'

export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'data'
  | 'scripting'
  | 'unknown'

export type ClassifiedError = {
  category: ErrorCategory
  message: string
  stack?: string
  timestamp: number
  url?: string
  line?: number
  col?: number
}

export function classifyError(error: unknown): ClassifiedError {
  const timestamp = Date.now()

  if (isApiError(error)) {
    const apiError = error as ApiError
    const category: ErrorCategory = isUnauthorizedError(error) ? 'auth' : 'data'
    return {
      category,
      message: `API ${apiError.status} code=${apiError.code}: ${apiError.message}`,
      timestamp,
    }
  }

  if (error instanceof Error) {
    const message = error.message
    let category: ErrorCategory = 'scripting'

    if (/network|fetch|timeout|abort|connection/i.test(message)) {
      category = 'network'
    } else if (/unauthorized|token|session|login|auth/i.test(message)) {
      category = 'auth'
    } else if (/validation|schema|parse|invalid|format|missing/i.test(message)) {
      category = 'data'
    }

    return {
      category,
      message,
      stack: error.stack,
      timestamp,
    }
  }

  // Unhandled rejection with a non-Error value, or other unexpected types.
  let message = 'Unknown runtime error'
  try {
    message = String(error)
  } catch {
    // Keep the default message.
  }

  return {
    category: 'unknown',
    message,
    timestamp,
  }
}

export function formatLoggableError(entry: ClassifiedError): string {
  const parts: string[] = [`[${entry.category.toUpperCase()}] ${entry.message}`]
  if (entry.url) parts.push(`url=${entry.url}`)
  if (entry.line != null) parts.push(`line=${entry.line}`)
  if (entry.col != null) parts.push(`col=${entry.col}`)
  return parts.join(' ')
}

// --- Server reporting via /api/error-report ---

const REPORT_ENDPOINT = '/api/error-report'
const MAX_BATCH_SIZE = 10
const FLUSH_INTERVAL_MS = 10000
const MAX_REPORTS_PER_MINUTE = 60

let _batch: ClassifiedError[] = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null
let _reportCount = 0
let _reportWindowStart = 0

function resetRateWindow(): void {
  const now = Date.now()
  if (now - _reportWindowStart > 60_000) {
    _reportCount = 0
    _reportWindowStart = now
  }
}

function rateLimitAllows(): boolean {
  resetRateWindow()
  return _reportCount < MAX_REPORTS_PER_MINUTE
}

function flushBatch(): void {
  if (_flushTimer !== null) { clearTimeout(_flushTimer); _flushTimer = null }
  if (_batch.length === 0) return
  const batch = _batch.splice(0)
  sendBatch(batch)
}

function sendBatch(errors: ClassifiedError[]): void {
  _reportCount += 1
  const payload = JSON.stringify({ errors })
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(REPORT_ENDPOINT, new Blob([payload], { type: 'application/json' }))
    } else {
      fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Transport failures must never cascade.
      })
    }
  } catch {
    // Silently ignore transport failures — error reporting must never
    // cause additional errors.
  }
}

export function queueErrorForReport(entry: ClassifiedError): void {
  if (!rateLimitAllows()) return
  _batch.push(entry)
  if (_batch.length >= MAX_BATCH_SIZE) {
    flushBatch()
  } else if (_flushTimer === null) {
    _flushTimer = setTimeout(flushBatch, FLUSH_INTERVAL_MS)
  }
}

// --- Global runtime handlers ---

let _originalConsoleError: typeof console.error | null = null
let _globalHandlersRegistered = false

export function registerGlobalErrorHandlers(onError?: (entry: ClassifiedError) => void): void {
  if (_globalHandlersRegistered) return
  _globalHandlersRegistered = true

  const report = (entry: ClassifiedError) => {
    if (_originalConsoleError) {
      _originalConsoleError(formatLoggableError(entry))
    }
    onError?.(entry)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event: ErrorEvent) => {
      report({
        category: 'scripting',
        message: event.message || 'Uncaught script error',
        stack: event.error?.stack,
        timestamp: Date.now(),
        url: event.filename,
        line: event.lineno,
        col: event.colno,
      })
    })

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      report(classifyError(event.reason))
    })
  }
}

export function captureConsoleErrors(): void {
  if (_originalConsoleError) return
  _originalConsoleError = console.error

  console.error = (...args: unknown[]) => {
    // Forward to original console.error so browser DevTools and the
    // regression suite still see the output.
    _originalConsoleError?.(...args)
  }
}

// --- One-shot initialization ---

let _reportingInitialized = false

/**
 * Wires global error handlers, console-error capture, and batched server
 * reporting in a single call. Safe to call multiple times — subsequent
 * calls are no-ops.
 */
export function initErrorReporting(): void {
  if (_reportingInitialized) return
  _reportingInitialized = true

  registerGlobalErrorHandlers((entry) => {
    queueErrorForReport(entry)
  })
  captureConsoleErrors()
}

import type { AppContext } from './routeHelpers'

/** Durations only: never publish SQL, credentials or object fields in timing headers. */
export function appendServerTiming(c: AppContext, name: 'auth' | 'db' | 'serialize', startedAt: number, response?: Response): void {
  const duration = Math.max(0, performance.now() - startedAt)
  const metric = `${name};dur=${duration.toFixed(2)}`
  if (response) response.headers.append('Server-Timing', metric)
  else c.header('Server-Timing', metric, { append: true })
}

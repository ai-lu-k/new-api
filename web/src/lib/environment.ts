/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export type AppEnvironment = 'production' | 'staging'

const ENVIRONMENT_EVENT = 'new-api:environment-change'
const ENVIRONMENT_CHANNEL = 'new-api:environment'
const ENVIRONMENT_STORAGE = 'new-api:environment:event'
const ENVIRONMENT_RECOVERY_STORAGE = 'new-api:environment:recovery:v1'
const recoveryListeners = new Set<() => void>()
let recoveryBlocked = false
let reloadRequested = false
const source =
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function getAppEnvironment(): AppEnvironment {
  if (typeof document === 'undefined') return 'production'
  return document.querySelector<HTMLMetaElement>(
    'meta[name="new-api-environment"]'
  )?.content === 'staging'
    ? 'staging'
    : 'production'
}

export function getEnvironmentVersion(): string {
  if (typeof document === 'undefined') return ''
  return (
    document.querySelector<HTMLMetaElement>(
      'meta[name="new-api-environment-version"]'
    )?.content || ''
  )
}

export function getEnvironmentHeaders(): Record<string, string> {
  return { 'X-App-Environment': getAppEnvironment() }
}

export function isEnvironmentRecoveryBlocked(): boolean {
  return recoveryBlocked
}

export function subscribeEnvironmentRecovery(listener: () => void): () => void {
  recoveryListeners.add(listener)
  return () => recoveryListeners.delete(listener)
}

/** Stop background work until the user returns through the production control. */
export function blockEnvironmentRecovery(): void {
  if (reloadRequested || recoveryBlocked) return
  recoveryBlocked = true
  recoveryListeners.forEach((listener) => listener())
}

/** An explicit, successful environment switch starts a new recovery attempt. */
export function resetEnvironmentRecovery(): void {
  reloadRequested = false
  recoveryBlocked = false
  try {
    window.sessionStorage.removeItem(ENVIRONMENT_RECOVERY_STORAGE)
  } catch {
    // Recovery can still return through the server without browser storage.
  }
  recoveryListeners.forEach((listener) => listener())
}

/** Only a successful management response confirms that this document is usable. */
export function confirmEnvironmentRecovery(): void {
  if (reloadRequested || recoveryBlocked || typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.removeItem(ENVIRONMENT_RECOVERY_STORAGE)
  } catch {
    // Without persistent storage, conflicts stop instead of risking a loop.
  }
}

/** One automatic reload across document loads; requests are never replayed. */
export function requestEnvironmentReload(
  reason: 'conflict' | 'switch' = 'conflict'
): void {
  if (typeof window === 'undefined') return
  if (reason === 'switch') resetEnvironmentRecovery()
  if (reloadRequested || recoveryBlocked) return
  if (reason === 'conflict') {
    try {
      if (window.sessionStorage.getItem(ENVIRONMENT_RECOVERY_STORAGE)) {
        blockEnvironmentRecovery()
        return
      }
      window.sessionStorage.setItem(ENVIRONMENT_RECOVERY_STORAGE, 'pending')
    } catch {
      blockEnvironmentRecovery()
      return
    }
  }
  reloadRequested = true
  const event = new Event(ENVIRONMENT_EVENT, { cancelable: true })
  if (window.dispatchEvent(event)) window.location.reload()
}

export function publishEnvironmentChange(environment: AppEnvironment): void {
  const event = { environment, source, timestamp: Date.now() }
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(ENVIRONMENT_CHANNEL)
    channel.postMessage(event)
    channel.close()
    return
  }
  try {
    window.localStorage.setItem(ENVIRONMENT_STORAGE, JSON.stringify(event))
    window.localStorage.removeItem(ENVIRONMENT_STORAGE)
  } catch {
    // A subsequent API request also detects a stale environment server-side.
  }
}

/** One root subscriber owns cache invalidation and reload for all components. */
export function subscribeEnvironmentChanges(listener: () => void): () => void {
  const onLocal = (event: Event) => {
    event.preventDefault()
    listener()
  }
  const deliver = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const event = value as Record<string, unknown>
    if (
      (event.environment === 'production' || event.environment === 'staging') &&
      typeof event.source === 'string' &&
      event.source !== source &&
      event.environment !== getAppEnvironment() &&
      typeof event.timestamp === 'number' &&
      Math.abs(Date.now() - event.timestamp) < 60_000
    ) {
      requestEnvironmentReload('switch')
    }
  }
  const onMessage = (event: MessageEvent<unknown>) => deliver(event.data)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== ENVIRONMENT_STORAGE || !event.newValue) return
    try {
      deliver(JSON.parse(event.newValue))
    } catch {
      /* Ignore invalid events. */
    }
  }
  window.addEventListener(ENVIRONMENT_EVENT, onLocal)
  let channel: BroadcastChannel | undefined
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(ENVIRONMENT_CHANNEL)
    channel.addEventListener('message', onMessage)
  } else {
    window.addEventListener('storage', onStorage)
  }
  return () => {
    window.removeEventListener(ENVIRONMENT_EVENT, onLocal)
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onMessage)
    channel?.close()
  }
}

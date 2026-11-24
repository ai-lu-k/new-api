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
import { useEffect, useMemo, useState } from 'react'

export type CountdownParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalSeconds: number
}

export function splitCountdown(remainingMs: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  }
}

/**
 * Counts down to `targetUnix` using the server clock, so a skewed device clock
 * cannot end the event early or late. A target of 0 yields a finished timer.
 */
export function useCountdown(
  targetUnix: number,
  serverTime: number
): CountdownParts {
  const offsetMs = useMemo(() => serverTime * 1000 - Date.now(), [serverTime])
  const [now, setNow] = useState(() => Date.now() + offsetMs)
  useEffect(() => {
    setNow(Date.now() + offsetMs)
    if (!targetUnix) return
    const timer = window.setInterval(() => {
      setNow(Date.now() + offsetMs)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [targetUnix, offsetMs])
  if (!targetUnix) return splitCountdown(0)
  return splitCountdown(targetUnix * 1000 - now)
}

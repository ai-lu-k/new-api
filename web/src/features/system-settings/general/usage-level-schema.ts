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
import { z } from 'zod'

export const DEFAULT_USAGE_THRESHOLDS = [10, 50, 200, 1000, 5000]

const thresholdError = 'Use increasing whole numbers from 1 to 1,000,000,000.'

export const usageLevelSchema = z
  .object({
    thresholds: z
      .array(
        z.coerce
          .number({ error: thresholdError })
          .int({ error: thresholdError })
          .min(1, { error: thresholdError })
          .max(1_000_000_000, { error: thresholdError })
      )
      .length(5, { error: thresholdError }),
  })
  .superRefine((value, context) => {
    for (let i = 1; i < value.thresholds.length; i++) {
      if (value.thresholds[i] <= value.thresholds[i - 1]) {
        context.addIssue({
          code: 'custom',
          path: ['thresholds', i],
          message: thresholdError,
        })
      }
    }
  })

export function parseUsageLevelThresholds(raw: string): number[] {
  try {
    const parsed = usageLevelSchema.safeParse({ thresholds: JSON.parse(raw) })
    if (parsed.success) return parsed.data.thresholds
  } catch {
    // Old deployments have no saved option yet.
  }
  return [...DEFAULT_USAGE_THRESHOLDS]
}

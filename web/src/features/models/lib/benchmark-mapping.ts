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

export const benchmarkTiers = [
  'max',
  'xhigh',
  'high',
  'medium',
  'low',
  'minimal',
  'off',
  'default',
] as const

export const benchmarkMappingSchema = z
  .object({
    id: z.string().trim().min(1, 'Required').max(200),
    aliases: z.string(),
    highest_tier: z.string().min(1, 'Required'),
    tiers: z
      .array(
        z.object({
          id: z.enum(benchmarkTiers),
          source_name: z.string().trim().max(200),
        })
      )
      .min(1),
  })
  .superRefine((value, context) => {
    const aliases = value.aliases
      .split('\n')
      .map((alias) => alias.trim())
      .filter(Boolean)
    if (
      aliases.some((alias) => alias.length > 200) ||
      new Set(aliases).size !== aliases.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['aliases'],
        message: 'Model aliases must be unique, with one name per line.',
      })
    }
    if (!value.tiers.some((tier) => tier.id === value.highest_tier)) {
      context.addIssue({
        code: 'custom',
        path: ['highest_tier'],
        message: 'Required',
      })
    }
  })

export type BenchmarkMappingValues = z.infer<typeof benchmarkMappingSchema>

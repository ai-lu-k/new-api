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
import type { ComponentType } from 'react'

/**
 * The anchor of every section. Other pages deep-link to these, so the set is a
 * contract with the rest of the site: never rename or renumber one of them.
 */
export type TutorialStepId =
  | 'step-key'
  | 'step-call'
  | 'step-clients'
  | 'step-agent'

/** One row of the contents list. */
export type TutorialStep = {
  id: TutorialStepId
  /** The printed number, e.g. `01`. */
  number: string
  /** Already translated: the same string heads the section. */
  title: string
}

/** A step plus the section that reads under its heading. */
export type TutorialSection = TutorialStep & {
  Body: ComponentType
}

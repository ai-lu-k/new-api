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

/**
 * Secondary text actions ("View all", "Check-in records") carry an underline at
 * rest. Without it they read as plain text, so the underline is part of the
 * action's identity rather than a hover state. Colour stays with the caller.
 */
export const textActionClass =
  'underline decoration-1 underline-offset-4 transition-colors'

/**
 * A link inside running text rather than a standalone action. Dashed keeps it
 * apart from the document's own hairlines without introducing a second accent
 * colour, so long-form copy stays black and white. Colour stays with the caller.
 */
export const dashedTextActionClass =
  'underline decoration-dashed decoration-1 underline-offset-4 transition-colors'

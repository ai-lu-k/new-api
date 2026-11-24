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
import '@/styles/rolling-number.css'

const decimalDigits = [...'0123456789']

/** Rolls the digits of an already formatted value without changing its units. */
export function RollingNumber(props: { value: string }) {
  const characters = [...props.value]
  // Positions are anchored from the right, so adding a leading digit preserves
  // the existing decimal wheels and ongoing CSS transitions.
  const columns = characters.map((character, index) => ({
    character,
    place: characters.length - index,
  }))

  return (
    <span className='rolling-number'>
      <span className='sr-only'>{props.value}</span>
      <span className='rolling-number-reels' aria-hidden='true'>
        {columns.map((column) => {
          if (!/^\d$/.test(column.character)) {
            return <span key={column.place}>{column.character}</span>
          }
          return (
            <span key={column.place} className='rolling-number-window'>
              <span
                className='rolling-number-track'
                style={{
                  transform: `translateY(-${Number(column.character) * 10}%)`,
                }}
              >
                {decimalDigits.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
    </span>
  )
}

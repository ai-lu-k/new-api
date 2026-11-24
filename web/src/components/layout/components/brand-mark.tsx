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
 * The site's mark, drawn instead of loaded: a large block with a window cut in
 * it and a smaller block set into its lower right corner. It paints with
 * `currentColor`, so it is ink on the light theme and paper on the dark one.
 *
 * An image cannot do that. A picture carries its own colours, which is why a
 * logo file has to be redrawn per theme and why the old one printed a white
 * glyph on a black plate in both. The Logo setting still supplies the browser
 * icon; the bar draws this.
 */
export function BrandMark(props: { className?: string }) {
  return (
    <svg
      data-slot='brand-mark'
      viewBox='2 2 28 28'
      fill='currentColor'
      aria-hidden='true'
      focusable='false'
      className={props.className}
    >
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M3 2L21 2A1 1 0 0 1 22 3L22 16L29 16A1 1 0 0 1 30 17L30 29A1 1 0 0 1 29 30L17 30A1 1 0 0 1 16 29L16 22L2 22L2 3A1 1 0 0 1 3 2ZM8.8 8A0.8 0.8 0 0 0 8 8.8L8 15.2A0.8 0.8 0 0 0 8.8 16L15.2 16A0.8 0.8 0 0 0 16 15.2L16 8.8A0.8 0.8 0 0 0 15.2 8Z'
      />
    </svg>
  )
}

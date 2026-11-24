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

import { parseTags } from '../lib/filters'
import { tagIcon } from '../lib/tag-icon'
import { PricingMark } from './pricing-mark'

/**
 * What a model is good for, as the catalog tags it ("画质优先", "速度优先",
 * "工具"): the same block as the rest of the row, on the muted surface, so the
 * words sit with the offer marks without competing with them.
 *
 * The tags are the site's own data, so they are shown as written rather than
 * translated. A tag every model in the list already carries is left out: on that
 * list it names the list, not the model.
 */
export function ModelTags(props: {
  tags: string | undefined
  /** Tags shared by every model on show, which distinguish nothing. */
  omit?: string[]
}) {
  const omit = new Set((props.omit ?? []).map((tag) => tag.toLowerCase()))
  const tags = parseTags(props.tags).filter(
    (tag) => !omit.has(tag.toLowerCase())
  )
  if (tags.length === 0) return null

  return (
    <>
      {tags.map((tag) => (
        <PricingMark
          key={tag}
          label={tag}
          icon={tagIcon(tag)}
          className='bg-muted text-muted-foreground'
        />
      ))}
    </>
  )
}

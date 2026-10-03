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
import { Checkbox } from '@/components/ui/checkbox'

/**
 * A row of checkboxes for one of a model's catalogue lists (its input
 * modalities, the parameters it supports).
 */
export function ModelCatalogChoices(props: {
  choices: { value: string; label: string }[]
  chosen: string[]
  onChange: (chosen: string[]) => void
}) {
  return (
    <div className='flex flex-wrap gap-x-5 gap-y-2'>
      {props.choices.map((choice) => (
        <label
          key={choice.value}
          className='flex cursor-pointer items-center gap-2 text-sm'
        >
          <Checkbox
            checked={props.chosen.includes(choice.value)}
            onCheckedChange={(next) =>
              props.onChange(
                next
                  ? [...props.chosen, choice.value]
                  : props.chosen.filter((value) => value !== choice.value)
              )
            }
          />
          {choice.label}
        </label>
      ))}
    </div>
  )
}

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
import { useSharedName } from '@/components/motion/use-shared-name'

import { useSelectedModelName } from '../hooks/use-selected-model'
import { modelSharedName } from '../lib/model-shared-name'

type ModelSharedNameProps = {
  modelName: string
  className?: string
}

/**
 * A model's name in the list, or in its details drawer — never both.
 *
 * The list side keeps the name so the reader can open the drawer; the drawer
 * resolves the same name (see `ModelHeader`) and the browser morphs one into
 * the other instead of the row vanishing behind a panel.
 */
export function ModelSharedName(props: ModelSharedNameProps) {
  const selectedModelName = useSelectedModelName()
  const shared = useSharedName(
    selectedModelName === props.modelName
      ? undefined
      : modelSharedName(props.modelName)
  )

  return (
    <span className={props.className} title={props.modelName} {...shared}>
      {props.modelName}
    </span>
  )
}

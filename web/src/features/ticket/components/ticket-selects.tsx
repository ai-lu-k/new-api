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
import { useTranslation } from 'react-i18next'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  TICKET_CATEGORY_LABELS,
  TICKET_CATEGORY_OPTIONS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_OPTIONS,
} from '../constants'
import type { TicketAssignee } from '../types'

type TicketSelectProps = {
  id?: string
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

type TicketSelectOption = { value: number; label: string }

function TicketSelect(
  props: TicketSelectProps & { options: TicketSelectOption[] }
) {
  // Without `items` the trigger prints the raw value ("0", "2"); with it the
  // trigger names the chosen option instead.
  const items = props.options.map((option) => ({
    value: String(option.value),
    label: option.label,
  }))

  return (
    <Select
      items={items}
      value={String(props.value)}
      onValueChange={(value) => {
        if (value !== null) props.onChange(Number(value))
      }}
      disabled={props.disabled}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props.label}
        className={props.className}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TicketCategorySelect(
  props: TicketSelectProps & { allowAny?: boolean }
) {
  const { t } = useTranslation()
  const options = TICKET_CATEGORY_OPTIONS.map((category) => ({
    value: category,
    label: t(TICKET_CATEGORY_LABELS[category]),
  }))
  return (
    <TicketSelect
      id={props.id}
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      className={props.className}
      options={
        props.allowAny ? [{ value: 0, label: t('All') }, ...options] : options
      }
    />
  )
}

export function TicketPrioritySelect(
  props: TicketSelectProps & { allowAny?: boolean }
) {
  const { t } = useTranslation()
  const options = TICKET_PRIORITY_OPTIONS.map((priority) => ({
    value: priority,
    label: t(TICKET_PRIORITY_LABELS[priority]),
  }))
  return (
    <TicketSelect
      id={props.id}
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      className={props.className}
      options={
        props.allowAny ? [{ value: 0, label: t('All') }, ...options] : options
      }
    />
  )
}

export function TicketStatusSelect(
  props: TicketSelectProps & { allowAny?: boolean }
) {
  const { t } = useTranslation()
  const options = TICKET_STATUS_OPTIONS.map((status) => ({
    value: status,
    label: t(TICKET_STATUS_LABELS[status]),
  }))
  return (
    <TicketSelect
      id={props.id}
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      className={props.className}
      options={
        props.allowAny ? [{ value: 0, label: t('All') }, ...options] : options
      }
    />
  )
}

export function TicketAssigneeSelect(
  props: TicketSelectProps & {
    assignees: TicketAssignee[]
    allowAny?: boolean
    allowUnassigned?: boolean
  }
) {
  const { t } = useTranslation()
  const options: TicketSelectOption[] = props.assignees.map((assignee) => ({
    value: assignee.id,
    label: assignee.name,
  }))
  if (props.allowUnassigned) {
    options.unshift({ value: -1, label: t('Unassigned') })
  }
  if (props.allowAny) {
    options.unshift({ value: 0, label: t('Anyone') })
  }
  return (
    <TicketSelect
      id={props.id}
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      className={props.className}
      options={options}
    />
  )
}

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
import { Download, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { LOG_LEVELS, LOG_TAGS } from './types'

type LogFilterBarProps = {
  level: string
  tag: string
  text: string
  autoRefresh: boolean
  tags: string[]
  busy: boolean
  onLevelChange: (level: string) => void
  onTagChange: (tag: string) => void
  onTextChange: (text: string) => void
  onAutoRefreshChange: (enabled: boolean) => void
  onExport: () => void
  onClear: () => void
}

/**
 * The viewer's controls. Level and tag are applied by the hub (it filters
 * before the tail limit, so a narrow filter still shows recent matches); the
 * text box filters what came back.
 */
export function LogFilterBar(props: LogFilterBarProps) {
  const { t } = useTranslation()
  const tagOptions = [...LOG_TAGS, ...props.tags].filter(
    (tag, index, all) => all.indexOf(tag) === index
  )

  return (
    <div className='flex flex-wrap items-end gap-2'>
      <div className='space-y-1'>
        <Label htmlFor='log-level' className='text-xs'>
          {t('Level')}
        </Label>
        <Select
          value={props.level}
          onValueChange={(value) => props.onLevelChange(value ?? 'all')}
        >
          <SelectTrigger id='log-level' size='sm' className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value='all'>{t('All levels')}</SelectItem>
              {LOG_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-1'>
        <Label htmlFor='log-tag' className='text-xs'>
          {t('Tag')}
        </Label>
        <Select
          value={props.tag}
          onValueChange={(value) => props.onTagChange(value ?? 'all')}
        >
          <SelectTrigger id='log-tag' size='sm' className='w-36'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value='all'>{t('All tags')}</SelectItem>
              {tagOptions.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className='min-w-40 flex-1 space-y-1'>
        <Label htmlFor='log-text' className='text-xs'>
          {t('Search')}
        </Label>
        <Input
          id='log-text'
          value={props.text}
          placeholder={t('Filter the loaded lines')}
          onChange={(event) => props.onTextChange(event.target.value)}
        />
      </div>
      <div className='flex items-center gap-2 pb-1'>
        <Switch
          id='log-auto-refresh'
          checked={props.autoRefresh}
          onCheckedChange={props.onAutoRefreshChange}
        />
        <Label htmlFor='log-auto-refresh' className='text-xs'>
          {t('Auto refresh')}
        </Label>
      </div>
      <div className='flex gap-2 pb-1'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.busy}
          onClick={props.onExport}
        >
          <Download className='mr-1 size-4' />
          {t('Export')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.busy}
          onClick={props.onClear}
        >
          <Trash2 className='mr-1 size-4' />
          {t('Clear')}
        </Button>
      </div>
    </div>
  )
}

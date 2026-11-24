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
import type { ReactNode } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type TabSwitchItem = {
  /** Stable value, also used as the React key. */
  value: string
  /** Tab label. Keep it a short noun; the panel carries the detail. */
  label: ReactNode
  /** Panel content for this tab. */
  content: ReactNode
  disabled?: boolean
}

export type TabSwitchProps = {
  /** Tabs in display order — the order defines the slide direction. */
  tabs: TabSwitchItem[]
  /** Active value, controlled. */
  value: string
  onValueChange: (value: string) => void
  /** Accessible name of the tab list. */
  ariaLabel?: string
  className?: string
  listClassName?: string
  panelClassName?: string
}

/**
 * Tab swap (L2, 220ms).
 *
 * The underline is one element that slides with `translate` (`TabsIndicator`,
 * `--ease-morph`); the panel now on screen fades in over the base token while
 * rising a micro step (`--ease-out`). The outgoing panel does not animate out:
 * two panels painting at once is what read as a flicker, so it is dropped in
 * the same frame the new one starts. Everything is tokens — see
 * `[data-tab-switch-panel]` in `styles/swiss.css`.
 *
 * ```tsx
 * const [tab, setTab] = useState('keys')
 * <TabSwitch
 *   value={tab}
 *   onValueChange={setTab}
 *   ariaLabel={t('Key detail')}
 *   tabs={[
 *     { value: 'keys', label: t('Keys'), content: <KeyList /> },
 *     { value: 'usage', label: t('Usage'), content: <UsagePanel /> },
 *   ]}
 * />
 * ```
 */
export function TabSwitch(props: TabSwitchProps) {
  return (
    <Tabs
      value={props.value}
      onValueChange={(next) => props.onValueChange(next as string)}
      className={cn('gap-3', props.className)}
    >
      <TabsList
        variant='line'
        aria-label={props.ariaLabel}
        className={cn('relative', props.listClassName)}
      >
        {/* The sliding underline replaces the per-tab one, so the mark travels
            instead of blinking out of one tab and into the next. */}
        {props.tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {props.tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          data-tab-switch-panel=''
          className={cn('min-w-0', props.panelClassName)}
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

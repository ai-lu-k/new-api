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
  SectionPanel,
  type SectionPanelStatus,
} from '@/components/section-panel'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Markdown } from '@/components/ui/markdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFAQ } from '@/features/dashboard/hooks/use-status-data'
import type { FAQItem } from '@/features/dashboard/types'

export function FAQPanel() {
  const { t } = useTranslation()
  const { items: list, loading } = useFAQ()

  let status: SectionPanelStatus = 'ready'
  if (loading) status = 'loading'
  else if (!list.length) status = 'empty'

  return (
    <SectionPanel
      title={t('FAQ')}
      level='card'
      description={t('Answers for common access and billing questions')}
      status={status}
      emptyMessage={t('No FAQ entries available')}
      placeholderClassName='h-24'
    >
      <ScrollArea className='h-80'>
        <Accordion className='w-full px-4 sm:px-5'>
          {list.map((item: FAQItem, idx: number) => {
            const key = item.id ?? `faq-${idx}`
            const value = `item-${key}`
            return (
              <AccordionItem
                key={key}
                value={value}
                className='border-border/60'
              >
                <AccordionTrigger className='text-start hover:no-underline'>
                  <Markdown className='text-sm leading-relaxed font-semibold'>
                    {item.question}
                  </Markdown>
                </AccordionTrigger>
                {/* The panel already carries the open height and collapses to
                    `h-0` on `data-starting-style` / `data-ending-style`; the
                    repo has no `animate-accordion-*` keyframes, so without an
                    explicit transition the answer snaps open. Height rides the
                    base token, the answer itself fades on the fast one. */}
                <AccordionContent className='[transition:height_var(--motion-base)_var(--ease-out),opacity_var(--motion-fast)_var(--ease-out)] data-ending-style:opacity-0 data-starting-style:opacity-0'>
                  <Markdown className='text-muted-foreground/60 text-sm'>
                    {item.answer}
                  </Markdown>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </ScrollArea>
    </SectionPanel>
  )
}

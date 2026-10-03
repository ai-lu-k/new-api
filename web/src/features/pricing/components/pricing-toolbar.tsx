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
import { Filter } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import type { ModelFilters } from '../lib/model-filters'
import type { PricingModel, PricingVendor } from '../types'
import { PricingSidebar } from './pricing-sidebar'

export interface PricingToolbarProps {
  models: PricingModel[]
  vendors: PricingVendor[]
  groups: string[]
  filters: ModelFilters
  onFiltersChange: (changes: Partial<ModelFilters>) => void
  hasActiveFilters: boolean
  activeFilterCount: number
  onClearFilters: () => void
}

/**
 * The way into the filters on screens too narrow for the sidebar: a button
 * that opens them in a drawer. Wider screens show nothing here.
 */
export function PricingToolbar(props: PricingToolbarProps) {
  const { t } = useTranslation()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  return (
    <>
      <Button
        type='button'
        variant='outline'
        onClick={() => setMobileFiltersOpen(true)}
        className='h-10 shrink-0 gap-1.5 xl:hidden'
      >
        <Filter className='size-4' />
        {t('Filter')}
        {props.activeFilterCount > 0 && (
          <Badge className='ml-0.5 size-5 justify-center p-0 text-[10px]'>
            {props.activeFilterCount}
          </Badge>
        )}
      </Button>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent
          side='left'
          className={sideDrawerContentClassName('sm:max-w-md')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Filter')}</SheetTitle>
            <SheetDescription className='sr-only'>
              {t('Filter')}
            </SheetDescription>
          </SheetHeader>
          <div className={sideDrawerFormClassName('gap-0')}>
            <PricingSidebar
              models={props.models}
              vendors={props.vendors}
              groups={props.groups}
              filters={props.filters}
              onFiltersChange={props.onFiltersChange}
              hasActiveFilters={props.hasActiveFilters}
              onClearFilters={props.onClearFilters}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

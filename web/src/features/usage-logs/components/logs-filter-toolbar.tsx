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
import type { Table } from '@tanstack/react-table'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTableMobileFilterPanel,
  DataTableViewOptions,
} from '@/components/data-table'
import { SectionHeading } from '@/components/section-heading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useMediaQuery } from '@/hooks'
import { cn } from '@/lib/utils'

interface LogsFilterToolbarProps<TData> {
  table: Table<TData>
  primaryFilters: ReactNode
  advancedFilters?: ReactNode
  /** Block title above the list; defaults to the usage-log wording. */
  recordsTitle?: ReactNode
  compactMobile?: boolean
  desktopSecondaryFilters?: ReactNode
  desktopExtraFilters?: ReactNode
  mobilePinnedFilters?: ReactNode
  mobileFilters?: ReactNode
  mobileFilterCount?: number
  stats?: ReactNode
  actionStart?: ReactNode
  hasActiveFilters: boolean
  hasAdvancedActiveFilters?: boolean
  advancedFilterCount?: number
  searchLoading?: boolean
  onReset: () => void
  onSearch: () => void
  className?: string
}

interface LogsFilterFieldProps {
  children: ReactNode
  /** Field name. The filter grid relies on placeholders on desktop, so the
   * visible label is limited to the narrow layout; every input also carries an
   * `aria-label` so the condition keeps a name once a value is typed. */
  label?: string
  wide?: boolean
  className?: string
}

export function LogsFilterField(props: LogsFilterFieldProps) {
  return (
    <div
      className={cn(
        'min-w-0 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:text-sm [&_[data-slot=select-value]]:leading-5',
        props.wide && 'sm:col-span-2',
        props.className
      )}
    >
      {props.label != null && (
        <p className='text-muted-foreground mb-1 text-xs leading-4 sm:hidden'>
          {props.label}
        </p>
      )}
      {props.children}
    </div>
  )
}

export function LogsFilterInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      autoComplete='off'
      className={cn('h-8 min-w-0 text-sm leading-5', props.className)}
    />
  )
}

export function LogsFilterToolbar<TData>(props: LogsFilterToolbarProps<TData>) {
  const { t } = useTranslation()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  const recordsTitle = props.recordsTitle ?? t('Request records')
  const hasAdvancedFilters = props.advancedFilters != null
  const activeAdvancedCount =
    props.advancedFilterCount ?? (props.hasAdvancedActiveFilters ? 1 : 0)
  const activeMobileFilterCount = props.mobileFilterCount ?? activeAdvancedCount

  const handleMobileReset = () => {
    props.onReset()
    setMobileFiltersOpen(false)
  }

  const handleMobileSearch = () => {
    props.onSearch()
    setMobileFiltersOpen(false)
  }

  const advancedToggle = hasAdvancedFilters ? (
    <Button
      type='button'
      variant='ghost'
      onClick={() => setAdvancedOpen((open) => !open)}
      aria-expanded={advancedOpen}
      className={cn(
        'text-muted-foreground hover:text-foreground gap-1 px-2',
        props.hasAdvancedActiveFilters &&
          !advancedOpen &&
          'text-primary hover:text-primary'
      )}
    >
      {advancedOpen ? t('Collapse') : t('Expand')}
      {activeAdvancedCount > 0 && (
        <Badge className='ml-0.5 size-5 justify-center p-0 text-[10px]'>
          {activeAdvancedCount}
        </Badge>
      )}
      <ChevronDown
        className={cn(
          'size-3.5 transition-transform duration-200',
          advancedOpen && 'rotate-180'
        )}
      />
    </Button>
  ) : null

  if (isMobile && props.mobilePinnedFilters != null) {
    return (
      <Drawer open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SectionHeading as='h2' title={recordsTitle} className='pb-2.5' />
        <DataTableMobileFilterPanel
          compact={props.compactMobile}
          className={cn(
            props.className,
            // The narrowed toolbar is a filter row, not a card: the summary
            // figures above it stay unframed like the desktop row.
            props.compactMobile && 'border-0 bg-transparent p-0'
          )}
          actions={
            <>
              {props.actionStart}
              <DrawerTrigger asChild>
                <Button
                  type='button'
                  variant='ghost'
                  aria-label={t('Filter')}
                  className={cn(
                    'text-muted-foreground hover:text-foreground gap-1 px-2',
                    props.compactMobile && 'min-h-9 gap-1.5',
                    activeMobileFilterCount > 0 &&
                      'text-primary hover:text-primary'
                  )}
                >
                  {t('Filter')}
                  {activeMobileFilterCount > 0 && (
                    <Badge
                      className={cn(
                        !props.compactMobile &&
                          'ml-0.5 size-5 justify-center p-0 text-[10px]'
                      )}
                    >
                      {activeMobileFilterCount}
                    </Badge>
                  )}
                </Button>
              </DrawerTrigger>
              <Button
                type='button'
                onClick={props.onSearch}
                disabled={props.searchLoading}
                aria-busy={props.searchLoading}
              >
                {props.searchLoading && <Loader2 className='animate-spin' />}
                {t('Search')}
              </Button>
              <DataTableViewOptions table={props.table} />
            </>
          }
        >
          {props.compactMobile ? (
            <div className='flex min-w-0 flex-col gap-2.5'>
              {props.stats}
              <div className='w-full min-w-0 [&_button]:min-h-9'>
                {props.mobilePinnedFilters}
              </div>
            </div>
          ) : (
            <div className='grid gap-2'>
              <div className='grid gap-2'>{props.mobilePinnedFilters}</div>
              {props.stats}
            </div>
          )}
        </DataTableMobileFilterPanel>

        <DrawerContent className='max-h-[85dvh] p-0'>
          <div className='mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden'>
            <DrawerHeader className='border-border/70 border-b px-4 py-3 text-left'>
              <DrawerTitle>{t('Filter')}</DrawerTitle>
              <DrawerDescription>
                {t('Adjust filters, then search to refresh the logs.')}
              </DrawerDescription>
            </DrawerHeader>
            <div className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3'>
              {props.mobileFilters ?? (
                <>
                  {props.primaryFilters}
                  {props.advancedFilters}
                </>
              )}
            </div>
            <DrawerFooter className='border-border/70 grid grid-cols-2 gap-2 border-t px-4 py-3'>
              <Button
                type='button'
                variant='outline'
                onClick={handleMobileReset}
                disabled={!props.hasActiveFilters}
              >
                {t('Reset')}
              </Button>
              <Button
                type='button'
                onClick={handleMobileSearch}
                disabled={props.searchLoading}
              >
                {props.searchLoading && <Loader2 className='animate-spin' />}
                {t('Search')}
              </Button>
            </DrawerFooter>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  if (props.desktopSecondaryFilters != null) {
    const rowClassName =
      'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,.55fr)_5rem] gap-2 lg:grid-cols-[minmax(0,392fr)_minmax(0,416fr)_minmax(0,164fr)_6.75rem] lg:gap-4'
    const fieldRowClassName = cn(
      rowClassName,
      '[&_button]:h-10 [&_input]:h-10 [&_[data-slot=select-trigger]]:h-10!'
    )
    return (
      <div className='space-y-4'>
        {/* Summary figures and the page-level switch: one line, unframed.
            Pages without either (audit logs) skip the band entirely so it
            does not read as an empty toolbar. */}
        {(props.stats != null || props.actionStart != null) && (
          <div className='flex flex-wrap items-center justify-between gap-2 border-y py-3'>
            {props.stats}
            {props.actionStart}
          </div>
        )}
        <div className={fieldRowClassName}>
          {props.primaryFilters}
          <Button
            type='button'
            onClick={props.onSearch}
            disabled={props.searchLoading}
            aria-busy={props.searchLoading}
          >
            {props.searchLoading && <Loader2 className='animate-spin' />}
            {t('Search')}
          </Button>
        </div>
        {/* Exact-match conditions stay on their own row and share the column
            grid with the row above, so every input lines up. */}
        <div className={fieldRowClassName}>
          {props.desktopSecondaryFilters}
          <Button
            type='button'
            variant='outline'
            onClick={props.onReset}
            disabled={!props.hasActiveFilters}
            className='lg:col-start-4'
          >
            {t('Reset')}
          </Button>
        </div>
        {/* Admin-only conditions get a third row on the same grid instead of
            squeezing in beside the block title. */}
        {props.desktopExtraFilters != null && (
          <div className={fieldRowClassName}>{props.desktopExtraFilters}</div>
        )}
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <SectionHeading as='h2' title={recordsTitle} />
          <DataTableViewOptions table={props.table} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-card/50 rounded-lg border p-2.5 sm:p-3',
        props.className
      )}
    >
      <div className='flex flex-wrap items-start gap-2'>
        <div className='grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]'>
          {props.primaryFilters}
        </div>
        {advancedToggle && (
          <div className='flex shrink-0 items-center justify-end'>
            {advancedToggle}
          </div>
        )}
      </div>

      {advancedOpen && props.advancedFilters && (
        <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]'>
          {props.advancedFilters}
        </div>
      )}

      <div className='mt-2 flex flex-wrap items-center gap-2'>
        {props.stats}
        <div className='ms-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2'>
          {props.actionStart}
          <Button
            type='button'
            variant='outline'
            onClick={props.onReset}
            disabled={!props.hasActiveFilters}
          >
            {t('Reset')}
          </Button>
          <Button
            type='button'
            onClick={props.onSearch}
            disabled={props.searchLoading}
          >
            {props.searchLoading && <Loader2 className='animate-spin' />}
            {t('Search')}
          </Button>
          <DataTableViewOptions table={props.table} />
        </div>
      </div>
    </div>
  )
}

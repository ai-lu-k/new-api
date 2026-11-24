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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Tags } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitledCard } from '@/components/ui/titled-card'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

import { hubPost } from '../../api'
import { GATEWAY_QUERY_ROOT, gatewayKeys, readHub } from './gateway-queries'
import {
  countReadyAccounts,
  PRICE_VIA_LABEL_KEYS,
  type WorkBuddyGatewayHealth,
  type WorkBuddyPricing,
  type WorkBuddyPricingSource,
} from './gateway-types'
import { GatewayQueryState } from './query-state'

type CatalogueRow = {
  model: string
  source: WorkBuddyPricingSource
  ready: number
}

/**
 * The gateway's model list with the price policy each model resolves to, and
 * the one live action on this tab: refetching prices from the upstream price
 * list. Requests already logged keep the policy they were priced with.
 */
export function GatewayModelCatalogue(): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const pricing = useQuery({
    queryKey: gatewayKeys.pricing,
    queryFn: () => readHub<WorkBuddyPricing>('pricing'),
    refetchInterval: 60_000,
  })
  const health = useQuery({
    queryKey: gatewayKeys.health,
    queryFn: () => readHub<WorkBuddyGatewayHealth>('health'),
    refetchInterval: 60_000,
  })
  const refresh = useMutation({
    mutationFn: async () =>
      requireServerSuccess(await hubPost('pricing.refresh', {})),
    onSuccess: () => {
      setConfirmOpen(false)
      toast.success(t('Price refresh started'))
      void queryClient.invalidateQueries({ queryKey: GATEWAY_QUERY_ROOT })
      // The hub fetches on its own thread, so come back once for the result.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: gatewayKeys.pricing })
      }, 5000)
    },
    onError: (error) => handleServerError(error),
  })

  const rows = useMemo<CatalogueRow[]>(() => {
    const current = pricing.data?.current ?? {}
    return Object.entries(current)
      .map(([model, source]) => ({
        model,
        source,
        ready: countReadyAccounts(health.data?.models_ready?.[model]),
      }))
      .sort((left, right) => left.model.localeCompare(right.model))
  }, [pricing.data, health.data])

  const columns: StaticDataTableColumn<CatalogueRow>[] = [
    {
      id: 'model',
      header: t('Model'),
      className: 'w-[34%]',
      cell: (row) => <span className='font-mono text-xs'>{row.model}</span>,
    },
    {
      id: 'source',
      header: t('Price source'),
      cell: (row) => (
        <div className='flex flex-wrap items-center gap-1.5'>
          <Badge variant='outline'>
            {t(PRICE_VIA_LABEL_KEYS[row.source.via] ?? row.source.via)}
          </Badge>
          {row.source.inherited_from != null && (
            <span className='text-muted-foreground text-xs'>
              {t('from {{model}}', { model: row.source.inherited_from })}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'ready',
      header: t('Ready accounts'),
      className: 'w-[14%] text-right',
      cell: (row) => (
        <span className='tabular-nums'>{formatNumber(row.ready, locale)}</span>
      ),
    },
    {
      id: 'first_priced',
      header: t('First priced'),
      cell: (row) => (
        <span className='text-muted-foreground text-xs tabular-nums'>
          {row.source.label || '—'}
        </span>
      ),
    },
  ]

  const unpriced = pricing.data?.gap_summary?.total ?? 0

  return (
    <TitledCard
      title={t('Model catalogue')}
      icon={<Tags />}
      iconTone='chart-2'
      description={t(
        '{{models}} models priced · {{policies}} policies · last fetch {{time}}',
        {
          models: formatNumber(pricing.data?.models ?? 0, locale),
          policies: formatNumber(pricing.data?.policies ?? 0, locale),
          time: pricing.data?.last_run_label || t('never'),
        }
      )}
      action={
        <Button
          variant='outline'
          size='sm'
          disabled={refresh.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <RefreshCw className='size-3.5' />
          {t('Refresh prices')}
        </Button>
      }
    >
      <GatewayQueryState
        isPending={pricing.isPending}
        isError={pricing.isError}
        onRetry={() => void pricing.refetch()}
      >
        <StaticDataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.model}
          tableClassName='min-w-[640px]'
          emptyContent={
            <span className='text-muted-foreground text-sm'>
              {t('The gateway has not priced any model yet')}
            </span>
          }
        />
        <p className='text-muted-foreground mt-2 text-xs'>
          {unpriced > 0
            ? t(
                '{{models}} models have no price yet, so their requests show no cost estimate.',
                { models: formatNumber(unpriced, locale) }
              )
            : t('Every model has a price.')}
        </p>
      </GatewayQueryState>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('Refresh prices now?')}
        desc={t(
          'This asks the upstream price list for every model right away. It runs in the background and may take a few seconds; requests already logged keep the price they were billed with.'
        )}
        confirmText={t('Refresh prices')}
        isLoading={refresh.isPending}
        handleConfirm={() => refresh.mutate()}
      />
    </TitledCard>
  )
}

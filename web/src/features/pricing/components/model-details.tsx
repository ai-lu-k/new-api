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
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  AudioLines,
  Code2,
  FileText,
  HeartPulse,
  Image as ImageIcon,
  Info,
  Timer,
  Type,
  Video,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StaticDataTable } from '@/components/data-table'
import { sideDrawerContentClassName } from '@/components/drawer-layout'
import { GroupBadge } from '@/components/group-badge'
import { PublicLayout } from '@/components/layout'
import { useSharedName } from '@/components/motion/use-shared-name'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getPerfMetrics } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { PluginIcon } from '@/features/task-plugins/components/plugin-icon'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { usePricingPreferencesStore } from '@/stores/pricing-preferences-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import { usePricingData } from '../hooks/use-pricing-data'
import type { ParsedTaskTier } from '../lib/billing-expr'
import { formatBillingCondition } from '../lib/billing-expression/condition-display'
import {
  formatTaskUsageUnitPrice,
  getDynamicPriceEntries,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  getDynamicPricingTiers,
  getTaskUsageQuantityUnitLabelKey,
  isDynamicPricingModel,
  isUnconfiguredTaskUsageModel,
  type DynamicPriceEntry,
} from '../lib/dynamic-price'
import {
  getAvailableGroups,
  getDisplayGroupRatio,
  hasSelectableGroups,
  isTokenBasedModel,
} from '../lib/model-helpers'
import { modelSharedName } from '../lib/model-shared-name'
import { withPluginPricing } from '../lib/plugin-pricing'
import { formatFixedPrice, formatGroupPrice } from '../lib/price'
import {
  evaluateTaskUsageExamples,
  getTaskEnumFields,
  getTaskNumberFields,
} from '../lib/task-expr'
import { getTaskPricingDisplayTiers } from '../lib/task-matrix-display'
import {
  hasSimpleTaskPricing,
  taskPriceLabel,
  taskUsageUnitLabel,
  taskTierConditions,
  pricingDisplayFallbackKey,
} from '../lib/task-price-display'
import type { PriceType, PricingModel, TokenUnit } from '../types'
import { DynamicPricingBreakdown } from './dynamic-pricing-breakdown'
import { ModelBenchmark } from './model-benchmark'
import { ModelBillingModeBadge } from './model-billing-mode-badge'
import { ModelDetailsApi } from './model-details-api'
import { ModelDetailsPerformance } from './model-details-performance'
import { ModelFreeBadge } from './model-free-badge'
import { PromoCountdown } from './promo-countdown'

// ----------------------------------------------------------------------------
// Local UI helpers
// ----------------------------------------------------------------------------

function SectionTitle(props: {
  children: React.ReactNode
  /** A short qualifier that belongs on the same line as the heading. */
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-muted-foreground mb-3 flex flex-wrap items-baseline gap-2 text-xs font-semibold tracking-wider uppercase',
        props.className
      )}
    >
      {props.children}
      {props.aside}
    </h2>
  )
}

/** One line of a price table: a label on the left, a figure on the right, a
 *  hairline under it — the shape the whole public site uses for figures. */
function PriceRow(props: {
  label: React.ReactNode
  value: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className='border-border flex items-baseline justify-between gap-4 border-b py-2'>
      <dt className='text-muted-foreground text-[13px]'>{props.label}</dt>
      <dd
        className={cn(
          'text-right tabular-nums',
          props.muted
            ? 'text-muted-foreground text-[13px]'
            : 'text-[15px] font-semibold'
        )}
      >
        {props.value}
      </dd>
    </div>
  )
}

function DynamicPriceEntryLabel(props: { entry: DynamicPriceEntry }) {
  const { t, i18n } = useTranslation()
  if (props.entry.labelKind === 'schema') {
    return (
      <span className='break-words whitespace-normal'>
        {taskPriceLabel(
          props.entry.description,
          props.entry.shortLabel,
          i18n.language
        )}
      </span>
    )
  }
  return t(props.entry.shortLabel)
}

function UnconfiguredTaskPricingNotice(props: { model: PricingModel }) {
  const { t, i18n } = useTranslation()
  const numberFields = getTaskNumberFields(props.model.billing_usage_schema)
  const enumFields = getTaskEnumFields(props.model.billing_usage_schema)

  return (
    <div className='bg-muted/20 flex flex-col gap-3 rounded-lg border p-3'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'This model is billed by usage, but the administrator has not configured its pricing yet.'
        )}
      </p>
      {numberFields.length + enumFields.length > 0 ? (
        <dl className='grid gap-2 sm:grid-cols-2'>
          {numberFields.map(([field, definition]) => (
            <div
              key={field}
              className='flex items-baseline justify-between gap-3'
            >
              <dt className='text-sm'>
                {taskPriceLabel(definition.description, field, i18n.language)}
              </dt>
              <dd className='text-muted-foreground text-xs'>
                {taskUsageUnitLabel(
                  definition,
                  i18n.language,
                  t(getTaskUsageQuantityUnitLabelKey(definition.unit))
                )}
              </dd>
            </div>
          ))}
          {enumFields.map(([field, definition]) => (
            <div
              key={field}
              className='flex items-baseline justify-between gap-3'
            >
              <dt className='text-sm'>
                <code>{field}</code>
              </dt>
              <dd className='text-muted-foreground text-right text-xs'>
                {(definition.enum ?? []).join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

const MODALITY_LABEL_KEYS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
}

const TOKEN_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
})
const MODEL_DETAILS_SKELETON_KEYS = ['first', 'second', 'third', 'fourth']

function formatCatalogTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return ''
  if (tokens >= 1_000_000) {
    return `${TOKEN_FORMAT.format(tokens / 1_000_000)}M`
  }
  if (tokens >= 1_000) {
    return `${TOKEN_FORMAT.format(tokens / 1_000)}K`
  }
  return TOKEN_FORMAT.format(tokens)
}

function formatCatalogYearMonth(value?: string): string {
  if (!value) return ''
  const [yearStr, monthStr] = value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short' })
}

function normalizeCatalogItems(items?: readonly string[]): string[] {
  if (!items) return []
  return items.filter((item) => item.trim().length > 0)
}

function OverviewMetric(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  const Icon = props.icon

  return (
    <div className='flex min-w-0 items-center gap-2 px-3 py-2.5'>
      <Icon className='text-muted-foreground/70 size-3.5 shrink-0' />
      <div className='min-w-0 flex-1'>
        <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
          {props.label}
        </div>
        <div
          className={cn(
            'text-foreground truncate font-mono text-sm font-semibold tabular-nums',
            props.valueClassName
          )}
        >
          {props.value}
        </div>
      </div>
    </div>
  )
}

function OverviewSummaryGrid(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const metricsQuery = useQuery({
    queryKey: ['perf-metrics', props.model.model_name],
    queryFn: async () =>
      requireServerSuccess(await getPerfMetrics(props.model.model_name, 24)),
    staleTime: 60 * 1000,
  })

  const summary = metricsQuery.data?.data.summary
  const successRate = summary?.success_rate ?? Number.NaN
  const avgTps = summary?.avg_tps ?? 0
  const avgLatency = summary?.avg_latency_ms ?? 0

  return (
    <div className='border-border grid border-y sm:grid-cols-3 sm:divide-x'>
      <OverviewMetric
        icon={Timer}
        label='TPS'
        value={formatThroughput(avgTps)}
      />
      <OverviewMetric
        icon={Timer}
        label={t('Average latency')}
        value={formatLatency(avgLatency)}
      />
      <OverviewMetric
        icon={HeartPulse}
        label={t('Success rate')}
        value={formatUptimePct(successRate)}
        valueClassName={getSuccessRateTextClass(successRate)}
      />
    </div>
  )
}

/** The glyph that stands for each kind of work, so the modality row shows
 *  what a model reads and what it answers before any word is read. */
const MODALITY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  file: FileText,
}

/**
 * One modality as a hairline tile. The icon carries the kind of work and the
 * accessible name carries the word; the closing side of the flow is drawn in
 * the text colour so input and output stay apart without colour coding.
 */
function ModalityTiles(props: { items: string[]; side?: 'input' | 'output' }) {
  const { t } = useTranslation()
  if (props.items.length === 0) return null

  const closed = props.side === 'output'

  return (
    <TooltipProvider>
      <span className='inline-flex flex-wrap items-center gap-1 align-middle'>
        {props.items.map((item) => {
          const Icon = MODALITY_ICONS[item] ?? FileText
          const label = t(MODALITY_LABEL_KEYS[item] ?? item)
          return (
            <Tooltip key={item}>
              <TooltipTrigger
                type='button'
                data-modality={closed ? 'output' : 'input'}
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-[3px] border bg-transparent p-0',
                  closed
                    ? 'border-foreground/70 text-foreground'
                    : 'border-border text-muted-foreground'
                )}
              >
                <Icon className='size-3' />
                <span className='sr-only'>{label}</span>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
}

// ----------------------------------------------------------------------------
// Model header (always visible above the detail sections)
// ----------------------------------------------------------------------------

function ModelHeader(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const model = props.model
  const modelIconKey = model.icon || model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 20) : null
  const description = model.description || model.vendor_description || null
  // The card that opened this panel released this name: the title travels.
  const sharedTitle = useSharedName(modelSharedName(model.model_name))

  return (
    <header>
      <div className='flex items-center gap-2.5'>
        {modelIcon}
        <h1
          className='font-mono text-xl font-bold tracking-tight sm:text-2xl'
          {...sharedTitle}
          data-shared-morph
        >
          {model.model_name}
        </h1>
        <CopyButton
          value={model.model_name || ''}
          className='size-6'
          iconClassName='size-3'
          tooltip={t('Copy model name')}
          successTooltip={t('Copied!')}
          aria-label={t('Copy model name')}
        />
      </div>
      <div className='mt-1 flex flex-wrap items-center gap-1.5 text-xs'>
        {model.vendor_name && (
          <span className='text-muted-foreground'>{model.vendor_name}</span>
        )}
        <span className='text-muted-foreground/30'>·</span>
        <ModelFreeBadge model={model} />
        <ModelBillingModeBadge model={model} />
        <PromoCountdown endsAt={model.promo_ends_at} />
      </div>
      {description && (
        <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
          {description}
        </p>
      )}
    </header>
  )
}

/**
 * What the model is, in one hairline row: what it takes in and gives out, how
 * much it can hold, when it landed. The figures stay out of the way of the
 * price table and the tabs below.
 */
function OverviewFacts(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const model = props.model
  const facts: { label: string; value: React.ReactNode }[] = []

  const input = normalizeCatalogItems(model.input_modalities)
  const output = normalizeCatalogItems(model.output_modalities)
  if (input.length > 0 || output.length > 0) {
    facts.push({
      label: t('Modalities'),
      value: (
        <span className='inline-flex min-w-0 flex-wrap items-center gap-1.5'>
          <ModalityTiles items={input} />
          {input.length > 0 && output.length > 0 && (
            <span className='text-muted-foreground/40' aria-hidden='true'>
              →
            </span>
          )}
          <ModalityTiles items={output} side='output' />
        </span>
      ),
    })
  }
  const context = formatCatalogTokenCount(model.context_length ?? 0)
  if (context) facts.push({ label: t('Context'), value: context })
  const maxOutput = formatCatalogTokenCount(model.max_output_tokens ?? 0)
  if (maxOutput) {
    facts.push({ label: t('Max output'), value: maxOutput })
  }
  const released = formatCatalogYearMonth(model.release_date)
  if (released) facts.push({ label: t('Released'), value: released })

  if (facts.length === 0) return null

  return (
    <dl className='border-border flex divide-x border-y'>
      {facts.map((fact) => (
        <div key={fact.label} className='min-w-0 flex-1 px-3 py-2.5'>
          <dt className='text-muted-foreground text-[10px] font-medium tracking-wider uppercase'>
            {fact.label}
          </dt>
          <dd className='text-foreground mt-0.5 text-[13px] font-semibold tabular-nums'>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// ----------------------------------------------------------------------------
// Base price card (used in the Overview tab)
// ----------------------------------------------------------------------------

function PriceSection(props: {
  model: PricingModel
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  /** Shows the price this site charges instead of the base price. */
  multiplier?: number
}) {
  const { t, i18n } = useTranslation()
  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  const multiplier = props.multiplier ?? 1
  const baseGroupKey = '_base'
  const baseGroupRatioMap = { [baseGroupKey]: multiplier }
  const title = (
    <SectionTitle aside={<OfficialPriceNote multiplier={multiplier} />}>
      {t('Price')}
    </SectionTitle>
  )
  const currency = useSystemConfigStore((state) => state.config.currency)
  const billingTime = useBillingTime(props.model.billing_expr)
  const dynamicSummary = useMemo(
    () =>
      getDynamicPricingSummary(props.model, {
        now: billingTime === undefined ? undefined : new Date(billingTime),
        tokenUnit: props.tokenUnit,
        showRechargePrice: props.showRechargePrice,
        priceRate: props.priceRate,
        usdExchangeRate: props.usdExchangeRate,
        groupRatioMultiplier: multiplier,
      }),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      props.model,
      multiplier,
      props.tokenUnit,
      props.showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      billingTime,
      currency,
    ]
  )

  const primaryPriceTypes: { label: string; type: PriceType }[] = [
    { label: t('Input'), type: 'input' },
    { label: t('Output'), type: 'output' },
  ]
  const secondaryPriceTypes: {
    label: string
    type: PriceType
    available: boolean
  }[] = [
    {
      label: t('Cached input'),
      type: 'cache',
      available: props.model.cache_ratio != null,
    },
    {
      label: t('Cache write'),
      type: 'create_cache',
      available: props.model.create_cache_ratio != null,
    },
    {
      label: t('Image input'),
      type: 'image',
      available: props.model.image_ratio != null,
    },
    {
      label: t('Audio input'),
      type: 'audio_input',
      available: props.model.audio_ratio != null,
    },
    {
      label: t('Audio output'),
      type: 'audio_output',
      available:
        props.model.audio_ratio != null &&
        props.model.audio_completion_ratio != null,
    },
  ]

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      return (
        <section>
          {title}
          <div className='rounded-lg border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/10'>
            <div className='text-sm font-medium text-amber-800 dark:text-amber-200'>
              {t('Special billing expression')}
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                pricingDisplayFallbackKey(
                  dynamicSummary.rawExpression,
                  props.model.billing_usage_schema
                )
              )}
            </p>
            <div className='mt-3'>
              <div className='text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase'>
                {t('Raw expression')}
              </div>
              <code className='text-muted-foreground bg-background/80 block max-h-28 overflow-auto rounded-md border px-2 py-1.5 font-mono text-xs break-all'>
                {dynamicSummary.rawExpression}
              </code>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section>
        {title}
        {dynamicSummary.providerCount && (
          <p className='text-muted-foreground mb-2 text-xs'>
            {t('{{count}} providers', { count: dynamicSummary.providerCount })}
            {dynamicSummary.hasUnconfiguredProviders &&
              ` · ${t('Not configured for some providers')}`}
          </p>
        )}
        {dynamicSummary.isMixedBilling && (
          <p className='text-muted-foreground mb-2 text-xs'>
            {t('Token or per-call pricing')}
          </p>
        )}
        {dynamicSummary.primaryEntries.length > 0 ? (
          <dl className='border-border border-t'>
            {dynamicSummary.primaryEntries.map((entry) => {
              const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
              const unitLabel = taskUsageUnitLabel(
                entry,
                i18n.language,
                unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
              )
              return (
                <PriceRow
                  key={entry.key}
                  label={<DynamicPriceEntryLabel entry={entry} />}
                  value={
                    <>
                      {entry.formattedRange ?? entry.formatted}
                      <span className='text-muted-foreground ml-1 text-xs font-normal'>
                        / {unitLabel}
                      </span>
                    </>
                  }
                />
              )
            })}
          </dl>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {dynamicSummary.hasUnconfiguredProviders
              ? t('Not configured')
              : t('Dynamic Pricing')}
          </p>
        )}
        {dynamicSummary.secondaryEntries.length > 0 && (
          <dl className='mt-2'>
            {dynamicSummary.secondaryEntries.map((entry) => {
              const unitLabelKey = getDynamicPriceUnitLabelKey(entry)
              const unitLabel = taskUsageUnitLabel(
                entry,
                i18n.language,
                unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
              )
              return (
                <PriceRow
                  key={entry.key}
                  muted
                  label={<DynamicPriceEntryLabel entry={entry} />}
                  value={
                    <>
                      {entry.formattedRange ?? entry.formatted}
                      <span className='text-muted-foreground ml-1 text-xs font-normal'>
                        / {unitLabel}
                      </span>
                    </>
                  }
                />
              )
            })}
          </dl>
        )}
      </section>
    )
  }

  if (isUnconfiguredTaskUsageModel(props.model)) {
    return (
      <section>
        {title}
        <UnconfiguredTaskPricingNotice model={props.model} />
      </section>
    )
  }

  if (!isTokenBased) {
    return (
      <section>
        {title}
        <dl className='border-border border-t'>
          <PriceRow
            label={t('Per request')}
            value={formatFixedPrice(
              props.model,
              baseGroupKey,
              props.showRechargePrice,
              props.priceRate,
              props.usdExchangeRate,
              baseGroupRatioMap
            )}
          />
        </dl>
      </section>
    )
  }

  const secondaryItems = secondaryPriceTypes.filter((p) => p.available)
  const renderPrice = (type: PriceType) => (
    <>
      {formatGroupPrice(
        props.model,
        baseGroupKey,
        type,
        props.tokenUnit,
        props.showRechargePrice,
        props.priceRate,
        props.usdExchangeRate,
        baseGroupRatioMap
      )}
      <span className='text-muted-foreground/40 ml-1 text-xs font-normal'>
        / {tokenUnitLabel}
      </span>
    </>
  )

  return (
    <section>
      {title}
      <dl className='border-border border-t'>
        {primaryPriceTypes.map((item) => (
          <PriceRow
            key={item.type}
            label={item.label}
            value={renderPrice(item.type)}
          />
        ))}
        {secondaryItems.map((item) => (
          <PriceRow
            key={item.type}
            muted
            label={item.label}
            value={renderPrice(item.type)}
          />
        ))}
      </dl>
    </section>
  )
}

/** Says what the figures below are relative to, when they are not the list
 *  price. Nothing to say at the base price, so nothing is printed. */
function officialPriceNote(
  multiplier: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string | null {
  if (multiplier === 1) return null
  return t('{{percent}}% of the official price', {
    percent: Number((multiplier * 100).toFixed(4)),
  })
}

function OfficialPriceNote(props: { multiplier: number }) {
  const { t } = useTranslation()
  const note = officialPriceNote(props.multiplier, t)
  if (!note) return null
  return <span className='text-[11px] font-normal normal-case'>{note}</span>
}

// ----------------------------------------------------------------------------
// Auto group chain (used inside group pricing section)
// ----------------------------------------------------------------------------

function AutoGroupChain(props: { model: PricingModel; autoGroups: string[] }) {
  const { t } = useTranslation()
  const modelEnableGroups = Array.isArray(props.model.enable_groups)
    ? props.model.enable_groups
    : []
  const autoChain = props.autoGroups.filter((g) =>
    modelEnableGroups.includes(g)
  )

  if (autoChain.length === 0) return null

  return (
    <div className='text-muted-foreground mb-3 flex flex-wrap items-center gap-1 text-xs'>
      <span className='font-medium'>{t('Auto Group Chain')}</span>
      <span className='text-muted-foreground/40'>→</span>
      {autoChain.map((g, idx) => (
        <span key={g} className='flex items-center gap-1'>
          <GroupBadge group={g} size='sm' />
          {idx < autoChain.length - 1 && (
            <span className='text-muted-foreground/40'>→</span>
          )}
        </span>
      ))}
    </div>
  )
}

type DynamicPriceOptions = Parameters<typeof getDynamicPriceEntries>[1]
type DynamicPricingTier = ReturnType<typeof getDynamicPricingTiers>[number]
type DynamicFormattedPricesByTier = Map<DynamicPricingTier, Map<string, string>>

function getDynamicPriceFields(
  tiers: DynamicPricingTier[],
  options: DynamicPriceOptions
) {
  return [
    ...new Map(
      tiers
        .flatMap((tier) => getDynamicPriceEntries(tier, options))
        .map((entry) => [entry.field, entry])
    ).values(),
  ]
}

function getDynamicFormattedPricesByTier(
  tiers: DynamicPricingTier[],
  options: DynamicPriceOptions
): DynamicFormattedPricesByTier {
  return new Map(
    tiers.map((tier) => [
      tier,
      new Map(
        getDynamicPriceEntries(tier, options).map((entry) => [
          entry.field,
          entry.formatted,
        ])
      ),
    ])
  )
}

// ----------------------------------------------------------------------------
// Group pricing table
// ----------------------------------------------------------------------------

type GroupPricingSectionProps = {
  model: PricingModel
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
}

function GroupPricingSection(props: GroupPricingSectionProps) {
  const { t } = useTranslation()
  const variants = props.model.billing_plugin_variants
  if (!variants?.length) {
    return <ProviderGroupPricingSection {...props} />
  }
  return (
    <section>
      <SectionTitle>{t('Pricing by Group')}</SectionTitle>
      <Tabs key={props.model.model_name} defaultValue={variants[0].plugin_key}>
        <TabsList
          aria-label={t('Provider')}
          className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'
        >
          {variants.map((variant) => (
            <TabsTrigger
              key={variant.plugin_key}
              value={variant.plugin_key}
              className='max-w-full min-w-0'
            >
              <PluginIcon
                plugin={{
                  key: variant.plugin_key,
                  name: variant.plugin_name,
                  icon: variant.icon,
                }}
                size={16}
              />
              <span className='truncate' title={variant.plugin_name}>
                {variant.plugin_name}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {variants.map((variant) => (
          <TabsContent key={variant.plugin_key} value={variant.plugin_key}>
            {variant.billing_expr || variant.billing_mode === 'ratio' ? (
              <ProviderGroupPricingSection
                {...props}
                model={withPluginPricing(props.model, variant)}
                hideTitle
              />
            ) : (
              <UnconfiguredTaskPricingNotice
                model={withPluginPricing(props.model, variant)}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function ProviderGroupPricingSection(
  props: GroupPricingSectionProps & { hideTitle?: boolean }
) {
  const { t, i18n } = useTranslation()
  const showRechargePrice = props.showRechargePrice ?? false

  const availableGroups = useMemo(
    () => getAvailableGroups(props.model, props.usableGroup || {}),
    [props.model, props.usableGroup]
  )

  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'

  const extraPriceTypes = useMemo(() => {
    const types: { label: string; type: PriceType }[] = []
    if (props.model.cache_ratio != null) {
      types.push({ label: t('Cache'), type: 'cache' })
    }
    if (props.model.create_cache_ratio != null) {
      types.push({ label: t('Cache Write'), type: 'create_cache' })
    }
    if (props.model.image_ratio != null) {
      types.push({ label: t('Image'), type: 'image' })
    }
    if (props.model.audio_ratio != null) {
      types.push({ label: t('Audio In'), type: 'audio_input' })
    }
    if (
      props.model.audio_ratio != null &&
      props.model.audio_completion_ratio != null
    ) {
      types.push({ label: t('Audio Out'), type: 'audio_output' })
    }
    return types
  }, [props.model, t])

  if (availableGroups.length === 0) {
    return (
      <section>
        {!props.hideTitle && (
          <SectionTitle>{t('Pricing by Group')}</SectionTitle>
        )}
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <p className='text-muted-foreground text-sm'>
          {t(
            'This model is not available in any group, or no group pricing information is configured.'
          )}
        </p>
      </section>
    )
  }

  const thClass = cn(
    'text-muted-foreground py-2 text-xs font-medium whitespace-normal break-words',
    !props.model.billing_usage_schema && 'tracking-wider uppercase'
  )

  if (isDynamicPricingModel(props.model)) {
    const dynamicTiers = props.model.billing_usage_schema
      ? getTaskPricingDisplayTiers(
          props.model.billing_expr,
          props.model.billing_usage_schema
        )
      : getDynamicPricingTiers(props.model)
    const hasRequestPrice = dynamicTiers.some(
      (tier) => !('unitPrices' in tier) && tier.billingUnit === 'request'
    )

    if (dynamicTiers.length === 0) {
      return (
        <section>
          {!props.hideTitle && (
            <SectionTitle>{t('Pricing by Group')}</SectionTitle>
          )}
          <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
          <div className='rounded-lg border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/10'>
            <div className='text-sm font-medium text-amber-800 dark:text-amber-200'>
              {t('Special billing expression')}
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                pricingDisplayFallbackKey(
                  props.model.billing_expr || '',
                  props.model.billing_usage_schema
                )
              )}
            </p>
            <div className='mt-3'>
              <div className='text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase'>
                {t('Raw expression')}
              </div>
              <code className='text-muted-foreground bg-background/80 block max-h-28 overflow-auto rounded-md border px-2 py-1.5 font-mono text-xs break-all'>
                {props.model.billing_expr}
              </code>
            </div>
          </div>
        </section>
      )
    }

    const usageExampleRows = evaluateTaskUsageExamples(
      props.model.billing_expr,
      props.model.billing_usage_schema,
      props.model.billing_usage_examples
    )
    const priceFields = getDynamicPriceFields(dynamicTiers, {
      tokenUnit: props.tokenUnit,
      showRechargePrice,
      priceRate: props.priceRate,
      usdExchangeRate: props.usdExchangeRate,
      groupRatioMultiplier: 1,
      usageSchema: props.model.billing_usage_schema,
    })
    const formattedPricesByGroup = new Map(
      availableGroups.map((group) => {
        const ratio = props.groupRatio[group] || 1
        return [
          group,
          getDynamicFormattedPricesByTier(dynamicTiers, {
            tokenUnit: props.tokenUnit,
            showRechargePrice,
            priceRate: props.priceRate,
            usdExchangeRate: props.usdExchangeRate,
            groupRatioMultiplier: ratio,
            usageSchema: props.model.billing_usage_schema,
          }),
        ] as const
      })
    )

    return (
      <section>
        {!props.hideTitle && (
          <SectionTitle>{t('Pricing by Group')}</SectionTitle>
        )}
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <div className='space-y-3'>
          {availableGroups.map((group) => {
            const ratio = props.groupRatio[group] || 1
            const formattedPricesByTier =
              formattedPricesByGroup.get(group) ??
              new Map<DynamicPricingTier, Map<string, string>>()

            return (
              <div key={group} className='overflow-hidden rounded-lg border'>
                <div className='bg-muted/20 flex items-center justify-between gap-3 border-b px-3 py-2'>
                  <GroupBadge group={group} size='sm' />
                  <span className='text-muted-foreground font-mono text-xs'>
                    {ratio}x
                  </span>
                </div>
                <StaticDataTable
                  className='rounded-none border-0'
                  tableClassName='text-sm'
                  headerRowClassName='hover:bg-transparent'
                  data={dynamicTiers}
                  getRowKey={(tier, tierIndex) =>
                    `${group}-${tier.label}-${tierIndex}`
                  }
                  columns={[
                    ...(hasSimpleTaskPricing(props.model)
                      ? []
                      : [
                          {
                            id: 'tier',
                            header: props.model.billing_usage_schema
                              ? t('Applicable conditions')
                              : t('Tier'),
                            className: thClass,
                            cellClassName:
                              'text-muted-foreground py-2.5 whitespace-normal break-words',
                            cell: (tier: DynamicPricingTier) => {
                              if ('unitPrices' in tier) {
                                return (
                                  taskTierConditions(
                                    tier as ParsedTaskTier,
                                    props.model.billing_usage_schema,
                                    i18n.language,
                                    t
                                  ) ||
                                  t(
                                    dynamicTiers.length > 1
                                      ? 'Other cases'
                                      : 'All requests'
                                  )
                                )
                              }
                              if (tier.conditionText) {
                                return `${tier.label}: ${formatBillingCondition(tier.conditionText, t, i18n.language) ?? tier.conditionText}`
                              }
                              return tier.label || t('Default')
                            },
                          },
                        ]),
                    ...priceFields.map((fieldEntry) => {
                      const unitLabelKey =
                        getDynamicPriceUnitLabelKey(fieldEntry)
                      let unitLabel = taskUsageUnitLabel(
                        fieldEntry,
                        i18n.language,
                        unitLabelKey ? t(unitLabelKey) : ''
                      )
                      if (!unitLabel && hasRequestPrice) {
                        unitLabel = t('{{unit}} tokens', {
                          unit: tokenUnitLabel,
                        })
                      }
                      const fieldLabel =
                        fieldEntry.labelKind === 'schema' ? (
                          <DynamicPriceEntryLabel entry={fieldEntry} />
                        ) : (
                          t(fieldEntry.shortLabel)
                        )
                      return {
                        id: fieldEntry.field,
                        header: unitLabel ? (
                          <>
                            {fieldLabel}
                            {` / ${unitLabel}`}
                          </>
                        ) : (
                          fieldLabel
                        ),
                        className: `${thClass} text-right`,
                        cellClassName: 'py-2.5 text-right font-mono',
                        cell: (tier: (typeof dynamicTiers)[number]) =>
                          formattedPricesByTier
                            .get(tier)
                            ?.get(fieldEntry.field) ?? '-',
                      }
                    }),
                  ]}
                />
                {usageExampleRows.length > 0 ? (
                  <div className='border-t'>
                    <div className='text-muted-foreground px-3 pt-2 text-[10px] font-medium tracking-wider uppercase'>
                      {t('Price examples')}
                    </div>
                    <StaticDataTable
                      className='rounded-none border-0'
                      tableClassName='text-sm'
                      headerRowClassName='hover:bg-transparent'
                      data={usageExampleRows}
                      getRowKey={(row) => `${group}-${row.label}`}
                      columns={[
                        {
                          id: 'spec',
                          header: t('Spec'),
                          className: thClass,
                          cellClassName: 'text-muted-foreground py-2.5',
                          cell: (row) => row.label,
                        },
                        {
                          id: 'price',
                          header: t('Example price'),
                          className: `${thClass} text-right`,
                          cellClassName: 'py-2.5 text-right font-mono',
                          cell: (row) =>
                            `≈ ${formatTaskUsageUnitPrice(row.total, {
                              tokenUnit: props.tokenUnit,
                              showRechargePrice,
                              priceRate: props.priceRate,
                              usdExchangeRate: props.usdExchangeRate,
                              groupRatioMultiplier: ratio,
                            })}`,
                        },
                      ]}
                    />
                    <p className='text-muted-foreground/40 px-3 pb-2 text-[10px]'>
                      {t('Approximate prices for common specs.')}
                    </p>
                  </div>
                ) : null}
              </div>
            )
          })}
          <p className='text-muted-foreground/40 mt-1.5 text-[10px]'>
            {dynamicTiers.some(
              (tier) => 'unitPrices' in tier || tier.billingUnit === 'request'
            )
              ? t('Prices shown per usage unit')
              : `${t('Prices shown per')} ${tokenUnitLabel} tokens`}
          </p>
        </div>
      </section>
    )
  }

  if (isUnconfiguredTaskUsageModel(props.model)) {
    return (
      <section>
        {!props.hideTitle && (
          <SectionTitle>{t('Pricing by Group')}</SectionTitle>
        )}
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <UnconfiguredTaskPricingNotice model={props.model} />
      </section>
    )
  }

  const renderGroupPrice = (group: string, type: PriceType) =>
    formatGroupPrice(
      props.model,
      group,
      type,
      props.tokenUnit,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.groupRatio
    )
  const renderFixedGroupPrice = (group: string) =>
    formatFixedPrice(
      props.model,
      group,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.groupRatio
    )

  return (
    <section>
      {!props.hideTitle && <SectionTitle>{t('Pricing by Group')}</SectionTitle>}
      <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
      <StaticDataTable
        className='-mx-4 rounded-none border-0 sm:mx-0'
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={availableGroups}
        getRowKey={(group) => group}
        columns={[
          {
            id: 'group',
            header: t('Group'),
            className: thClass,
            cellClassName: 'py-2.5',
            cell: (group) => <GroupBadge group={group} size='sm' />,
          },
          {
            id: 'ratio',
            header: t('Ratio'),
            className: thClass,
            cellClassName: 'text-muted-foreground py-2.5 font-mono',
            cell: (group) => `${props.groupRatio[group] || 1}x`,
          },
          ...(isTokenBased
            ? [
                {
                  id: 'input',
                  header: t('Input'),
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderGroupPrice(group, 'input'),
                },
                {
                  id: 'output',
                  header: t('Output'),
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderGroupPrice(group, 'output'),
                },
                ...extraPriceTypes.map((ep) => ({
                  id: ep.type,
                  header: ep.label,
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderGroupPrice(group, ep.type),
                })),
              ]
            : [
                {
                  id: 'price',
                  header: t('Price'),
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: renderFixedGroupPrice,
                },
              ]),
        ]}
      />
      <div className='-mx-4 sm:mx-0'>
        {isTokenBased && (
          <p className='text-muted-foreground/40 mt-1.5 px-4 text-[10px] sm:px-0'>
            {t('Prices shown per')} {tokenUnitLabel} tokens
          </p>
        )}
      </div>
    </section>
  )
}

const TAB_VALUES = ['overview', 'performance', 'api'] as const
type TabValue = (typeof TAB_VALUES)[number]

const TAB_META: Record<
  TabValue,
  { icon: React.ComponentType<{ className?: string }>; labelKey: string }
> = {
  overview: { icon: Info, labelKey: 'Overview' },
  performance: { icon: HeartPulse, labelKey: 'Performance' },
  api: { icon: Code2, labelKey: 'API' },
}

export interface ModelDetailsContentProps {
  model: PricingModel
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  endpointMap: Record<string, { path?: string; method?: string }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
}

export function ModelDetailsContent(props: ModelDetailsContentProps) {
  const { t } = useTranslation()
  const showRechargePrice = props.showRechargePrice ?? false
  const showListPrice = usePricingPreferencesStore(
    (state) => state.showListPrice
  )
  const setShowListPrice = usePricingPreferencesStore(
    (state) => state.setShowListPrice
  )

  const isDynamic =
    props.model.billing_mode === 'tiered_expr' &&
    Boolean(props.model.billing_expr)

  const simpleTaskPricing = hasSimpleTaskPricing(props.model)
  const taskTiers = getTaskPricingDisplayTiers(
    props.model.billing_expr,
    props.model.billing_usage_schema
  )
  const showBasePrices =
    !props.model.billing_usage_schema ||
    simpleTaskPricing ||
    taskTiers.length === 0
  // On a site with one group there is nothing to compare: the price section
  // shows what this model costs here, and the per-group table is left out.
  const showGroups = hasSelectableGroups(props.usableGroup)
  const groupRatio = props.model.group_ratio ?? props.groupRatio

  return (
    <div className='@container/details space-y-4'>
      <ModelHeader model={props.model} />

      <OverviewFacts model={props.model} />

      <Tabs defaultValue='overview' className='gap-4'>
        <TabsList
          variant='line'
          className='border-border h-9 w-full justify-start gap-1 border-b group-data-horizontal/tabs:h-9'
        >
          {TAB_VALUES.map((value) => {
            const Icon = TAB_META[value].icon
            return (
              <TabsTrigger
                key={value}
                value={value}
                className='h-9 min-w-0 flex-none gap-1.5 px-2.5 text-[13px]'
              >
                <Icon className='size-3.5' />
                <span className='truncate'>{t(TAB_META[value].labelKey)}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value='overview' className='space-y-6 outline-none'>
          <OverviewSummaryGrid model={props.model} />


          <section className='space-y-5'>
            {/* The heading owns the price block: the two travel together. */}
            <div className='space-y-3'>
              <div className='flex items-start justify-between gap-3'>
                <SectionTitle className='mb-0'>{t('Pricing')}</SectionTitle>
                <div className='-mt-1 flex shrink-0 items-center gap-2'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Show list price')}
                  </span>
                  <Switch
                    size='sm'
                    aria-label={t('Show list price')}
                    checked={showListPrice}
                    onCheckedChange={setShowListPrice}
                  />
                </div>
              </div>
              {showBasePrices && !(isDynamic && !simpleTaskPricing) && (
                <PriceSection
                  model={props.model}
                  priceRate={props.priceRate}
                  usdExchangeRate={props.usdExchangeRate}
                  tokenUnit={props.tokenUnit}
                  showRechargePrice={showRechargePrice}
                  multiplier={
                    showGroups ? 1 : getDisplayGroupRatio(props.model)
                  }
                />
              )}
              {isDynamic && !simpleTaskPricing && (
                <DynamicPricingBreakdown
                  billingExpr={props.model.billing_expr}
                  showSchedule
                  hideListPrice={!showListPrice}
                  priceNote={
                    officialPriceNote(
                      showGroups ? 1 : getDisplayGroupRatio(props.model),
                      t
                    ) ?? undefined
                  }
                  groupRatioMultiplier={
                    showGroups ? 1 : getDisplayGroupRatio(props.model)
                  }
                  usageSchema={props.model.billing_usage_schema}
                  taskPriceOptions={{
                    showRechargePrice,
                    priceRate: props.priceRate,
                    usdExchangeRate: props.usdExchangeRate,
                    tokenUnit: props.tokenUnit,
                  }}
                />
              )}
            </div>
            {showGroups && (
              <GroupPricingSection
                model={props.model}
                groupRatio={groupRatio}
                usableGroup={props.usableGroup}
                autoGroups={props.autoGroups}
                priceRate={props.priceRate}
                usdExchangeRate={props.usdExchangeRate}
                tokenUnit={props.tokenUnit}
                showRechargePrice={showRechargePrice}
              />
            )}
          </section>

          <ModelBenchmark
            key={props.model.model_name}
            modelName={props.model.model_name}
          />
        </TabsContent>

        <TabsContent value='performance' className='outline-none'>
          <ModelDetailsPerformance model={props.model} />
        </TabsContent>

        <TabsContent value='api' className='outline-none'>
          <ModelDetailsApi
            model={props.model}
            endpointMap={props.endpointMap}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Drawer & page wrappers
// ----------------------------------------------------------------------------

export interface ModelDetailsDrawerProps extends ModelDetailsContentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelDetailsDrawer(props: ModelDetailsDrawerProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, ...contentProps } = props

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName(
          'sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl'
        )}
      >
        <SheetHeader className='sr-only'>
          <SheetTitle>{props.model.model_name}</SheetTitle>
          <SheetDescription>{t('Model details')}</SheetDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto px-4 pt-11 pb-5 sm:px-6 sm:pt-12 sm:pb-6'>
          <ModelDetailsContent {...contentProps} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ModelDetails() {
  const { t } = useTranslation()
  const { modelId } = useParams({ from: '/pricing/$modelId/' })
  const search = useSearch({ from: '/pricing/$modelId/' })
  const navigate = useNavigate()

  const {
    models,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const tokenUnit: TokenUnit =
    search.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT

  const model = useMemo(() => {
    if (!models || !modelId) return null
    return models.find((m) => m.model_name === modelId) || null
  }, [models, modelId])

  const handleBack = () => {
    navigate({ to: '/pricing', search })
  }

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-5xl px-4 sm:px-6'>
          <Skeleton className='mb-4 h-5 w-16' />
          <div className='space-y-2'>
            <Skeleton className='h-7 w-64' />
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-4 w-full max-w-md' />
          </div>
          <div className='mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {MODEL_DETAILS_SKELETON_KEYS.map((key) => (
              <Skeleton key={`metric-${key}`} className='h-16 w-full' />
            ))}
          </div>
          <div className='mt-6 space-y-3'>
            {MODEL_DETAILS_SKELETON_KEYS.map((key) => (
              <Skeleton key={`section-${key}`} className='h-24 w-full' />
            ))}
          </div>
        </div>
      </PublicLayout>
    )
  }

  if (!model) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-2xl px-4 text-center sm:px-6'>
          <h2 className='mb-1 text-base font-semibold'>
            {t('Model not found')}
          </h2>
          <p className='text-muted-foreground mb-4 text-sm'>
            {t("The model you're looking for doesn't exist.")}
          </p>
          <Button onClick={handleBack} variant='outline' size='sm'>
            {t('Back to Models')}
          </Button>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-5xl px-4 sm:px-6'>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleBack}
          className='text-muted-foreground hover:text-foreground mb-4 h-auto gap-1 px-0 py-1 text-xs'
        >
          <ArrowLeft className='size-3.5' />
          {t('Back')}
        </Button>

        <ModelDetailsContent
          model={model}
          groupRatio={groupRatio || {}}
          usableGroup={usableGroup || {}}
          autoGroups={autoGroups || []}
          priceRate={priceRate ?? 1}
          usdExchangeRate={usdExchangeRate ?? 1}
          tokenUnit={tokenUnit}
          showRechargePrice={search.rechargePrice ?? false}
          endpointMap={
            (endpointMap as Record<
              string,
              { path?: string; method?: string }
            >) || {}
          }
        />
      </div>
    </PublicLayout>
  )
}

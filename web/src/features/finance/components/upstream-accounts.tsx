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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import { Pencil, ReceiptText, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { LearnMore } from '@/components/learn-more'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  deleteUpstreamAccount,
  listUpstreamAccounts,
  refreshUpstreamAccount,
} from '../api'
import { formatCurrencyAmount, formatUsdAmount } from '../lib'
import type { UpstreamAccount, WorkBuddyPool } from '../types'
import { MetricLabel } from './metric-label'
import { UpstreamAccountDialog } from './upstream-account-dialog'
import { UpstreamTopUpDialog } from './upstream-topup-dialog'

/**
 * Independently funded upstream accounts. Each row is one funding pool: its
 * balance, the billed usage of the last seven days, and the three-day reserve
 * target that usage implies.
 */
export function UpstreamAccounts() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<UpstreamAccount | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<UpstreamAccount | null>(null)
  const [refreshing, setRefreshing] = useState<number | null>(null)
  const [topUps, setTopUps] = useState<UpstreamAccount | null>(null)
  const query = useQuery({
    queryKey: ['finance-upstream-accounts'],
    queryFn: async () => requireServerSuccess(await listUpstreamAccounts()),
    refetchInterval: 60_000,
  })
  const accounts = query.data?.data?.items ?? []
  const belowTarget = accounts.filter(
    (account) => account.gap !== null && account.gap > 0
  )

  async function refresh(account: UpstreamAccount) {
    setRefreshing(account.id)
    try {
      const response = await refreshUpstreamAccount(account.id)
      if (response.success) {
        toast.success(t('Cost report refreshed'))
      } else {
        toast.error(response.message || t('Unable to read the cost report.'))
      }
      await queryClient.invalidateQueries({
        queryKey: ['finance-upstream-accounts'],
      })
    } catch (error) {
      handleServerError(error)
    } finally {
      setRefreshing(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      const response = await deleteUpstreamAccount(deleting.id)
      if (!response.success) {
        throw new Error(response.message || t('Unable to delete the account.'))
      }
      toast.success(t('Deleted'))
      setDeleting(null)
      await queryClient.invalidateQueries({
        queryKey: ['finance-upstream-accounts'],
      })
    } catch (error) {
      handleServerError(error)
    }
  }

  return (
    <section
      aria-label={t('Upstream funding accounts')}
      className='bg-card overflow-hidden rounded-xl border'
    >
      <header className='flex flex-wrap items-center justify-between gap-2 px-5 py-4'>
        <div>
          <h2 className='flex items-center gap-1.5 text-base font-semibold'>
            {t('Upstream funding accounts')}
            <LearnMore
              triggerProps={{
                'aria-label': t('Upstream funding accounts'),
                className:
                  'size-4 shrink-0 border-0 bg-transparent text-muted-foreground hover:bg-transparent [&_svg]:size-3.5',
                openOnHover: true,
                delay: 0,
              }}
              contentProps={{ className: 'max-w-80 text-xs leading-5' }}
            >
              <div className='space-y-1.5'>
                <p>
                  {t(
                    'Seven-day usage determines the three-day reserve. Gateway amounts are USD; CommandCode amounts are credits.'
                  )}
                </p>
                <p>
                  {t(
                    'Top-ups reported by a bound gateway are booked as expenses automatically.'
                  )}
                </p>
              </div>
            </LearnMore>
          </h2>
        </div>
        <Button
          size='sm'
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          {t('Add account')}
        </Button>
      </header>

      {belowTarget.length > 0 && (
        <p className='border-y bg-amber-50 px-5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
          {t('{{count}} accounts are below the three-day reserve target.', {
            count: belowTarget.length,
          })}
        </p>
      )}

      {query.isError && (
        <p className='text-muted-foreground px-5 py-8 text-center text-sm'>
          {t('Unable to load the upstream accounts.')}
        </p>
      )}
      {!query.isError && accounts.length === 0 && (
        <p className='text-muted-foreground px-5 py-8 text-center text-sm'>
          {query.isLoading
            ? t('Loading')
            : t('No upstream accounts yet. Add the pools you fund.')}
        </p>
      )}
      {accounts.length > 0 && (
        <div className='overflow-x-auto border-t'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Account')}</TableHead>
                <TableHead className='text-right'>
                  <MetricLabel
                    label={t('Balance')}
                    align='end'
                    hint={t(
                      'Latest balance: gateway API, bound channel or manual entry. An old reading is marked stale.'
                    )}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <MetricLabel
                    label={t('Seven-day usage')}
                    align='end'
                    hint={t(
                      'What the provider billed over the last seven complete days.'
                    )}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <MetricLabel
                    label={t('Three-day target')}
                    align='end'
                    hint={t(
                      'The seven-day usage divided by seven, times three.'
                    )}
                  />
                </TableHead>
                <TableHead className='text-right'>
                  <MetricLabel
                    label={t('Gap')}
                    align='end'
                    hint={t(
                      'How much the balance is short of the three-day target.'
                    )}
                  />
                </TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => {
                // A pool reading is labelled by what it actually counts: the
                // credit balance, not a weekly allowance.
                const balanceSource = t(
                  account.provider === 'workbuddy' &&
                    account.balance_source === 'pool'
                    ? 'Pool credit balance'
                    : (BALANCE_SOURCE_KEYS[account.balance_source] ??
                        'Manual balance')
                )
                let gapText = t('Unknown')
                if (account.gap !== null) {
                  gapText = account.gap > 0 ? '' : t('On target')
                }
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <span className='font-medium'>{account.name}</span>
                      <span className='text-muted-foreground ml-2 text-xs'>
                        {providerLabel(t, account.provider)}
                      </span>
                      {account.provider === 'workbuddy' && (
                        <Link
                          to='/workbuddy'
                          search={{ tab: 'accounts' }}
                          className='text-primary ml-2 text-xs underline-offset-2 hover:underline'
                        >
                          {t('Manage pool')}
                        </Link>
                      )}
                      {account.provider === 'commandcode' && (
                        <Link
                          to='/commandcode'
                          search={{ tab: 'accounts' }}
                          className='text-primary ml-2 text-xs underline-offset-2 hover:underline'
                        >
                          {t('Manage pool')}
                        </Link>
                      )}
                      {account.workbuddy && (
                        <span className='text-muted-foreground block text-xs'>
                          {t(
                            'Domestic {{domestic}} · International {{international}}',
                            {
                              domestic: formatNumber(
                                workBuddyRealmCount(account.workbuddy, 'cn'),
                                toIntlLocale(i18n.language)
                              ),
                              international: formatNumber(
                                workBuddyRealmCount(
                                  account.workbuddy,
                                  'cn',
                                  true
                                ),
                                toIntlLocale(i18n.language)
                              ),
                            }
                          )}
                        </span>
                      )}
                      {account.pool && (
                        <span className='text-muted-foreground block text-xs'>
                          {account.pool.plans
                            .map((plan) =>
                              t('{{plan}}: {{active}} / {{total}} enabled', {
                                plan: plan.plan === 'go' ? 'Go' : 'Goat',
                                active: formatNumber(
                                  plan.enabled,
                                  toIntlLocale(i18n.language)
                                ),
                                total: formatNumber(
                                  plan.count,
                                  toIntlLocale(i18n.language)
                                ),
                              })
                            )
                            .join(' · ')}
                        </span>
                      )}
                      {account.pool &&
                        account.pool.unknown_count + account.pool.stale_count >
                          0 && (
                          <span className='text-destructive block text-xs'>
                            {t(
                              '{{count}} accounts have unknown plans or unavailable quota.',
                              {
                                count:
                                  account.pool.unknown_count +
                                  account.pool.stale_count,
                              }
                            )}
                          </span>
                        )}
                      {account.topup_count > 0 && (
                        <span className='text-muted-foreground block text-xs'>
                          {t(topUpLabelKey(account.provider), {
                            count: account.topup_count,
                            amount: formatCurrencyAmount(
                              account.topup_total,
                              'CNY',
                              i18n.language
                            ),
                          })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      <FundingAmount
                        account={account}
                        value={account.balance}
                      />
                      {account.workbuddy && (
                        <span className='text-muted-foreground block text-xs'>
                          {t('{{enabled}} of {{total}} accounts enabled', {
                            enabled: formatNumber(
                              account.workbuddy.accounts_enabled,
                              toIntlLocale(i18n.language)
                            ),
                            total: formatNumber(
                              account.workbuddy.accounts_total,
                              toIntlLocale(i18n.language)
                            ),
                          })}
                        </span>
                      )}
                      {account.workbuddy &&
                        account.workbuddy.expiring_credits > 0 && (
                          <span className='text-muted-foreground block text-xs'>
                            {t('{{value}} credits expire within seven days', {
                              value: formatNumber(
                                account.workbuddy.expiring_credits,
                                toIntlLocale(i18n.language)
                              ),
                            })}
                          </span>
                        )}
                      {account.balance !== null && (
                        <span className='text-muted-foreground block text-xs'>
                          {balanceSource}
                          {account.balance_stale ? ` · ${t('Stale')}` : ''}
                        </span>
                      )}
                      {account.balance_error && (
                        <span
                          className='text-muted-foreground block max-w-52 truncate text-xs'
                          title={upstreamErrorText(t, account.balance_error)}
                        >
                          {upstreamErrorText(t, account.balance_error)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {account.usage_status === 'ok' ? (
                        <FundingAmount
                          account={account}
                          value={account.usage_7d}
                        />
                      ) : (
                        t('Unknown')
                      )}
                      {account.pool && !account.pool.usage_complete && (
                        <span className='text-muted-foreground block text-xs'>
                          {t('{{days}}/7 days', {
                            days: formatNumber(
                              account.pool.observed_days,
                              toIntlLocale(i18n.language)
                            ),
                          })}
                        </span>
                      )}
                      {account.pool?.usage_estimated && (
                        <span className='text-muted-foreground block text-xs'>
                          {t('Estimated')}
                        </span>
                      )}
                      {account.workbuddy &&
                        !account.workbuddy.usage_complete && (
                          <span className='text-muted-foreground block text-xs'>
                            {t('{{days}}/7 days', {
                              days: formatNumber(
                                account.workbuddy.observed_days,
                                toIntlLocale(i18n.language)
                              ),
                            })}
                          </span>
                        )}
                      {account.usage_status === 'ok' &&
                        !account.pool &&
                        !account.workbuddy && (
                          <span className='text-muted-foreground block text-xs'>
                            {dayjs
                              .unix(account.usage_window_start)
                              .format('MM-DD')}
                            {' – '}
                            {dayjs
                              .unix(account.usage_window_end)
                              .subtract(1, 'day')
                              .format('MM-DD')}
                          </span>
                        )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      <FundingAmount
                        account={account}
                        value={account.target_3d}
                      />
                      {account.pool?.target_estimated && (
                        <span className='text-muted-foreground block text-xs'>
                          {t('Estimated')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        account.gap !== null &&
                          account.gap > 0 &&
                          'text-destructive'
                      )}
                    >
                      {account.gap !== null && account.gap > 0 ? (
                        <FundingAmount
                          account={account}
                          value={account.gap}
                          roundUp
                        />
                      ) : (
                        gapText
                      )}
                    </TableCell>
                    <TableCell>
                      <UsageStatus account={account} />
                    </TableCell>
                    <TableCell>
                      <div className='flex justify-end gap-1'>
                        {(account.provider === 'newapi' ||
                          account.provider === 'openlux' ||
                          account.provider === 'commandcode' ||
                          account.provider === 'workbuddy' ||
                          account.provider === 'codex789') && (
                          <Button
                            variant='ghost'
                            size='icon'
                            aria-label={t(
                              account.provider === 'commandcode'
                                ? 'Subscription purchases'
                                : 'Top-up history'
                            )}
                            title={t(
                              account.provider === 'commandcode'
                                ? 'Subscription purchases'
                                : 'Top-up history'
                            )}
                            onClick={() => setTopUps(account)}
                          >
                            <ReceiptText className='size-4' />
                          </Button>
                        )}
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={t('Refresh cost report')}
                          title={t('Refresh cost report')}
                          disabled={refreshing === account.id}
                          onClick={() => refresh(account)}
                        >
                          <RefreshCw
                            className={cn(
                              'size-4',
                              refreshing === account.id && 'animate-spin'
                            )}
                          />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={t('Edit')}
                          title={t('Edit')}
                          onClick={() => {
                            setEditing(account)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className='size-4' />
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          aria-label={t('Delete')}
                          title={t('Delete')}
                          onClick={() => setDeleting(account)}
                        >
                          <Trash2 className='size-4' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogOpen && (
        <UpstreamAccountDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditing(null)
          }}
          account={editing ?? undefined}
        />
      )}
      {topUps && (
        <UpstreamTopUpDialog
          account={topUps}
          open={topUps !== null}
          onOpenChange={(open) => {
            if (!open) setTopUps(null)
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('Delete upstream account')}
        desc={t(
          'Only the account record is removed. Channels and balances are untouched.'
        )}
        destructive
        confirmText={t('Delete')}
        handleConfirm={confirmDelete}
      />
    </section>
  )
}

/**
 * The cost report failures the server records, in the reader's language. An
 * unknown message is shown as it came so a new failure is never hidden.
 */
const USAGE_ERROR_KEYS: Record<string, string> = {
  'commandcode finance report is unavailable':
    'CommandCode finance report is unavailable.',
  'invalid commandcode finance report':
    'The CommandCode finance report is invalid or stale.',
  'invalid or stale commandcode finance report':
    'The CommandCode finance report is invalid or stale.',
  'invalid commandcode purchase': 'Invalid CommandCode purchase data.',
  'workbuddy finance report is unavailable':
    'WorkBuddy finance report is unavailable.',
  'invalid workbuddy finance report':
    'The WorkBuddy finance report is invalid or stale.',
  'invalid workbuddy purchase': 'Invalid WorkBuddy purchase data.',

  'the credential was rejected; an Admin key is required':
    'The Admin key was rejected. Use an Admin key.',
  'the credential is not allowed to read the cost report':
    'The Admin key is not allowed to read the cost report.',
  'the provider does not expose this cost report':
    'The provider does not expose a cost report.',
  'the provider rate limited the cost report':
    'The provider rate limited the cost report. Try again later.',
  'cost report request failed': 'The cost report request failed.',
  'the cost report was not valid JSON': 'The cost report was not valid JSON.',
  'the cost report is not in USD': 'The cost report is not in USD.',
  'the cost report holds a non-numeric amount':
    'The cost report holds a non-numeric amount.',
  'could not read the cost report': 'Could not read the cost report.',
  'upstream provider has no official cost report':
    'This provider has no official cost report.',
  'invalid cost report url': 'The cost report address is invalid.',
  'the usage report was not valid JSON': 'The usage report was not valid JSON.',
  'the access token was rejected': 'The access token was rejected.',
  'the access token needs the usage:read scope to read the usage':
    'The token needs usage read access.',
  'the access token needs the profile:read scope to read the balance':
    'The token needs profile:read access to read the balance.',
  'the upstream does not expose a wallet':
    'The gateway does not expose a wallet.',
  'the balance was not valid JSON': 'The balance was not valid JSON.',
  'the upstream status was not valid JSON':
    'The gateway status was not valid JSON.',
  'the upstream did not report its quota unit':
    'The gateway did not report its quota unit.',
  'the new-api base url is required': 'The gateway address is required.',
  'the openlux base url is required': 'The gateway address is required.',
  'the gateway base url is required': 'The gateway address is required.',
  'the openlux credential must be <account id>:<access token>':
    'The credential must be the account id, a colon and the access token.',
  'the openlux account id must be a number':
    'The account id before the colon must be a number.',
  'the credential is not allowed to read the balance':
    'The token is not allowed to read the balance.',
  'the credential is not allowed to read the usage report':
    'The token is not allowed to read the usage.',
}

/** One realm's account count, or everything but it when `others` is set. */
function workBuddyRealmCount(
  pool: WorkBuddyPool,
  realm: string,
  others = false
): number {
  return pool.realms
    .filter((entry) => (entry.realm === realm) !== others)
    .reduce((total, entry) => total + entry.total, 0)
}

/** How a funding account's payments are counted in the row summary. */
function topUpLabelKey(provider: string): string {
  if (provider === 'commandcode') return '{{count}} subscriptions · {{amount}}'
  if (provider === 'workbuddy') return '{{count}} accounts · {{amount}}'
  return '{{count}} top-ups · {{amount}}'
}

function providerLabel(t: TFunction, provider: string): string {
  if (provider === 'commandcode') return 'CommandCode'

  if (provider === 'workbuddy') return 'WorkBuddy'

  if (provider === 'codex789') return 'codex789'

  if (provider === 'openlux') return 'OpenLux'

  if (provider === 'newapi') {
    return t('New API')
  }
  return provider === 'openai' ? 'OpenAI' : 'Anthropic'
}

const BALANCE_SOURCE_KEYS: Record<string, string> = {
  api: 'API balance',
  pool: 'Pool weekly availability',
  channel: 'Channel balance',
  manual: 'Manual balance',
}

function upstreamErrorText(t: TFunction, message: string): string {
  const httpStatus = /^the provider answered HTTP (\d+)$/.exec(message)
  if (httpStatus) {
    return t('The provider answered HTTP {{status}}.', {
      status: httpStatus[1],
    })
  }
  const key = USAGE_ERROR_KEYS[message]
  return key ? t(key) : message
}

/** The last refresh result, with the provider message shown in place. */
function UsageStatus(props: { account: UpstreamAccount }) {
  const { t } = useTranslation()
  if (props.account.usage_status === 'never') {
    return (
      <Badge variant='outline' className='whitespace-nowrap'>
        {t('Never refreshed')}
      </Badge>
    )
  }
  if (props.account.usage_status === 'error') {
    return (
      <div className='space-y-1'>
        <Badge variant='destructive' className='whitespace-nowrap'>
          {t('Refresh failed')}
        </Badge>
        <span
          className='text-muted-foreground block max-w-52 truncate text-xs'
          title={upstreamErrorText(t, props.account.usage_error)}
        >
          {upstreamErrorText(t, props.account.usage_error)}
        </span>
      </div>
    )
  }
  const stale = dayjs().unix() - props.account.usage_checked_at > 24 * 60 * 60
  return (
    <div className='space-y-1'>
      <Badge
        variant={stale ? 'outline' : 'secondary'}
        className='whitespace-nowrap'
      >
        {stale ? t('Stale') : t('Up to date')}
      </Badge>
      <span className='text-muted-foreground block text-xs'>
        {t('Checked {{time}}', {
          time: dayjs
            .unix(props.account.usage_checked_at)
            .format('MM-DD HH:mm'),
        })}
      </span>
    </div>
  )
}

function FundingAmount(props: {
  account: UpstreamAccount
  value: number | null
  /** Gap only: also show how many Go or Goat subscriptions cover it. */
  roundUp?: boolean
}) {
  const { t, i18n } = useTranslation()
  if (props.value === null) return t('Unknown')
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  // WorkBuddy's pool is counted in credits only: there is no weekly plan to
  // divide it into, so the bare amount is the whole story.
  if (props.account.provider === 'workbuddy') {
    return t('{{value}} credits', { value: formatNumber(props.value, locale) })
  }
  if (props.account.provider !== 'commandcode') {
    return formatUsdAmount(props.value, i18n.language)
  }
  const plans = props.account.pool?.plans ?? []
  const go = plans.find((plan) => plan.plan === 'go')?.weekly_cap ?? 0
  const goat = plans.find((plan) => plan.plan === 'goat')?.weekly_cap ?? 0
  const amount = t('{{value}} credits', {
    value: formatNumber(props.value, locale),
  })
  if (!props.roundUp || go <= 0 || goat <= 0) return amount
  return (
    <>
      {amount}
      <span className='text-muted-foreground block text-xs whitespace-nowrap'>
        {t('{{go}}go/{{goat}}goat', {
          go: formatNumber(props.value / go, locale),
          goat: formatNumber(props.value / goat, locale),
        })}
      </span>
    </>
  )
}

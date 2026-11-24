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
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TitledCard } from '@/components/ui/titled-card'

import type { HubScalarSectionProps, HubSettingsScalarKey } from './types'

type BehaviourToggle = {
  key: HubSettingsScalarKey
  label: string
  description: string
}

const TOGGLES: BehaviourToggle[] = [
  {
    key: 'enable_anthropic_messages',
    label: 'Anthropic Messages endpoint',
    description: 'Serve /v1/messages next to the OpenAI-compatible endpoints.',
  },
  {
    key: 'reasoning_effort_map',
    label: 'Map thinking levels',
    description:
      'Translate the client reasoning effort onto the upstream level instead of passing it through.',
  },
  {
    key: 'filter_models_by_key',
    label: 'Filter the model list by API key',
    description:
      'Only list the models a key is allowed to use, instead of the whole catalogue.',
  },
  {
    key: 'models_only_available',
    label: 'List only available models',
    description:
      'Drop models no account can serve right now from the model list.',
  },
  {
    key: 'free_model_credit_fallback',
    label: 'Fall back to credit plans',
    description:
      'Use the paid credit plan once the free allowance for a model runs out.',
  },
  {
    key: 'auto_switch_product',
    label: 'Switch the egress identity automatically',
    description:
      'Rotate the advertised client identity when an upstream answers 429.',
  },
  {
    key: 'daily_chat_web',
    label: 'Daily activity through the web client',
    description:
      'Send one real chat per day over the web client to keep accounts warm.',
  },
  {
    key: 'daily_chat_web_fallback_activity',
    label: 'Fall back to the activity API',
    description:
      'Use the plain activity report when the web client daily chat fails.',
  },
  {
    key: 'local_web_tools',
    label: 'Run web tools on the gateway',
    description:
      'Execute web_search and web_fetch here instead of passing the declarations upstream.',
  },
  {
    key: 'remaining_priority_enabled',
    label: 'Prefer accounts with quota left',
    description:
      'Dispatch to the account and model pairs that still have the most room.',
  },
  {
    key: 'egress_backoff_enabled',
    label: 'Back off failing egresses',
    description: 'Hold a proxy slot out of rotation after transient failures.',
  },
  {
    key: 'realm_fallback_enabled',
    label: 'Fall back from international to China',
    description:
      'Retry on the China realm when the international one is rate limited.',
  },
  {
    key: 'window_probe',
    label: 'Probe quota windows',
    description:
      'Request each model once when its quota window resets, to learn the new budget.',
  },
  {
    key: 'affinity_stable_key_enabled',
    label: 'Stable session affinity key',
    description:
      'Derive the affinity key from the first reply as well, so a retried turn sticks to the same account.',
  },
  {
    key: 'update_check_enabled',
    label: 'Check for updates daily',
    description: 'Let the gateway look for a newer release once a day.',
  },
]

/**
 * The gateway's behaviour switches: protocol surface, model listing, dispatch
 * policy and the daily activity job. All of them are plain booleans, so they
 * share one draft and one save.
 */
export function BehaviourSection(props: HubScalarSectionProps) {
  const { t } = useTranslation()

  return (
    <TitledCard
      icon={<SlidersHorizontal />}
      title={t('Behaviour switches')}
      description={t(
        'How the gateway answers clients, lists models and picks accounts.'
      )}
    >
      <div className='divide-y'>
        {TOGGLES.map((toggle) => {
          const checked =
            (props.values[toggle.key] as boolean | undefined) ??
            (props.settings[toggle.key] as boolean)
          return (
            <div
              key={toggle.key}
              className='flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0'
            >
              <div className='min-w-0'>
                <Label htmlFor={`toggle-${toggle.key}`}>
                  {t(toggle.label)}
                </Label>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  {t(toggle.description)}
                </p>
              </div>
              <Switch
                id={`toggle-${toggle.key}`}
                checked={checked}
                onCheckedChange={(next) => props.onChange(toggle.key, next)}
              />
            </div>
          )
        })}
      </div>
    </TitledCard>
  )
}

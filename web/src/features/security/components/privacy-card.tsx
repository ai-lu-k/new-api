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
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPanel } from '@/components/section-panel'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { updateUserSettings } from '@/features/profile/api'
import { parseUserSettings } from '@/features/profile/lib/format'
import type { UserProfile } from '@/features/profile/types'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

type PrivacyCardProps = {
  profile: UserProfile
  onUpdate: () => void
}

export function PrivacyCard(props: PrivacyCardProps) {
  const { t } = useTranslation()
  const [recordIpLog, setRecordIpLog] = useState(() =>
    Boolean(parseUserSettings(props.profile.setting).record_ip_log)
  )
  useEffect(() => {
    setRecordIpLog(
      Boolean(parseUserSettings(props.profile.setting).record_ip_log)
    )
  }, [props.profile.setting])

  const save = useMutation({
    mutationFn: async () => {
      const response = await updateUserSettings({ record_ip_log: recordIpLog })
      if (!response.success) {
        throw createServerError(response, t('Failed to update settings'))
      }
    },
    onSuccess: () => {
      toast.success(t('Settings updated successfully'))
      props.onUpdate()
    },
    onError: (error) =>
      handleServerError(error, t('Failed to update settings')),
  })

  return (
    <SectionPanel
      title={t('Record IP Address')}
      level='card'
      contentClassName='pt-1'
    >
      {/* The switch keeps the group's name through aria-label, so the card
          title is not repeated as a second, identical field label. */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <Switch
            id='security-record-ip'
            aria-label={t('Record IP Address')}
            checked={recordIpLog}
            onCheckedChange={setRecordIpLog}
            disabled={save.isPending}
          />
          <p className='text-muted-foreground text-[13px]'>
            {t('Log IP address for usage and error logs')}
          </p>
        </div>
        <Button
          type='button'
          className='min-h-11 sm:min-h-8'
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending && <Loader2 className='size-4 animate-spin' />}
          {save.isPending ? t('Saving...') : t('Save Settings')}
        </Button>
      </div>
    </SectionPanel>
  )
}

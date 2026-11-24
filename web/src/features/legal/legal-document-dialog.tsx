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
import i18next from 'i18next'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { isLikelyHtml } from '@/lib/content-format'

import { legalLanguage } from './api'
import { legalDocumentText } from './lib/document-text'
import type { LegalVersion } from './types'

export function LegalDocumentDialog(props: {
  version: LegalVersion
  document: 'user_agreement' | 'privacy_policy'
  onClose: () => void
}) {
  const { t } = useTranslation()
  const content = legalDocumentText(
    props.version,
    props.document,
    legalLanguage() || i18next.language
  )
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={
        props.document === 'user_agreement'
          ? t('User Agreement')
          : t('Privacy Policy')
      }
      description={`${t('Version')} ${props.version.id}`}
      contentClassName='sm:max-w-3xl'
      contentHeight='min(60dvh, 36rem)'
      footer={
        <Button type='button' variant='outline' onClick={props.onClose}>
          {t('Back')}
        </Button>
      }
    >
      <RichContent
        content={content}
        mode={isLikelyHtml(content) ? 'html' : 'markdown'}
        htmlVariant='isolated'
        className='prose-neutral dark:prose-invert max-w-none break-words'
      />
    </Dialog>
  )
}

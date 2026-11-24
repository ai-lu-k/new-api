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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useSiteEndpoints } from '@/hooks/use-site-endpoints'
import { dashedTextActionClass } from '@/lib/text-action'

import { DocNote, DocSteps, DocWarning, TutorialCode } from '../components'

const ENV_EXAMPLE = `# macOS / Linux
export NEW_API_KEY="sk-你的Key"

# Windows PowerShell
$env:NEW_API_KEY = "sk-你的Key"`

/** 02 — the key: the only thing the reader has to take away from this page. */
export function KeySection() {
  const { t } = useTranslation()
  const endpoints = useSiteEndpoints()

  return (
    <>
      <p>
        {t(
          'The API Key is your identity on the gateway: every request carries it, and usage is billed against that key.'
        )}
      </p>

      <h3>{t('What to do')}</h3>
      <DocSteps>
        <li>
          {t('Open {{site}}, sign up and sign in.', {
            site: endpoints.site,
          })}
        </li>
        <li>{t('Open the workspace from the top navigation.')}</li>
        <li>
          {t(
            'Open "API Keys" on the left, click "Create API Key" and give it a name you will recognise, such as {{name}}.',
            { name: 'my-first-key' }
          )}
        </li>
      </DocSteps>

      <DocWarning title={t('The key is shown once, when you create it')}>
        {t(
          'Copy it into a password manager or a local environment variable; once the page is closed it is gone and the only way back is creating a new one. Never paste it into a group chat, a repository or front-end code — whoever gets it can spend the balance on your account.'
        )}
      </DocWarning>

      <p>
        {t(
          'Store it as an environment variable; the command-line examples below all read it:'
        )}
      </p>
      <TutorialCode code={ENV_EXAMPLE} />

      <DocNote>
        {t(
          'A key can be disabled or deleted at any time; the old key does not expire by itself, so a suspected leak is handled by disabling it and creating a new one.'
        )}{' '}
        <Link to='/keys' className={dashedTextActionClass}>
          {t('Manage your keys')}
        </Link>
      </DocNote>
    </>
  )
}

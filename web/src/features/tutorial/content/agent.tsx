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

import { useSiteEndpoints } from '@/hooks/use-site-endpoints'

import { DocNote, DocTable, DocWarning } from '../components'

/**
 * 03 — the page an agent reads. Everything here is a fact it can act on
 * without asking the person who pointed it at this site.
 */
export function AgentSection() {
  const { t } = useTranslation()
  const endpoints = useSiteEndpoints()
  const modelsUrl = `${endpoints.base}/models`

  return (
    <>
      <p>
        {t(
          'This section is for an agent reading the site: the address, the authentication, the model names and the backoff are below, so act on them instead of asking the user first.'
        )}
      </p>

      <DocTable label={t('Call facts')}>
        <thead>
          <tr>
            <th scope='col'>{t('Call facts')}</th>
            <th scope='col'>{t('Value')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope='row'>base_url</th>
            <td>{endpoints.base}</td>
          </tr>
          <tr>
            <th scope='row'>{t('Authentication')}</th>
            <td>Authorization: Bearer $NEW_API_KEY</td>
          </tr>
          <tr>
            <th scope='row'>{t('Model names')}</th>
            <td>GET {modelsUrl}</td>
          </tr>
        </tbody>
      </DocTable>

      <h3>{t('Five protocol entry points')}</h3>
      <DocTable label={t('The five protocol entry points')}>
        <thead>
          <tr>
            <th scope='col'>{t('Protocol')}</th>
            <th scope='col'>{t('Path')}</th>
            <th scope='col'>{t('When to use it')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope='row'>openai</th>
            <td>/v1/chat/completions</td>
            <td>{t('Most SDKs and clients')}</td>
          </tr>
          <tr>
            <th scope='row'>openai-response</th>
            <td>/v1/responses</td>
            <td>{t('When you want the OpenAI Responses format')}</td>
          </tr>
          <tr>
            <th scope='row'>anthropic</th>
            <td>/v1/messages</td>
            <td>
              {t('The official Claude SDK, Claude Code and tools like it')}
            </td>
          </tr>
          <tr>
            <th scope='row'>gemini</th>
            <td>:generateContent</td>
            <td>{t('Clients that speak the native Gemini format')}</td>
          </tr>
          <tr>
            <th scope='row'>image-generation</th>
            <td>/v1/images/generations</td>
            <td>{t('Text to image')}</td>
          </tr>
        </tbody>
      </DocTable>

      <DocWarning title={t('Do not make the user your executor')}>
        {t(
          'Use the key already configured where you run. Do not ask the user to paste a key into the conversation, and do not ask the user to send the request for you.'
        )}
      </DocWarning>

      <DocNote>
        {t(
          'A 429 or an exhausted key is a pause, not a failure: back off and retry, and read the remaining allowance in the console before retrying again.'
        )}
      </DocNote>
    </>
  )
}

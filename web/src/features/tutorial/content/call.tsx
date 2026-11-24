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

import { DocNote, DocWarning, TutorialCode } from '../components'

const curlExample = (base: string) => `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $NEW_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v4.1-flash-x0.15",
    "messages": [
      {"role": "user", "content": "用一句话介绍自己"}
    ]
  }'`

/**
 * 02 — the call itself. Three things decide whether it works: the address, the
 * key and the model name; everything else is the client's business.
 */
export function CallSection() {
  const { t } = useTranslation()
  const endpoints = useSiteEndpoints()
  const modelsUrl = `${endpoints.base}/models`

  return (
    <>
      <p>
        {t(
          'A request needs three things: the address, the key and a model name. Everything else belongs to the client you already use.'
        )}
      </p>

      <TutorialCode code={curlExample(endpoints.base)} />

      <DocNote>
        {t(
          'Set base_url to {{base}} and nothing further: adding /chat/completions by hand gives you a path the SDK then completes a second time.',
          { base: endpoints.base }
        )}
      </DocNote>

      <DocWarning title={t('model must match the name on sale exactly')}>
        {t(
          'Case, hyphens and a suffix such as {{suffix}} all have to match. Read the current list from {{url}} instead of spelling a name from memory; one character out means the model does not exist, and that is where most of these errors come from.',
          { suffix: 'x0.15', url: modelsUrl }
        )}
      </DocWarning>

      <p>
        {t(
          'The API tab on a model detail page is this same call: cURL by default, with Python and Node a click away in the top right.'
        )}
      </p>
    </>
  )
}

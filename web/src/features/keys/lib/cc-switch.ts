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
// endpointPath is what each application expects after the site address.
export const CC_SWITCH_APPS = {
  claude: {
    label: 'Claude',
    defaultName: 'My Claude',
    endpointPath: '',
    modelFields: [
      { key: 'model', labelKey: 'Primary Model', required: true },
      { key: 'haikuModel', labelKey: 'Haiku Model', required: false },
      { key: 'sonnetModel', labelKey: 'Sonnet Model', required: false },
      { key: 'opusModel', labelKey: 'Opus Model', required: false },
    ],
  },
  codex: {
    label: 'Codex',
    defaultName: 'My Codex',
    endpointPath: '/v1',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
  gemini: {
    label: 'Gemini',
    defaultName: 'My Gemini',
    endpointPath: '',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
  opencode: {
    label: 'OpenCode',
    defaultName: 'My OpenCode',
    endpointPath: '/v1',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
  openclaw: {
    label: 'OpenClaw',
    defaultName: 'My OpenClaw',
    endpointPath: '/v1',
    modelFields: [{ key: 'model', labelKey: 'Primary Model', required: true }],
  },
} as const

export type CCSwitchApp = keyof typeof CC_SWITCH_APPS

function getServerAddress(): string {
  try {
    const raw = localStorage.getItem('status')
    if (raw) {
      const status = JSON.parse(raw)
      if (status.server_address) return status.server_address
    }
  } catch {
    /* empty */
  }
  return window.location.origin
}

/** The link that makes CC Switch import the gateway as a provider of one app. */
export function buildCCSwitchURL(
  app: CCSwitchApp,
  name: string,
  models: Record<string, string>,
  apiKey: string
): string {
  const serverAddress = getServerAddress()
  const endpoint = serverAddress + CC_SWITCH_APPS[app].endpointPath
  const params = new URLSearchParams()
  params.set('resource', 'provider')
  params.set('app', app)
  params.set('name', name)
  params.set('endpoint', endpoint)
  params.set('apiKey', apiKey)
  for (const [k, v] of Object.entries(models)) {
    if (v) params.set(k, v)
  }
  params.set('homepage', serverAddress)
  params.set('enabled', 'true')
  return `ccswitch://v1/import?${params.toString()}`
}

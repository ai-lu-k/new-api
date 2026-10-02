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
import type { AgentClient, SetupModel } from './agents'

/** The gateway as a client config names it: display name and public address. */
export type GatewaySite = {
  name: string
  address: string
}

/** A piece of configuration to paste: into `file`, or into a terminal. */
export type ConfigBlock = {
  file: string | null
  code: string
}

type AgentConfigInput = {
  client: AgentClient
  site: GatewaySite
  apiKey: string
  /** The model the client starts with. */
  model: string
  /** Every model offered to this client. */
  models: SetupModel[]
}

// Codex keeps these provider ids for itself.
const RESERVED_PROVIDER_IDS = new Set(['openai', 'ollama', 'lmstudio'])

function baseAddress(site: GatewaySite): string {
  return site.address.replace(/\/+$/, '')
}

/** The id the gateway goes by inside a client's config, e.g. "luk". */
function providerId(site: GatewaySite): string {
  const slug = site.name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  if (!/^[a-z]/.test(slug)) return 'gateway'
  return RESERVED_PROVIDER_IDS.has(slug) ? `${slug}-gateway` : slug
}

/** The models served on the protocol the client speaks. */
export function agentModels(
  client: AgentClient,
  models: SetupModel[]
): SetupModel[] {
  return models.filter((model) => model.protocols.includes(client.protocol))
}

/**
 * The model a client starts with: one from the family it is built for, else
 * the site's default, else the first it can use. Empty when it can use none.
 */
export function pickAgentModel(
  client: AgentClient,
  models: SetupModel[],
  siteDefault: string
): string {
  const offered = agentModels(client, models)
  const native = client.prefers
    ? offered.find((model) => model.id.startsWith(client.prefers))
    : undefined
  if (native) return native.id
  if (offered.some((model) => model.id === siteDefault)) return siteDefault
  return offered[0]?.id ?? ''
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** What a user pastes to set a client up by hand, file by file. */
export function buildAgentConfig(input: AgentConfigInput): ConfigBlock[] {
  const base = baseAddress(input.site) + input.client.basePath
  const id = providerId(input.site)

  if (input.client.id === 'claude-code') {
    return [
      {
        file: '~/.claude/settings.json',
        code: json({
          env: {
            ANTHROPIC_BASE_URL: base,
            ANTHROPIC_AUTH_TOKEN: input.apiKey,
            ANTHROPIC_MODEL: input.model,
          },
        }),
      },
    ]
  }

  if (input.client.id === 'codex') {
    const envKey = `${id.toUpperCase().replaceAll('-', '_')}_API_KEY`
    return [
      {
        file: '~/.codex/config.toml',
        code: [
          `model = ${JSON.stringify(input.model)}`,
          `model_provider = ${JSON.stringify(id)}`,
          '',
          `[model_providers.${id}]`,
          `name = ${JSON.stringify(input.site.name)}`,
          `base_url = ${JSON.stringify(base)}`,
          `env_key = ${JSON.stringify(envKey)}`,
        ].join('\n'),
      },
      { file: null, code: `export ${envKey}=${JSON.stringify(input.apiKey)}` },
    ]
  }

  if (input.client.id === 'opencode') {
    const models: Record<string, unknown> = {}
    for (const model of input.models) {
      // OpenCode takes a limit only as a pair.
      const limit =
        model.context_window && model.max_tokens
          ? { context: model.context_window, output: model.max_tokens }
          : undefined
      models[model.id] = { name: model.name || model.id, limit }
    }
    return [
      {
        file: '~/.config/opencode/opencode.json',
        code: json({
          $schema: 'https://opencode.ai/config.json',
          provider: {
            [id]: {
              npm: '@ai-sdk/openai-compatible',
              name: input.site.name,
              options: { baseURL: base, apiKey: input.apiKey },
              models,
            },
          },
          model: `${id}/${input.model}`,
        }),
      },
    ]
  }

  return [
    {
      file: '~/.openclaw/openclaw.json',
      code: json({
        agents: {
          defaults: { model: { primary: `${id}/${input.model}` } },
        },
        models: {
          mode: 'merge',
          providers: {
            [id]: {
              baseUrl: base,
              apiKey: input.apiKey,
              api: 'openai-completions',
              models: input.models.map((model) => ({
                id: model.id,
                name: model.name || model.id,
                input: model.input?.length ? model.input : undefined,
                contextWindow: model.context_window || undefined,
                maxTokens: model.max_tokens || undefined,
              })),
            },
          },
        },
      }),
    },
  ]
}

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
import { describe, expect, it } from 'vitest'

import { agentModels, buildAgentConfig, pickAgentModel } from '../agent-configs'
import { AGENT_CLIENTS, type SetupModel } from '../agents'

const models: SetupModel[] = [
  { id: 'claude-sonnet-5-5', protocols: ['anthropic-messages'] },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    protocols: ['openai-completions', 'anthropic-messages', 'openai-responses'],
    context_window: 1000000,
    max_tokens: 32768,
    input: ['text', 'image'],
  },
  { id: 'glm-5.3', name: 'GLM 5.3', protocols: ['openai-completions'] },
  {
    id: 'gpt-5.6-sol',
    protocols: ['openai-completions', 'openai-responses'],
  },
]

const site = { name: 'DEMO', address: 'https://ai.example.test/' }

it('exports catalog capabilities to OpenCode without inventing reasoning levels', () => {
  const selectedClient = client('opencode')
  const result = buildAgentConfig({
    client: selectedClient,
    site,
    apiKey: 'sk-test',
    model: 'example-x0.2',
    models: [
      {
        id: 'example-x0.2',
        protocols: ['openai-completions'],
        context_window: 128000,
        max_tokens: 8192,
        input: ['text', 'image'],
        output: ['text'],
        reasoning_efforts: { off: 'none', high: 'high' },
      },
    ],
  })
  const parsed = JSON.parse(result[0].code)
  const provider = Object.values(parsed.provider)[0] as {
    models: Record<string, unknown>
  }
  expect(provider.models['example-x0.2']).toEqual({
    name: 'example-x0.2',
    limit: { context: 128000, output: 8192 },
    modalities: { input: ['text', 'image'], output: ['text'] },
    reasoning: true,
    variants: {
      off: { reasoningEffort: 'none' },
      high: { reasoningEffort: 'high' },
    },
  })
})

function client(id: string) {
  const found = AGENT_CLIENTS.find((item) => item.id === id)
  if (!found) throw new Error(`no client ${id}`)
  return found
}

describe('models offered to a client', () => {
  it('are the ones served on the protocol the client speaks', () => {
    expect(agentModels(client('claude-code'), models).map((m) => m.id)).toEqual(
      ['claude-sonnet-5-5', 'deepseek/deepseek-v4.1-flash']
    )
    expect(agentModels(client('codex'), models).map((m) => m.id)).toEqual([
      'deepseek/deepseek-v4.1-flash',
      'gpt-5.6-sol',
    ])
    expect(agentModels(client('opencode'), models).map((m) => m.id)).toEqual([
      'deepseek/deepseek-v4.1-flash',
      'glm-5.3',
      'gpt-5.6-sol',
    ])
    expect(agentModels(client('pi'), models).map((m) => m.id)).toEqual([
      'deepseek/deepseek-v4.1-flash',
      'glm-5.3',
      'gpt-5.6-sol',
    ])
    expect(agentModels(client('grok-build'), models).map((m) => m.id)).toEqual([
      'deepseek/deepseek-v4.1-flash',
      'gpt-5.6-sol',
    ])
  })

  it('default to the family the client is built for, then to the site default', () => {
    const siteDefault = 'deepseek/deepseek-v4.1-flash'

    expect(pickAgentModel(client('claude-code'), models, siteDefault)).toBe(
      'claude-sonnet-5-5'
    )
    expect(pickAgentModel(client('codex'), models, siteDefault)).toBe(
      'gpt-5.6-sol'
    )
    expect(pickAgentModel(client('opencode'), models, siteDefault)).toBe(
      'deepseek/deepseek-v4.1-flash'
    )
    expect(pickAgentModel(client('opencode'), models, 'not-offered')).toBe(
      'deepseek/deepseek-v4.1-flash'
    )
    expect(pickAgentModel(client('pi'), models, siteDefault)).toBe(
      'deepseek/deepseek-v4.1-flash'
    )
    expect(pickAgentModel(client('grok-build'), models, siteDefault)).toBe(
      'deepseek/deepseek-v4.1-flash'
    )
    expect(pickAgentModel(client('codex'), [], siteDefault)).toBe('')
  })

  it('pass over the family a client prefers when it is served on another protocol', () => {
    const grokOnChat: SetupModel[] = [
      { id: 'grok-4.7', protocols: ['openai-completions'] },
      { id: 'gpt-6-luna', protocols: ['openai-responses'] },
    ]

    expect(pickAgentModel(client('grok-build'), grokOnChat, 'grok-4.7')).toBe(
      'gpt-6-luna'
    )
  })
})

describe('manual configuration', () => {
  const build = (id: string, model: string) =>
    buildAgentConfig({
      client: client(id),
      site,
      apiKey: 'sk-abc',
      model,
      models: agentModels(client(id), models),
    })

  it('gives Claude Code its gateway variables in settings.json', () => {
    expect(build('claude-code', 'claude-sonnet-5-5')).toEqual([
      {
        file: '~/.claude/settings.json',
        code: `{
  "env": {
    "ANTHROPIC_BASE_URL": "https://ai.example.test",
    "ANTHROPIC_AUTH_TOKEN": "sk-abc",
    "ANTHROPIC_MODEL": "claude-sonnet-5-5"
  }
}`,
      },
    ])
  })

  it('gives Codex a provider that reads the key from the environment', () => {
    expect(build('codex', 'gpt-5.6-sol')).toEqual([
      {
        file: '~/.codex/config.toml',
        code: `model = "gpt-5.6-sol"
model_provider = "demo"

[model_providers.demo]
name = "DEMO"
base_url = "https://ai.example.test/v1"
env_key = "DEMO_API_KEY"`,
      },
      { file: null, code: 'export DEMO_API_KEY="sk-abc"' },
    ])
  })

  it('lists every chat model for OpenCode, with limits where both are known', () => {
    const [block] = build('opencode', 'glm-5.3')

    expect(block.file).toBe('~/.config/opencode/opencode.json')
    expect(JSON.parse(block.code)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      model: 'demo/glm-5.3',
      provider: {
        demo: {
          npm: '@ai-sdk/openai-compatible',
          name: 'DEMO',
          options: { baseURL: 'https://ai.example.test/v1', apiKey: 'sk-abc' },
          models: {
            'deepseek/deepseek-v4.1-flash': {
              name: 'DeepSeek V4.1 Flash',
              limit: { context: 1000000, output: 32768 },
              modalities: { input: ['text', 'image'] },
            },
            'glm-5.3': { name: 'GLM 5.3' },
            'gpt-5.6-sol': { name: 'gpt-5.6-sol' },
          },
        },
      },
    })
  })

  it('gives OpenClaw a merged provider and makes the model its default', () => {
    const [block] = build('openclaw', 'deepseek/deepseek-v4.1-flash')

    expect(block.file).toBe('~/.openclaw/openclaw.json')
    expect(JSON.parse(block.code)).toEqual({
      agents: {
        defaults: {
          model: { primary: 'demo/deepseek/deepseek-v4.1-flash' },
        },
      },
      models: {
        mode: 'merge',
        providers: {
          demo: {
            baseUrl: 'https://ai.example.test/v1',
            apiKey: 'sk-abc',
            api: 'openai-completions',
            models: [
              {
                id: 'deepseek/deepseek-v4.1-flash',
                name: 'DeepSeek V4.1 Flash',
                input: ['text', 'image'],
                contextWindow: 1000000,
                maxTokens: 32768,
              },
              { id: 'glm-5.3', name: 'GLM 5.3' },
              { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol' },
            ],
          },
        },
      },
    })
  })

  it('gives Pi a provider node in models.json and its default in settings.json', () => {
    const blocks = build('pi', 'deepseek/deepseek-v4.1-flash')

    expect(blocks.map((block) => block.file)).toEqual([
      '~/.pi/agent/models.json',
      '~/.pi/agent/settings.json',
    ])
    expect(JSON.parse(blocks[0].code)).toEqual({
      providers: {
        demo: {
          name: 'DEMO',
          baseUrl: 'https://ai.example.test/v1',
          apiKey: 'sk-abc',
          api: 'openai-completions',
          models: [
            { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
            { id: 'glm-5.3', name: 'GLM 5.3' },
            { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol' },
          ],
        },
      },
    })
    expect(JSON.parse(blocks[1].code)).toEqual({
      defaultProvider: 'demo',
      defaultModel: 'deepseek/deepseek-v4.1-flash',
    })
  })

  it('gives Grok Build the model table that its [models] default selects', () => {
    expect(build('grok-build', 'deepseek/deepseek-v4.1-flash')).toEqual([
      {
        file: '~/.grok/config.toml',
        code: `[models]
default = "deepseek/deepseek-v4.1-flash"

[model."deepseek/deepseek-v4.1-flash"]
model = "deepseek/deepseek-v4.1-flash"
base_url = "https://ai.example.test/v1"
name = "DEMO"
api_key = "sk-abc"
api_backend = "responses"
context_window = 1000000`,
      },
    ])
  })

  it('falls back to the context window Grok Build itself defaults to', () => {
    const [block] = build('grok-build', 'gpt-5.6-sol')

    expect(block.code).toContain('context_window = 500000')
  })

  it('lists the model that Pi settings.json makes the default, and lists it first', () => {
    const blocks = build('pi', 'glm-5.3')
    const ids = JSON.parse(blocks[0].code).providers.demo.models.map(
      (model: { id: string }) => model.id
    )

    expect(ids).toEqual([
      'glm-5.3',
      'deepseek/deepseek-v4.1-flash',
      'gpt-5.6-sol',
    ])
    expect(ids).toContain(JSON.parse(blocks[1].code).defaultModel)
  })

  it('keeps a Pi default that the catalogue did not list', () => {
    const blocks = build('pi', 'model-not-in-catalogue')
    const listed = JSON.parse(blocks[0].code).providers.demo.models

    expect(listed[0]).toEqual({
      id: 'model-not-in-catalogue',
      name: 'model-not-in-catalogue',
    })
  })

  it('selects the Grok Build model table it writes', () => {
    const [block] = build('grok-build', 'gpt-5.6-sol')
    const profile = block.code.match(/^default = "(.+)"$/m)?.[1] ?? ''

    expect(profile).toBe('gpt-5.6-sol')
    expect(block.code).toContain(`[model."${profile}"]`)
  })

  it('derives the provider id from the site name', () => {
    const [config, shell] = buildAgentConfig({
      client: client('codex'),
      site: { name: 'My Gateway 2', address: 'https://gw.example.test' },
      apiKey: 'sk-abc',
      model: 'gpt-5.6-sol',
      models: agentModels(client('codex'), models),
    })

    expect(config.code).toContain('[model_providers.my-gateway-2]')
    expect(shell.code).toBe('export MY_GATEWAY_2_API_KEY="sk-abc"')
  })
})

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
/** The wire protocols the gateway serves, in the names the setup API uses. */
export type AgentProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'

/** One model as the setup API describes it to a coding client. */
export type SetupModel = {
  id: string
  name?: string
  protocols: AgentProtocol[]
  context_window?: number
  max_tokens?: number
  input?: string[]
}

/**
 * A coding agent that is set up through CC Switch or by editing its config
 * file. DSH is not listed here: it has its own one-command setup.
 */
export type AgentClient = {
  /** Stable id; also the hash of its entry in the quick-start navigation. */
  id: 'claude-code' | 'codex' | 'opencode' | 'openclaw'
  /** Product name, never translated. */
  name: string
  /** The app CC Switch files an imported provider under. */
  ccSwitchApp: 'claude' | 'codex' | 'opencode' | 'openclaw'
  /** The protocol the client speaks to the gateway. */
  protocol: AgentProtocol
  /** Appended to the site address to form the base URL the client expects. */
  basePath: '' | '/v1'
  /** Models whose id starts with this are the ones the client is built for. */
  prefers: string
  /** The command that starts the client, when starting it is all that is left. */
  command?: string
}

export const AGENT_CLIENTS: AgentClient[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    ccSwitchApp: 'claude',
    protocol: 'anthropic-messages',
    // Claude Code appends /v1/messages itself.
    basePath: '',
    prefers: 'claude',
    command: 'claude',
  },
  {
    id: 'codex',
    name: 'Codex',
    ccSwitchApp: 'codex',
    // Codex speaks nothing but the Responses API.
    protocol: 'openai-responses',
    basePath: '/v1',
    prefers: 'gpt',
    command: 'codex',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    ccSwitchApp: 'opencode',
    protocol: 'openai-completions',
    basePath: '/v1',
    prefers: '',
    command: 'opencode',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    ccSwitchApp: 'openclaw',
    protocol: 'openai-completions',
    basePath: '/v1',
    prefers: '',
  },
]

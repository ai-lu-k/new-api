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

/** One local AI client the hub can rewrite. */
export type HubAgentClient = {
  id: string
  label?: string
  name?: string
  desc?: string
  protocol?: string
  config_paths?: string[]
  config_path?: string
  installed?: boolean
  detected?: boolean
  configured?: boolean
  status?: string
  applied?: {
    at?: number | string
    base_url?: string
    model?: string
    files?: string[]
    external_change?: boolean
  } | null
}

export type HubAgentKey = {
  id?: string | number
  name?: string
  realm?: string
  enabled?: boolean
}

/** A model in the gateway catalogue; the hub also accepts bare strings. */
export type HubAgentModel =
  | string
  | {
      id?: string
      model?: string
      context_window?: number
      contextWindow?: number
    }

/**
 * `/agents`. Off the gateway host the hub answers only
 * `{enabled: false, reason}` — that is a state to render, not an error.
 */
export type HubAgentsPayload = {
  enabled?: boolean
  reason?: string
  clients?: HubAgentClient[]
  agents?: HubAgentClient[]
  keys?: HubAgentKey[]
  api_keys?: HubAgentKey[]
  models?: HubAgentModel[]
  gateway?: { base_url?: string }
  model_embedding_clients?: string[]
}

export type HubAgentAvailability = { enabled?: boolean; reason?: string }

export type HubModelSelection = {
  configured?: boolean
  selected_models?: string[]
  models?: string[]
}

/** The body `/agents/apply` expects, field for field. */
export type HubAgentApplyBody = {
  client: string
  client_id: string
  base_url: string
  key_id: string
  model: string
  models: string[]
}

export type HubAgentActionResult = {
  ok?: boolean
  message?: string
  error?: { message?: string }
  label?: string
  restored?: string[]
  deleted?: string[]
  warnings?: string[]
}

/** A model id, whether the catalogue entry is a string or an object. */
export function modelId(model: HubAgentModel): string {
  if (typeof model === 'string') return model
  return String(model.id || model.model || '')
}

/** The catalogue's model ids, in the order the hub listed them. */
export function modelIds(models: HubAgentModel[]): string[] {
  return models.map(modelId).filter((id) => id !== '')
}

/** The clients list, whichever key this hub version uses. */
export function agentClients(payload: HubAgentsPayload): HubAgentClient[] {
  return payload.clients ?? payload.agents ?? []
}

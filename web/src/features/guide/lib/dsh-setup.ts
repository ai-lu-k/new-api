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
export type DshSetupCommands = {
  shell: string
  powershell: string
}

/**
 * The commands that run the gateway's DSH setup script with a one-time code.
 * The code is handed to the script, never put in the address it is fetched
 * from, so it does not end up in server or proxy logs.
 */
export function buildDshSetupCommands(
  serverAddress: string,
  code: string
): DshSetupCommands {
  const base = `${serverAddress.replace(/\/+$/, '')}/api/dsh_setup`
  return {
    shell: `curl -fsSL ${base}/setup.sh | sh -s -- ${code}`,
    powershell: `$env:LUK_SETUP_CODE='${code}'; irm ${base}/setup.ps1 | iex`,
  }
}

const DSH_MODEL_GUIDE =
  'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/user/guide/providers'

/**
 * DSH's own guide to model entries, in the reader's language where it has
 * one. The prompt sends DSH there for the exact fields rather than repeating
 * them, so the prompt does not go stale when DSH changes.
 */
export function dshModelGuideUrl(language: string): string {
  return `${DSH_MODEL_GUIDE}${language.toLowerCase().startsWith('zh') ? '.zh' : ''}.md`
}

/** The prose of the setup prompt, one paragraph per step. */
export type DshSetupPromptText = {
  intro: string
  /** Ask the user which model to use; the model list follows it. */
  ask: string
  /** Run the command; the commands follow it. */
  run: string
  /** Make the chosen model the default and match it to the official model. */
  align: string
  report: string
}

/**
 * The prompt a user sends to DSH. It has DSH ask which model to use, run the
 * setup command, and then look the model's official limits up itself, so the
 * site does not have to keep them for every model it serves. It carries the
 * one-time setup code, never the API key.
 */
export function buildDshSetupPrompt(
  text: DshSetupPromptText,
  models: readonly { id: string; name?: string }[],
  commands: DshSetupCommands
): string {
  return [
    text.intro,
    '',
    text.ask,
    ...models.map((model) =>
      model.name && model.name !== model.id
        ? `- ${model.id} — ${model.name}`
        : `- ${model.id}`
    ),
    '',
    text.run,
    '',
    'macOS / Linux:',
    commands.shell,
    '',
    'Windows (PowerShell):',
    commands.powershell,
    '',
    text.align,
    '',
    text.report,
  ].join('\n')
}

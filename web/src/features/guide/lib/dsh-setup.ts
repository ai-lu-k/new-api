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

/** The prose of the setup prompt. */
export type DshSetupPromptText = {
  intro: string
  /** Run the command; the commands follow it. */
  run: string
  /** Say what happened and that DSH has to be restarted. */
  report: string
}

/**
 * The prompt a user sends to DSH. DSH is only the hand that runs the setup
 * command: the script writes the provider, every model with its limits and
 * reasoning levels, the default model and the API key. It carries the one-time
 * setup code, never the API key.
 */
export function buildDshSetupPrompt(
  text: DshSetupPromptText,
  commands: DshSetupCommands
): string {
  return [
    text.intro,
    '',
    text.run,
    '',
    'macOS / Linux:',
    commands.shell,
    '',
    'Windows (PowerShell):',
    commands.powershell,
    '',
    text.report,
  ].join('\n')
}

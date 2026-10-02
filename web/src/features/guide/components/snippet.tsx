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
import { CopyButton } from '@/components/copy-button'

/**
 * A block of code or configuration with a button that copies it. What is
 * copied may differ from what is shown: a key is shown masked and copied whole.
 */
export function Snippet(props: { code: string; copy: string }) {
  return (
    <div className='flex items-start gap-2'>
      <pre className='bg-muted/60 border-border max-h-80 min-w-0 flex-1 overflow-auto rounded-md border p-3 text-xs leading-relaxed'>
        <code className='font-mono whitespace-pre'>{props.code}</code>
      </pre>
      <CopyButton value={props.copy} variant='outline' />
    </div>
  )
}

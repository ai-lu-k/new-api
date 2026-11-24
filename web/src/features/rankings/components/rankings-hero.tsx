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

/**
 * Hero strip for the public page. The page carries traffic, expenses and the
 * About text top to bottom, so the strip is only a title and its line — the
 * switches live in the block they belong to.
 */
export function RankingsHero() {
  const { t } = useTranslation()

  return (
    <section className='space-y-2'>
      <h1 className='text-2xl leading-[1.15] font-bold tracking-tight sm:text-[2rem]'>
        {t('Public data')}
      </h1>
      <p className='text-muted-foreground max-w-2xl text-sm leading-relaxed'>
        {t(
          'How much traffic this site carries, what it costs to run, and what it is.'
        )}
      </p>
    </section>
  )
}

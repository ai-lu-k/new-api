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

import { Separator } from '@/components/ui/separator'

import { getGatewayFeatures } from '../constants'

interface GatewayCardProps {
  logo: string
  systemName: string
}

/**
 * Central gateway card with features grid
 */
export function GatewayCard({ logo, systemName }: GatewayCardProps) {
  const { t } = useTranslation()
  const features = getGatewayFeatures(t)

  return (
    <div className='glass-3 group border-border/50 dark:border-border/20 relative overflow-hidden rounded-4xl border p-10 shadow-2xl transition-all duration-500 sm:p-12 dark:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.4)]'>
      {/* Top border accent */}
      <Separator className='bg-warning/40 absolute top-0 left-[10%] h-[2px] w-[80%]' />

      <div className='relative'>
        {/* Gateway Header */}
        <div className='mb-8 flex items-center justify-center gap-3'>
          <img
            src={logo}
            alt={systemName}
            className='h-12 w-12 rounded-lg object-cover'
          />
          <h3 className='text-foreground text-2xl font-medium'>{systemName}</h3>
        </div>

        {/* Features Grid */}
        <div className='grid grid-cols-2 gap-3'>
          {features.map((feature, i) => (
            <div
              key={i}
              className='glass-morphism group/item border-border/40 dark:border-border/20 hover:border-warning/40 relative overflow-hidden rounded-xl border px-4 py-3.5 text-center shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md'
            >
              <div className='group-hover/item:bg-warning/8 absolute inset-0 transition-colors duration-300' />
              <span className='text-foreground/90 group-hover/item:text-foreground relative text-sm font-medium'>
                {feature}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

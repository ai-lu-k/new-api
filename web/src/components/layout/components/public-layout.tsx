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
import { ShaderBackdrop } from '@/components/shader-backdrop'
import { useTheme } from '@/context/theme-provider'

import type { TopNavLink } from '../types'
import { Footer } from './footer'
import { PublicHeader, type PublicHeaderProps } from './public-header'

type PublicLayoutProps = {
  children: React.ReactNode
  showMainContainer?: boolean
  showFooter?: boolean
  /** Ambient shader glow behind the page. Default on for public surfaces. */
  showShader?: boolean
  /** 0..1, forwarded to the backdrop. Lower it on dense data pages. */
  shaderIntensity?: number
  navContent?: React.ReactNode
  headerProps?: Omit<PublicHeaderProps, 'navContent'>
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: React.ReactNode
  siteName?: string
}

export function PublicLayout(props: PublicLayoutProps) {
  const { resolvedTheme } = useTheme()
  /* The glow is an effect on a dark canvas. On a white one it would only
   * darken the page, so light mode skips it entirely — including the render
   * loop, which is the expensive part. */
  const showShader = props.showShader !== false && resolvedTheme === 'dark'

  return (
    /* The shell deliberately paints no background of its own: `body` carries
     * the canvas colour and the backdrop sits in the gap between it and the
     * content column, so the glow shows through translucent surfaces. */
    <div className='text-foreground relative flex min-h-svh flex-col overflow-x-clip'>
      {showShader && (
        <ShaderBackdrop
          className='z-0'
          intensity={props.shaderIntensity ?? 1}
        />
      )}

      <div className='relative z-10 flex min-h-svh flex-col'>
        <PublicHeader
          navContent={props.navContent}
          navLinks={props.navLinks}
          showThemeSwitch={props.showThemeSwitch}
          showAuthButtons={props.showAuthButtons}
          showNotifications={props.showNotifications}
          logo={props.logo}
          siteName={props.siteName}
          {...props.headerProps}
        />

        {props.showMainContainer !== false ? (
          <main className='container flex-1 px-4 py-6 pt-20 md:px-4'>
            {props.children}
          </main>
        ) : (
          props.children
        )}

        {props.showFooter !== false && <Footer className='mt-auto' />}
      </div>
    </div>
  )
}

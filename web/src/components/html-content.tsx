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
import DOMPurify, { type Config } from 'dompurify'
import { useEffect, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'

export type HtmlContentVariant = 'inline' | 'isolated'

interface HtmlContentProps {
  content: string
  className?: string
  variant?: HtmlContentVariant
}

const isolatedContentSandbox =
  'allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation'

const isolatedContentBaseStyles = `
<style>
  :host {
    display: block;
    width: 100%;
    color: inherit;
    font: inherit;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  img,
  video,
  iframe {
    max-width: 100%;
  }

  iframe {
    border: 0;
  }
</style>
`

const isolatedSanitizeOptions = {
  ADD_ATTR: [
    'allowfullscreen',
    'autoplay',
    'class',
    'controls',
    'default',
    'id',
    'kind',
    'label',
    'loading',
    'loop',
    'muted',
    'playsinline',
    'poster',
    'preload',
    'referrerpolicy',
    'rel',
    'srclang',
    'style',
    'target',
  ],
  ADD_TAGS: ['audio', 'iframe', 'picture', 'source', 'style', 'track', 'video'],
  FORBID_ATTR: ['srcdoc'],
  FORBID_TAGS: ['base', 'embed', 'link', 'meta', 'object', 'script'],
  FORCE_BODY: true,
} satisfies Config

function hardenIsolatedHtml(html: string): string {
  if (typeof document === 'undefined') {
    return html
  }

  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('a[target="_blank"]').forEach((link) => {
    const rel = new Set(
      link.getAttribute('rel')?.split(/\s+/).filter(Boolean) ?? []
    )

    rel.add('noopener')
    rel.add('noreferrer')
    link.setAttribute('rel', [...rel].join(' '))
  })

  template.content.querySelectorAll('iframe').forEach((frame) => {
    frame.removeAttribute('srcdoc')
    frame.setAttribute('sandbox', isolatedContentSandbox)
    frame.setAttribute('referrerpolicy', 'no-referrer')

    if (!frame.hasAttribute('loading')) {
      frame.setAttribute('loading', 'lazy')
    }
  })

  return template.innerHTML
}

function sanitizeIsolatedHtml(content: string): string {
  // DOMPurify >= 3.4 strips <style> even when it is explicitly allow-listed
  // (hardening for risky allow-listed tags). The isolated variant exists for
  // admin-authored pages whose stylesheet is part of the content, so carry
  // those <style> elements around the sanitizer and re-attach them verbatim.
  // Everything else (scripts, event handlers, ...) stays sanitized.
  const extraction = document.createElement('template')
  extraction.innerHTML = content
  const styles = extraction.content.querySelectorAll('style')
  const preserved = [...styles].map((style) => style.outerHTML)
  styles.forEach((style) => style.remove())

  const hardened = hardenIsolatedHtml(
    DOMPurify.sanitize(extraction.innerHTML, isolatedSanitizeOptions)
  )

  return preserved.length > 0 ? preserved.join('\n') + hardened : hardened
}

function sanitizeHtmlContent(
  content: string,
  variant: HtmlContentVariant
): string {
  if (variant === 'isolated') {
    return sanitizeIsolatedHtml(content)
  }

  return DOMPurify.sanitize(content)
}

function syncDocumentPreferences(wrapper: HTMLElement): void {
  const root = document.documentElement
  wrapper.classList.toggle('dark', root.classList.contains('dark'))
  // Mirror <html lang> onto the wrapper: shadow-root CSS cannot match the
  // document tree, and :host-context is not implemented in Chromium, so the
  // custom home page keys its language switching off this attribute instead.
  const lang = root.getAttribute('lang')
  if (lang) {
    wrapper.dataset.appLang = lang
  } else {
    delete wrapper.dataset.appLang
  }
}

function IsolatedHtmlContent(props: {
  className?: string
  html: string
}): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const shadowRoot =
      container.shadowRoot ?? container.attachShadow({ mode: 'open' })
    const applicationStyleNodes = [
      ...document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
        'style, link[rel="stylesheet"]'
      ),
    ].map((node) => node.cloneNode(true))

    const wrapper = document.createElement('div')
    syncDocumentPreferences(wrapper)
    wrapper.innerHTML = props.html

    const contentTemplate = document.createElement('template')
    contentTemplate.innerHTML = isolatedContentBaseStyles

    shadowRoot.replaceChildren(
      ...applicationStyleNodes,
      contentTemplate.content,
      wrapper
    )

    const observer = new MutationObserver(() =>
      syncDocumentPreferences(wrapper)
    )
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'lang'],
    })

    return () => observer.disconnect()
  }, [props.html])

  return (
    <div ref={containerRef} className={cn('block w-full', props.className)} />
  )
}

export function HtmlContent(props: HtmlContentProps) {
  const variant = props.variant ?? 'inline'
  const html = useMemo(
    () => sanitizeHtmlContent(props.content, variant),
    [props.content, variant]
  )

  if (variant === 'isolated') {
    return <IsolatedHtmlContent className={props.className} html={html} />
  }

  return (
    <div
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none',
        props.className
      )}
      // eslint-disable-next-line react/no-danger -- html is sanitized above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

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
import LanguageDetector from 'i18next-browser-languagedetector'

import { convertDetectedLanguage } from './languages'

/**
 * Where the interface language of a visitor comes from, first match wins: the
 * language they chose, the site's default, their browser.
 */
export const LANGUAGE_DETECTION = {
  order: ['localStorage', 'siteDefault', 'navigator'],
  caches: ['localStorage'],
  // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
  // codes (non-Chinese codes pass through for normal supportedLngs matching).
  convertDetectedLanguage,
}

/**
 * A site can set the language a visitor sees before choosing one; the server
 * writes it on the document element. Without it the browser decides, and a
 * search engine, which crawls with an English browser, indexes the English
 * interface of a site written in another language.
 */
export function createLanguageDetector(): LanguageDetector {
  const detector = new LanguageDetector(undefined, LANGUAGE_DETECTION)
  detector.addDetector({
    name: 'siteDefault',
    lookup: () => document.documentElement.dataset.defaultLang || undefined,
  })
  return detector
}

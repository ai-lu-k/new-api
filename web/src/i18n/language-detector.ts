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

import {
  DEFAULT_INTERFACE_LANGUAGE,
  convertDetectedLanguage,
} from './languages'

/**
 * Where the interface language of a visitor comes from, first match wins: the
 * language they chose, then the site's default. A site that sets neither shows
 * English (`fallbackLng`) rather than the browser's own language, so every
 * visitor starts on the same page and picks a language deliberately.
 */
export const LANGUAGE_DETECTION = {
  order: ['localStorage', 'siteDefault', 'interfaceDefault'],
  caches: ['localStorage'],
  // A stored value may still be a browser tag like `zh-CN`; map those onto our
  // `zhCN`/`zhTW` codes (other codes pass through for supportedLngs matching).
  convertDetectedLanguage,
}

/**
 * A site can set the language a visitor sees before choosing one; the server
 * writes it on the document element. Without it the interface stays English.
 */
export function createLanguageDetector(): LanguageDetector {
  const detector = new LanguageDetector(undefined, LANGUAGE_DETECTION)
  detector.addDetector({
    name: 'siteDefault',
    lookup: () => document.documentElement.dataset.defaultLang || undefined,
  })
  detector.addDetector({
    name: 'interfaceDefault',
    lookup: () => DEFAULT_INTERFACE_LANGUAGE,
  })
  return detector
}

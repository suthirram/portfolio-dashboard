// Loads the real app stylesheet and the app's web-font <link> (read from
// index.html, so the test follows any change to it) into
// fontFallback.fixture.html, then applies the brand font named by ?font=.
import '../../index.css'
import indexHtml from '../../../index.html?raw'
import { applyBrandFont } from '../../lib/useBranding'
import type { BrandingFont } from '../../lib/api/client'

const fontLink = new DOMParser().parseFromString(indexHtml, 'text/html')
  .querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')!
document.head.append(document.importNode(fontLink, true))

applyBrandFont(new URLSearchParams(location.search).get('font') as BrandingFont)

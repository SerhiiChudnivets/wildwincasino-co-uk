import React from 'react'

/**
 * Автоматична мікророзмітка (JSON-LD WebPage + Organization) та OpenGraph/Twitter теги.
 *
 * - JSON-LD генерується завжди, динамічно для кожної сторінки.
 * - OG/Twitter теги додаються тільки якщо такого тегу ще немає в html_head сторінки
 *   (те, що прописано вручну в html_head — головніше).
 */

type Media = string | { url?: string; width?: number; height?: number } | { url?: string; width?: number; height?: number }[] | null | undefined

export interface SeoMarkupInput {
  /** Повний data.json */
  data: any
  /** true — головна сторінка сайту */
  isHomepage: boolean
  /** slug внутрішньої сторінки */
  slug?: string
  /** SEO title сторінки */
  title: string
  /** SEO description сторінки */
  description: string
  /** Назва внутрішньої сторінки для breadcrumbs (Title в Pages) */
  pageName?: string
  /** lang сторінки */
  lang?: string
  /** Банер сторінки (для og:image) */
  image?: Media
  createdAt?: unknown
  updatedAt?: unknown
  /** Вміст html_head, який вже виводиться на сторінці */
  htmlHead?: string
}

const getMedia = (media: Media): { url: string; width?: number; height?: number } | null => {
  if (!media) return null
  if (typeof media === 'string') return media.trim() ? { url: media.trim() } : null
  if (Array.isArray(media)) return getMedia(media[0])
  if (typeof media === 'object' && media.url) return { url: media.url, width: media.width, height: media.height }
  return null
}

const toIsoDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const date = new Date(value)
  if (isNaN(date.getTime())) return undefined
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

const toOgLocale = (lang: string) => {
  const [language, region] = lang.split(/[-_]/)
  return region ? `${language.toLowerCase()}_${region.toUpperCase()}` : language.toLowerCase()
}

/** Набір property/name OG та Twitter тегів, які вже є в html_head */
const getExistingMetaKeys = (html: string): Set<string> => {
  const keys = new Set<string>()
  if (!html) return keys
  const metaRegex = /<meta\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = metaRegex.exec(html)) !== null) {
    const attr = match[0].match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)
    if (attr) keys.add(attr[1].trim().toLowerCase())
  }
  return keys
}

const jsonLd = (key: string, value: object) => (
  <script
    key={key}
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }}
  />
)

export function renderSeoMarkup(input: SeoMarkupInput): React.ReactElement[] {
  const { data = {}, isHomepage } = input

  const host = String(data.url || data.name || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
  if (!host) return []

  const siteUrl = `https://${data.use_www_version ? 'www.' : ''}${host}/`
  const slug = String(input.slug || '').replace(/^\/+|\/+$/g, '')
  const pageUrl = isHomepage || !slug ? siteUrl : `${siteUrl}${slug}/`
  const absoluteUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : `${siteUrl}${url.replace(/^\/+/, '')}`)

  const brand = data.home_name || data.name || host
  const alternateName = data.hero_title || data.heroTitle || brand
  const siteLang = data.language_code || input.lang || 'en'
  const pageLang = input.lang || siteLang

  const datePublished = toIsoDate(input.createdAt) || toIsoDate(data._generated_at)
  const dateModified = toIsoDate(input.updatedAt) || toIsoDate(data._last_deploy) || datePublished

  const logoMedia = getMedia(data.logo)
  const logoObject = logoMedia
    ? {
        '@type': 'ImageObject',
        '@id': `${siteUrl}#/schema/logo/image/`,
        inLanguage: siteLang,
        url: absoluteUrl(logoMedia.url),
        contentUrl: absoluteUrl(logoMedia.url),
        ...(logoMedia.width ? { width: logoMedia.width } : {}),
        ...(logoMedia.height ? { height: logoMedia.height } : {}),
        caption: brand,
      }
    : undefined

  const organization = {
    '@type': 'Organization',
    '@id': `${siteUrl}#organization`,
    name: brand,
    alternateName,
    url: siteUrl,
    ...(logoObject ? { logo: logoObject } : {}),
  }

  const breadcrumbItems: object[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: brand,
      // item — простий URL-рядок (рекомендація Google). Об'єкт з @id сторінки
      // зливався б з самим WebPage і давав йому зайвий тип Thing.
      ...(isHomepage ? {} : { item: siteUrl }),
    },
  ]
  if (!isHomepage) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 2,
      name: input.pageName || input.title || slug,
      item: pageUrl,
    })
  }

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': pageUrl,
    url: pageUrl,
    name: input.title,
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(input.description ? { description: input.description } : {}),
    inLanguage: pageLang,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${siteUrl}#website`,
      url: siteUrl,
      name: brand,
      description: host,
      inLanguage: siteLang,
      publisher: organization,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}?s={search_term_string}`,
        },
        'query-input': {
          '@type': 'PropertyValueSpecification',
          valueRequired: 'http://schema.org/True',
          valueName: 'search_term_string',
        },
      },
    },
    ...(isHomepage ? { about: organization } : {}),
    ...(logoObject ? { image: logoObject } : {}),
    breadcrumb: {
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: breadcrumbItems,
    },
  }

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}#organization`,
    name: brand,
    alternateName,
    url: siteUrl,
    ...(logoMedia ? { logo: absoluteUrl(logoMedia.url) } : {}),
  }

  const ogImage = getMedia(input.image) || getMedia(data.main_background_img)
  const existing = getExistingMetaKeys(input.htmlHead || '')
  const metaTags: { attr: 'property' | 'name'; key: string; content?: string }[] = [
    { attr: 'property', key: 'og:locale', content: toOgLocale(pageLang) },
    { attr: 'property', key: 'og:type', content: 'website' },
    { attr: 'property', key: 'og:title', content: input.title },
    { attr: 'property', key: 'og:description', content: input.description },
    { attr: 'property', key: 'og:url', content: pageUrl },
    { attr: 'property', key: 'og:site_name', content: brand },
    { attr: 'property', key: 'og:image', content: ogImage ? absoluteUrl(ogImage.url) : undefined },
    { attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
    { attr: 'name', key: 'twitter:title', content: input.title },
    { attr: 'name', key: 'twitter:description', content: input.description },
  ]

  const autoMeta = metaTags
    .filter((tag) => tag.content && !existing.has(tag.key))
    .map((tag) =>
      tag.attr === 'property'
        ? <meta key={`auto-${tag.key}`} property={tag.key} content={tag.content} />
        : <meta key={`auto-${tag.key}`} name={tag.key} content={tag.content} />
    )

  return [
    ...autoMeta,
    jsonLd('schema-webpage', webPage),
    jsonLd('schema-organization', organizationSchema),
  ]
}

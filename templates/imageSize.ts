import fs from 'fs'
import path from 'path'

export interface ImageSize {
  width: number
  height: number
}

function mediaUrl(media: unknown): string | null {
  if (!media) return null
  if (typeof media === 'string') return media.trim() || null
  if (Array.isArray(media)) return mediaUrl(media[0])
  if (typeof media === 'object' && media && 'url' in media) {
    const url = (media as { url?: unknown }).url
    if (typeof url === 'string' && url.trim()) return url.trim()
  }
  return null
}

function embeddedSize(media: unknown): ImageSize | null {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return null
  const width = Number((media as { width?: unknown }).width)
  const height = Number((media as { height?: unknown }).height)
  if (width > 0 && height > 0) return { width, height }
  return null
}

function localFile(url: string): string | null {
  const clean = url.split('?')[0].split('#')[0]
  if (/^https?:\/\//i.test(clean)) {
    try {
      const pathname = new URL(clean).pathname
      return localFile(pathname)
    } catch {
      return null
    }
  }
  const relative = clean.replace(/^\//, '')
  const candidates = [
    path.join(process.cwd(), 'public', relative),
    path.join(process.cwd(), relative),
  ]
  return candidates.find((file) => fs.existsSync(file)) || null
}

function pngSize(buf: Buffer): ImageSize | null {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

function gifSize(buf: Buffer): ImageSize | null {
  if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'GIF') return null
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
}

function jpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buf[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    const length = buf.readUInt16BE(offset + 2)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function webpSize(buf: Buffer): ImageSize | null {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }
  const format = buf.toString('ascii', 12, 16)
  if (format === 'VP8X') {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    }
  }
  if (format === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    }
  }
  if (format === 'VP8L' && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }
  return null
}

function svgSize(buf: Buffer): ImageSize | null {
  const text = buf.toString('utf8')
  const viewBox = text.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i)
  if (viewBox) {
    const width = Math.round(Number(viewBox[1]))
    const height = Math.round(Number(viewBox[2]))
    if (width > 0 && height > 0) return { width, height }
  }
  const widthMatch = text.match(/\bwidth=["']([\d.]+)(?:px)?["']/i)
  const heightMatch = text.match(/\bheight=["']([\d.]+)(?:px)?["']/i)
  const width = widthMatch ? Math.round(Number(widthMatch[1])) : 0
  const height = heightMatch ? Math.round(Number(heightMatch[1])) : 0
  if (width > 0 && height > 0) return { width, height }
  return null
}

function readSize(file: string): ImageSize | null {
  const buf = fs.readFileSync(file)
  const ext = path.extname(file).toLowerCase()
  if (ext === '.png') return pngSize(buf)
  if (ext === '.gif') return gifSize(buf)
  if (ext === '.jpg' || ext === '.jpeg') return jpegSize(buf)
  if (ext === '.webp') return webpSize(buf)
  if (ext === '.svg') return svgSize(buf)
  return pngSize(buf) || gifSize(buf) || jpegSize(buf) || webpSize(buf) || svgSize(buf)
}

export async function getImageSize(media: unknown, _data?: unknown): Promise<ImageSize | null> {
  const fromFields = embeddedSize(media)
  if (fromFields) return fromFields

  const url = mediaUrl(media)
  if (!url) return null
  const file = localFile(url)
  if (!file) return null
  try {
    return readSize(file)
  } catch {
    return null
  }
}

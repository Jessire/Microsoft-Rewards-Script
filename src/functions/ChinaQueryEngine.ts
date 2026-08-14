export const CHINA_HOT_SOURCES = ['BaiduHot', 'TouTiaoHot', 'DouYinHot', 'WeiBoHot', 'ZhiHuHot'] as const

export type ChinaHotSource = (typeof CHINA_HOT_SOURCES)[number]

export class ChinaApiRateLimitError extends Error {
    constructor(
        message: string,
        public readonly status?: number
    ) {
        super(message)
        this.name = 'ChinaApiRateLimitError'
    }
}

export function buildChinaApiUrl(source: string, appkey?: string): string {
    const url = new URL(`https://api.gmya.net/Api/${encodeURIComponent(source)}`)
    if (appkey?.trim()) {
        url.searchParams.set('format', 'json')
        url.searchParams.set('appkey', appkey.trim())
    }
    return url.toString()
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function bodyText(body: unknown): string {
    if (typeof body === 'string') return body
    try {
        return JSON.stringify(body ?? '')
    } catch {
        return String(body ?? '')
    }
}

export function summarizeChinaBody(body: unknown): string {
    const text = bodyText(body).replace(/\s+/g, ' ').trim()
    return text.length > 240 ? `${text.slice(0, 237)}...` : text
}

export function isChinaRateLimited(status?: number, body?: unknown): boolean {
    if (status === 403 || status === 429) return true
    const record = asRecord(body)
    const code = record?.code
    if (code === 403 || code === 429 || code === '403' || code === '429') return true
    const text = bodyText(body).toLowerCase()
    return ['请求过于频繁', '请求频繁', 'rate limit', 'rate-limit', 'appkey'].some(token => text.includes(token))
}

export function parseChinaHotWords(body: unknown): string[] {
    let value = body
    if (typeof body === 'string') {
        try {
            value = JSON.parse(body)
        } catch {
            return []
        }
    }

    const record = asRecord(value)
    const data = record?.data
    if (!Array.isArray(data)) return []

    return data
        .map(item => {
            if (typeof item === 'string' || typeof item === 'number') return String(item)
            const itemRecord = asRecord(item)
            const title = itemRecord?.title ?? itemRecord?.word ?? itemRecord?.name
            return typeof title === 'string' || typeof title === 'number' ? String(title) : ''
        })
        .map(title => title.trim())
        .filter(Boolean)
}

export function randomChinaDelay(): number {
    return 1200 + Math.floor(Math.random() * 1301)
}

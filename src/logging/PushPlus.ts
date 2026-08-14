import PQueue from 'p-queue'

import type { WebhookPushPlusConfig } from '../interface/Config'
import { httpRequest } from '../util/Http'
import type { HttpRequestConfig } from '../util/Http'
import { flushQueue } from './Queue'

const pushPlusQueue = new PQueue({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
})

export async function sendPushPlus(config: WebhookPushPlusConfig, content: string): Promise<void> {
    if (!config?.token) return

    const request: HttpRequestConfig = {
        method: 'POST',
        url: 'https://www.pushplus.plus/send',
        headers: { 'Content-Type': 'application/json' },
        data: {
            token: config.token,
            title: config.title,
            content,
            template: config.template ?? 'txt',
            channel: config.channel
        },
        timeout: 10000
    }

    await pushPlusQueue.add(async () => {
        try {
            await httpRequest(request)
        } catch (error) {
            const status =
                (error as { status?: number; response?: { status?: number } }).status ??
                (error as { response?: { status?: number } }).response?.status
            if (status !== 429 && status !== 401 && status !== 403) {
                // Notification failures must not interrupt the Rewards run.
                return
            }
        }
    })
}

export function flushPushPlusQueue(timeoutMs = 5000): Promise<void> {
    return flushQueue(pushPlusQueue, timeoutMs)
}

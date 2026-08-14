import type { WebhookTelegramConfig } from '../interface/Config'

export function shouldSendTelegram(
    config: WebhookTelegramConfig | undefined,
    title: string,
    webhookAllowed: boolean
): boolean {
    if (!config?.enabled || !config.botToken || !config.chatId) return false
    return (config.summaryOnly ?? true) ? title === 'DAILY-SUMMARY' : webhookAllowed
}

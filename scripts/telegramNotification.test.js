import assert from 'node:assert/strict'
import test from 'node:test'

import { formatTelegramContent } from '../dist/logging/Telegram.js'
import { shouldSendTelegram } from '../dist/logging/NotificationPolicy.js'

const configured = { enabled: true, botToken: 'bot-token', chatId: 'chat-id' }

test('Telegram defaults to one final daily summary instead of every log', () => {
    assert.equal(shouldSendTelegram(configured, 'FLOW', true), false)
    assert.equal(shouldSendTelegram(configured, 'DAILY-SUMMARY', false), true)
})

test('Telegram can opt out of summary-only mode and use the shared filter', () => {
    const verbose = { ...configured, summaryOnly: false }
    assert.equal(shouldSendTelegram(verbose, 'FLOW', true), true)
    assert.equal(shouldSendTelegram(verbose, 'FLOW', false), false)
})

test('Telegram stays disabled until credentials are complete', () => {
    assert.equal(shouldSendTelegram({ ...configured, botToken: '' }, 'DAILY-SUMMARY', true), false)
    assert.equal(shouldSendTelegram(undefined, 'DAILY-SUMMARY', true), false)
})

test('Telegram keeps the summary as normal multiline text', () => {
    const content = '📊 Microsoft Rewards 今日任务汇总\n\n✅ 每日签到：已完成（+5 分）'
    const rendered = formatTelegramContent(content, 'info')
    assert.equal(rendered, content)
    assert.doesNotMatch(rendered, /```/)
})

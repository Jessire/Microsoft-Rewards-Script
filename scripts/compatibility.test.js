import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'

import { redactSecrets } from './api/lib.js'

const require = createRequire(import.meta.url)
const {
    buildChinaApiUrl,
    isChinaRateLimited,
    parseChinaHotWords,
    randomChinaDelay
} = require('../dist/functions/ChinaQueryEngine.js')
const {
    migrateLegacyAccounts,
    migrateLegacyConfig,
    normalizeLegacyAccounts
} = require('../dist/util/LegacyConfigMigration.js')
const { formatOverrideValueForLog } = require('../dist/util/ConfigEnvOverrides.js')
const { validateConfig } = require('../dist/util/Validator.js')

function makeTempProject() {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-compat-'))
    fs.mkdirSync(path.join(projectRoot, 'src'))
    return projectRoot
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

test('China query helpers build URLs, parse hot words, and detect rate limits', () => {
    const url = new URL(buildChinaApiUrl('BaiduHot', ' demo key '))
    assert.equal(url.origin, 'https://api.gmya.net')
    assert.equal(url.pathname, '/Api/BaiduHot')
    assert.equal(url.searchParams.get('format'), 'json')
    assert.equal(url.searchParams.get('appkey'), 'demo key')

    assert.deepEqual(
        parseChinaHotWords({
            data: [{ title: '百度热词' }, { word: '头条热词' }, { name: 123 }, '直接热词', { ignored: true }]
        }),
        ['百度热词', '头条热词', '123', '直接热词']
    )
    assert.equal(isChinaRateLimited(429, {}), true)
    assert.equal(isChinaRateLimited(200, { code: '403' }), true)
    assert.equal(isChinaRateLimited(200, { message: '请求过于频繁' }), true)
    assert.equal(isChinaRateLimited(200, { code: 0, data: [] }), false)

    const delay = randomChinaDelay()
    assert.ok(delay >= 1200 && delay <= 2500)
})

test('PushPlus and China settings pass the v4 config schema', () => {
    const config = readJson(path.resolve('config.example.json'))
    config.searchSettings.queryEngines = ['china', 'local']
    config.searchSettings.chinaApi.appkey = 'test-appkey'
    config.webhook.pushplus = {
        enabled: true,
        token: 'test-token',
        title: 'Microsoft-Rewards-Script',
        template: 'markdown',
        channel: 'wechat'
    }

    const validated = validateConfig(config)
    assert.deepEqual(validated.searchSettings.queryEngines, ['china', 'local'])
    assert.equal(validated.searchSettings.chinaApi.appkey, 'test-appkey')
    assert.equal(validated.webhook.pushplus.token, 'test-token')
})

test('legacy account proxyAxios is mapped to proxyHttp', () => {
    const [account] = normalizeLegacyAccounts({
        email: 'compat@example.test',
        password: 'not-a-real-password',
        proxy: { proxyAxios: true, url: '127.0.0.1', port: 7890 }
    })

    assert.equal(account.proxy.proxyHttp, true)
    assert.equal('proxyAxios' in account.proxy, false)
})

test('legacy config migration merges defaults, backs up source, and preserves the legacy file', () => {
    const projectRoot = makeTempProject()
    try {
        fs.writeFileSync(
            path.join(projectRoot, 'config.example.json'),
            JSON.stringify({
                workers: { doDailySet: true, doMobileSearch: true },
                searchSettings: { queryEngines: ['local'] }
            })
        )
        fs.writeFileSync(
            path.join(projectRoot, 'src', 'config.json'),
            JSON.stringify({
                baseURL: 'https://legacy.invalid',
                workers: { doDailySet: false, doSpecialPromotions: true },
                searchSettings: { chinaApi: { appkey: 'test-appkey' } }
            })
        )

        const migratedPath = migrateLegacyConfig(projectRoot)
        assert.equal(migratedPath, path.join(projectRoot, 'config.json'))
        const migrated = readJson(migratedPath)
        assert.equal(migrated.workers.doDailySet, false)
        assert.equal(migrated.workers.doMobileSearch, true)
        assert.equal(migrated.searchSettings.chinaApi.appkey, 'test-appkey')
        assert.equal('baseURL' in migrated, false)
        assert.equal('doSpecialPromotions' in migrated.workers, false)
        assert.equal(fs.existsSync(path.join(projectRoot, 'src', 'config.json')), true)
        assert.equal(
            fs.readdirSync(path.join(projectRoot, 'src')).some(name => name.startsWith('config.json.bak-')),
            true
        )
    } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true })
    }
})

test('legacy migration never overwrites an existing root config', () => {
    const projectRoot = makeTempProject()
    try {
        const rootConfigPath = path.join(projectRoot, 'config.json')
        fs.writeFileSync(rootConfigPath, JSON.stringify({ marker: 'keep-root' }))
        fs.writeFileSync(path.join(projectRoot, 'src', 'config.json'), JSON.stringify({ marker: 'legacy' }))

        assert.equal(migrateLegacyConfig(projectRoot), undefined)
        assert.deepEqual(readJson(rootConfigPath), { marker: 'keep-root' })
    } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true })
    }
})

test('legacy JSON accounts migrate only when environment accounts are absent', () => {
    const projectRoot = makeTempProject()
    try {
        const legacyPath = path.join(projectRoot, 'src', 'accounts.json')
        fs.writeFileSync(
            legacyPath,
            JSON.stringify({
                email: 'compat@example.test',
                password: 'not-a-real-password',
                proxy: { proxyAxios: true }
            })
        )

        assert.equal(migrateLegacyAccounts(projectRoot, { ACCOUNT_1_EMAIL: 'env@example.test' }), undefined)
        assert.equal(fs.existsSync(path.join(projectRoot, 'accounts.json')), false)

        const migratedPath = migrateLegacyAccounts(projectRoot, {})
        assert.equal(migratedPath, path.join(projectRoot, 'accounts.json'))
        assert.equal(readJson(migratedPath)[0].proxy.proxyHttp, true)
        assert.equal(fs.existsSync(legacyPath), true)
    } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true })
    }
})

test('Control API and environment logging redact compatibility secrets', () => {
    const redacted = redactSecrets({
        searchSettings: { chinaApi: { appkey: 'secret-appkey' } },
        webhook: { pushplus: { token: 'secret-token' } }
    })

    assert.equal(redacted.searchSettings.chinaApi.appkey, '***REDACTED***')
    assert.equal(redacted.webhook.pushplus.token, '***REDACTED***')
    assert.equal(formatOverrideValueForLog('CONFIG_SEARCH_CHINA_APPKEY', 'secret-appkey'), '***REDACTED***')
    assert.equal(formatOverrideValueForLog('CONFIG_PUSHPLUS_TOKEN', 'secret-token'), '***REDACTED***')
    assert.equal(formatOverrideValueForLog('CONFIG_CLUSTERS', 2), '2')
})

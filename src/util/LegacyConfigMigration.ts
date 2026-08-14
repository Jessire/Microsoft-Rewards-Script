import fs from 'fs'
import path from 'path'

export interface LegacyAccountRecord {
    email: string
    password: string
    totpSecret?: string
    recoveryEmail?: string
    geoLocale?: string
    langCode?: string
    proxy?: {
        proxyHttp?: boolean
        proxyAxios?: boolean
        url?: string
        port?: number
        username?: string
        password?: string
    }
    saveFingerprint?: {
        mobile?: boolean
        desktop?: boolean
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function mergeObjects(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = clone(base)
    for (const [key, value] of Object.entries(overlay)) {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = mergeObjects(result[key] as Record<string, unknown>, value)
        } else {
            result[key] = clone(value)
        }
    }
    return result
}

function timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-')
}

function backupFile(filePath: string): string {
    const backupPath = `${filePath}.bak-${timestamp()}`
    fs.copyFileSync(filePath, backupPath)
    return backupPath
}

function writeJsonAtomic(filePath: string, value: unknown): void {
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 4)}\n`, 'utf-8')
    try {
        fs.renameSync(tempPath, filePath)
    } catch (error) {
        try {
            fs.rmSync(tempPath, { force: true })
        } catch {}
        throw error
    }
}

function readJson(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function sanitizeLegacyConfig(value: unknown): Record<string, unknown> {
    if (!isPlainObject(value)) throw new Error('Legacy config must be a JSON object')
    const config = clone(value)
    delete config.baseURL

    if (isPlainObject(config.workers)) {
        delete config.workers.doSpecialPromotions
    }

    return config
}

function normalizeLegacyAccount(value: LegacyAccountRecord): Record<string, unknown> {
    const proxy = value.proxy ?? {}
    return {
        email: value.email,
        password: value.password,
        ...(value.totpSecret !== undefined ? { totpSecret: value.totpSecret } : {}),
        recoveryEmail: value.recoveryEmail ?? '',
        geoLocale: value.geoLocale ?? 'auto',
        langCode: value.langCode ?? 'en',
        proxy: {
            proxyHttp: proxy.proxyHttp ?? proxy.proxyAxios ?? false,
            url: proxy.url ?? '',
            port: proxy.port ?? 0,
            username: proxy.username ?? '',
            password: proxy.password ?? ''
        },
        saveFingerprint: {
            mobile: value.saveFingerprint?.mobile ?? false,
            desktop: value.saveFingerprint?.desktop ?? false
        }
    }
}

export function normalizeLegacyAccounts(value: unknown): Record<string, unknown>[] {
    const records = Array.isArray(value) ? value : [value]
    return records.map(record => {
        if (!isPlainObject(record)) throw new Error('Legacy accounts must contain JSON objects')
        if (typeof record.email !== 'string' || typeof record.password !== 'string') {
            throw new Error('Legacy account email and password must be strings')
        }
        return normalizeLegacyAccount(record as unknown as LegacyAccountRecord)
    })
}

/**
 * Copies src/config.json to the project root only when the new root config is
 * absent. The source is backed up and retained so a migration is reversible.
 */
export function migrateLegacyConfig(projectRoot: string): string | undefined {
    const rootConfigPath = path.join(projectRoot, 'config.json')
    const legacyConfigPath = path.join(projectRoot, 'src', 'config.json')
    if (fs.existsSync(rootConfigPath) || !fs.existsSync(legacyConfigPath)) return undefined

    const examplePath = [
        path.join(projectRoot, 'config.example.json'),
        path.join(projectRoot, 'src', 'config.example.json')
    ].find(candidate => fs.existsSync(candidate))
    const defaults = examplePath ? readJson(examplePath) : {}
    const legacyConfig = sanitizeLegacyConfig(readJson(legacyConfigPath))
    const migrated = isPlainObject(defaults) ? mergeObjects(defaults, legacyConfig) : legacyConfig

    const backupPath = backupFile(legacyConfigPath)
    writeJsonAtomic(rootConfigPath, migrated)
    console.warn(`[Config] Migrated legacy config from src/config.json (backup: ${path.basename(backupPath)})`)
    return rootConfigPath
}

/**
 * Copies src/accounts.json to the project root when no ACCOUNT_N environment
 * account is configured and no root accounts.json exists. Credentials are
 * never included in the migration log.
 */
export function migrateLegacyAccounts(projectRoot: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
    const hasEnvironmentAccounts = Object.keys(env).some(
        key => /^ACCOUNT_[1-9]\d*_EMAIL$/.test(key) && env[key]?.trim()
    )
    const rootAccountsPath = path.join(projectRoot, 'accounts.json')
    const legacyAccountsPath = path.join(projectRoot, 'src', 'accounts.json')
    if (hasEnvironmentAccounts || fs.existsSync(rootAccountsPath) || !fs.existsSync(legacyAccountsPath))
        return undefined

    const migrated = normalizeLegacyAccounts(readJson(legacyAccountsPath))
    const backupPath = backupFile(legacyAccountsPath)
    writeJsonAtomic(rootAccountsPath, migrated)
    console.warn(`[Accounts] Migrated legacy src/accounts.json (backup: ${path.basename(backupPath)})`)
    return rootAccountsPath
}

export function loadJsonAccounts(filePath: string): Record<string, unknown>[] {
    return normalizeLegacyAccounts(readJson(filePath))
}

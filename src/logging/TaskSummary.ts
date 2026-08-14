import type { RewardsSnapshot } from '../browser/RewardsSnapshot'

export interface TaskSummaryItem {
    key: string
    name: string
    points: number | null
    status: TaskSummaryStatus
    detail?: string
}

export type TaskSummaryStatus = 'completed' | 'no-points' | 'in-progress' | 'skipped' | 'started'

interface TaskDefinition {
    key: string
    name: string
}

const TASK_DEFINITIONS: Record<string, TaskDefinition> = {
    'DAILY-SET': { key: 'dailySet', name: '每日任务' },
    'MORE-PROMOTIONS': { key: 'morePromotions', name: '更多活动' },
    'URL-REWARD': { key: 'morePromotions', name: '更多活动' },
    'DAILY-CHECK-IN': { key: 'dailyCheckIn', name: '每日签到' },
    'APP-PROMOTIONS': { key: 'appPromotions', name: '应用活动' },
    'APP-REWARD': { key: 'appPromotions', name: '应用活动' },
    'READ-TO-EARN': { key: 'readToEarn', name: '阅读赚积分' },
    PUNCHCARD: { key: 'punchCards', name: '打卡任务' },
    'CLAIM-REWARD': { key: 'punchCards', name: '打卡任务' },
    'CLAIM-BONUS-POINTS': { key: 'bonusRewards', name: '领取奖励' },
    'VISUAL-SEARCH': { key: 'visualSearch', name: '视觉搜索' },
    'VISUAL-SEARCH-REPORT': { key: 'visualSearch', name: '视觉搜索' },
    'EDGE-BROWSING': { key: 'edgeBrowsing', name: 'Edge 浏览' },
    'SEARCH-ON-BING-SEARCH': { key: 'searchOnBing', name: 'Bing 活动' },
    'SEARCH-ON-BING-ACTIVATE': { key: 'searchOnBing', name: 'Bing 活动' }
}

function parseNumber(message: string, field: string): number | null {
    const match = message.match(new RegExp(`(?:^| \\| )${field}=(-?\\d+(?:\\.\\d+)?)`))
    if (!match) return null
    const value = Number(match[1])
    return Number.isFinite(value) ? value : null
}

function inferStatus(message: string): TaskSummaryStatus {
    const normalized = message.toLowerCase()
    if (normalized.includes('no points gained')) return 'no-points'
    if (normalized.includes('already been completed') || normalized.includes('already completed')) return 'completed'
    if (normalized.includes('in progress')) return 'in-progress'
    if (/(?:completed|finished|reported|acknowledged|done|successfully)/i.test(message)) return 'completed'
    if (/(?:skip|skipping|disabled|unavailable)/i.test(message)) return 'skipped'
    return 'started'
}

function completedUrlReward(message: string): boolean {
    return message.startsWith('Completed UrlReward')
}

function completedAppReward(message: string): boolean {
    return message.startsWith('Completed AppReward')
}

function reportedPunchcardChild(message: string): boolean {
    return message.startsWith('Reported child') && message.includes('pointsGained=')
}

export class TaskSummaryTracker {
    private readonly items = new Map<string, TaskSummaryItem>()

    reset(): void {
        this.items.clear()
    }

    record(title: string, message: string): void {
        if (title === 'SEARCH-MANAGER' && message.startsWith('Search summary |')) {
            const item = this.ensure({ key: 'search', name: '搜索' })
            const mobile = parseNumber(message, 'mobile') ?? 0
            const desktop = parseNumber(message, 'desktop') ?? 0
            const bonus = parseNumber(message, 'bonus') ?? 0
            const total = parseNumber(message, 'total') ?? mobile + desktop + bonus
            item.points = total
            item.status = 'completed'
            item.detail = `移动 ${mobile}，桌面 ${desktop}，额外 ${bonus}`
            return
        }

        const definition = TASK_DEFINITIONS[title]
        if (!definition) return

        const item = this.ensure(definition)
        const points = parseNumber(message, 'pointsGained')
        const isAccumulatedChild =
            (title === 'URL-REWARD' && completedUrlReward(message)) ||
            (title === 'APP-REWARD' && completedAppReward(message)) ||
            (title === 'PUNCHCARD' && reportedPunchcardChild(message))

        if (isAccumulatedChild && points !== null) {
            item.points = (item.points ?? 0) + points
        } else if (points !== null) {
            item.points = points
        }

        item.status = inferStatus(message)

        const articlesRead = parseNumber(message, 'articlesRead')
        if (title === 'READ-TO-EARN' && articlesRead !== null) {
            item.detail = `阅读 ${articlesRead} 篇`
        }
    }

    snapshot(): TaskSummaryItem[] {
        return [...this.items.values()].map(item => ({ ...item }))
    }

    private ensure(definition: TaskDefinition): TaskSummaryItem {
        const existing = this.items.get(definition.key)
        if (existing) return existing

        const item: TaskSummaryItem = {
            key: definition.key,
            name: definition.name,
            points: null,
            status: 'started'
        }
        this.items.set(definition.key, item)
        return item
    }
}

function statusIcon(status: TaskSummaryStatus): string {
    switch (status) {
        case 'completed':
            return '🟢'
        case 'no-points':
            return '🟡'
        case 'in-progress':
            return '🔵'
        case 'skipped':
            return '🟣'
        default:
            return '🟤'
    }
}

function statusText(status: TaskSummaryStatus): string {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'no-points':
            return '已执行'
        case 'in-progress':
            return '进行中'
        case 'skipped':
            return '已跳过'
        default:
            return '已开始'
    }
}

function formatTaskLine(item: TaskSummaryItem): string {
    const points = item.points === null ? '' : `（+${item.points} 分）`
    const detail = item.detail ? `，${item.detail}` : ''
    return `${statusIcon(item.status)} ${item.name}：${statusText(item.status)}${points}${detail}`
}

export function formatTaskSummary(items: TaskSummaryItem[]): string {
    if (!items.length) return `🟤 未识别到任务`

    return items.map(formatTaskLine).join('\n')
}

export interface RunSummaryAccount {
    email: string
    nickname?: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    success: boolean
    tasks?: TaskSummaryItem[]
    rewardsSnapshot?: RewardsSnapshot
    error?: string
}

function formatPoints(value: number | null): string {
    return value === null ? '未获取' : `${value.toLocaleString('zh-CN')} 分`
}

function effectiveBalance(account: RunSummaryAccount): number {
    return account.rewardsSnapshot?.availablePoints ?? account.finalPoints
}

function displayNickname(account: RunSummaryAccount): string {
    const nickname = account.nickname?.trim()
    if (nickname) return nickname

    return '未知昵称'
}

function formatRewardsSnapshot(snapshot: RewardsSnapshot): string[] {
    const lines: string[] = []

    if (snapshot.availablePoints !== null) lines.push(`🔵 可用积分：${formatPoints(snapshot.availablePoints)}`)
    if (snapshot.claimablePoints !== null && snapshot.claimablePoints > 0) {
        lines.push(`🟡 可领取：${formatPoints(snapshot.claimablePoints)}`)
    }
    if (snapshot.todayPoints !== null) lines.push(`🟣 今日积分：${formatPoints(snapshot.todayPoints)}`)
    if (snapshot.streakDays !== null) lines.push(`🟠 连续打卡：${snapshot.streakDays} 天`)

    return lines
}

export function formatRunSummary(accounts: RunSummaryAccount[]): string {
    const totalCollected = accounts.reduce((sum, account) => sum + account.collectedPoints, 0)
    const totalBalance = accounts.reduce((sum, account) => sum + effectiveBalance(account), 0)
    const snapshots = accounts.map(account => account.rewardsSnapshot).filter(Boolean) as RewardsSnapshot[]
    const allSnapshotsAvailable = snapshots.length > 0 && snapshots.length === accounts.length
    const totalToday =
        allSnapshotsAvailable && snapshots.every(snapshot => snapshot.todayPoints !== null)
            ? snapshots.reduce((sum, snapshot) => sum + (snapshot.todayPoints ?? 0), 0)
            : null
    const lines = ['📊 Microsoft Rewards 今日汇总', '']

    if (!accounts.length) {
        lines.push(`🟤 没有处理账号`)
    }

    accounts.forEach((account, index) => {
        if (index > 0) lines.push('', '────────────', '')

        lines.push(`🔵 昵称：${displayNickname(account)}`)
        if (account.success) {
            lines.push(...formatTaskSummary(account.tasks ?? []).split('\n'))
            if (account.rewardsSnapshot) {
                lines.push(...formatRewardsSnapshot(account.rewardsSnapshot))
                if (account.rewardsSnapshot.availablePoints === null) {
                    lines.push(`🔵 可用积分：${formatPoints(account.finalPoints)}`)
                }
            } else {
                lines.push(`🔵 可用积分：${formatPoints(account.finalPoints)}`)
            }
        } else {
            lines.push(`🔴 运行失败：${account.error ?? '未知错误'}`)
        }
        lines.push(`🟢 本次增加：${account.collectedPoints} 分`)
    })

    if (accounts.length > 1) {
        lines.push('', `🟣 合计：`, `🟢 本次增加：${totalCollected} 分`, `🔵 可用积分：${formatPoints(totalBalance)}`)
        if (totalToday !== null) lines.push(`🟣 今日积分：${formatPoints(totalToday)}`)
    }

    return lines.join('\n')
}

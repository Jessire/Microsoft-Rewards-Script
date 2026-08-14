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

function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!local || !domain) return email
    return `${local.slice(0, 1)}***@${domain}`
}

function statusText(status: TaskSummaryStatus): string {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'no-points':
            return '已执行，无新增积分'
        case 'in-progress':
            return '进行中'
        case 'skipped':
            return '已跳过'
        default:
            return '已开始'
    }
}

export function formatTaskSummary(items: TaskSummaryItem[]): string {
    if (!items.length) return '未识别到任务'

    return items
        .map(item => {
            const points = item.points === null ? '' : ` +${item.points}分`
            const detail = item.detail ? `，${item.detail}` : ''
            return `${item.name}${points}（${statusText(item.status)}${detail}）`
        })
        .join('；')
}

export interface RunSummaryAccount {
    email: string
    initialPoints: number
    finalPoints: number
    collectedPoints: number
    success: boolean
    tasks?: TaskSummaryItem[]
    error?: string
}

export function formatRunSummary(accounts: RunSummaryAccount[]): string {
    const totalCollected = accounts.reduce((sum, account) => sum + account.collectedPoints, 0)
    const totalBalance = accounts.reduce((sum, account) => sum + account.finalPoints, 0)
    const accountDetails = accounts
        .map(account => {
            const taskText = formatTaskSummary(account.tasks ?? [])
            const state = account.success ? taskText : `运行失败：${account.error ?? '未知错误'}`
            return `${maskEmail(account.email)}：${state}；增加 ${account.collectedPoints} 分；当前 ${account.finalPoints} 分`
        })
        .join(' | ')

    return `今日任务汇总 | ${accountDetails || '没有处理账号'} | 总增加积分：${totalCollected} | 当前积分合计：${totalBalance}`
}

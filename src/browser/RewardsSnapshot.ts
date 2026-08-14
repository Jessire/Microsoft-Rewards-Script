import type { DashboardData, PointsSummary } from '../interface/DashboardData'

export interface RewardsSnapshot {
    availablePoints: number | null
    claimablePoints: number | null
    todayPoints: number | null
    streakDays: number | null
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value !== 'string') return null

    const normalized = value.replace(/,/g, '').trim()
    if (!normalized) return null

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function findTodayPoints(summary: readonly PointsSummary[] | undefined, date: Date): number | null {
    if (!summary?.length) return null

    // The Rewards dashboard uses the .NET/JavaScript Sunday=0..Saturday=6 convention.
    const today = date.getDay()
    const entry = summary.find(item => item.dayOfWeek === today)
    if (entry) return toFiniteNumber(entry.pointsEarned)

    // Keep a defensive fallback for payloads that use Monday=1..Sunday=7.
    const mondayBasedToday = today === 0 ? 7 : today
    const mondayBasedEntry = summary.find(item => item.dayOfWeek === mondayBasedToday)
    return mondayBasedEntry ? toFiniteNumber(mondayBasedEntry.pointsEarned) : null
}

export function extractRewardsSnapshot(data: DashboardData, date = new Date()): RewardsSnapshot {
    const pointClaimBanner = data.dashboard?.pointClaimBannerPromotion
    const streakProtection = data.dashboard?.streakProtectionPromo

    return {
        availablePoints: toFiniteNumber(data.dashboard?.userStatus?.availablePoints),
        claimablePoints: toFiniteNumber(pointClaimBanner?.attributes?.claimable_points),
        todayPoints: findTodayPoints(data.status?.pointsSummary, date),
        streakDays: toFiniteNumber(streakProtection?.streakCount)
    }
}

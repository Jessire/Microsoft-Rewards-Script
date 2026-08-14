import assert from 'node:assert/strict'
import test from 'node:test'

import { extractRewardsSnapshot } from '../dist/browser/RewardsSnapshot.js'
import { formatRunSummary, formatTaskSummary, TaskSummaryTracker } from '../dist/logging/TaskSummary.js'

test('collects daily task results and points from logger events', () => {
    const tracker = new TaskSummaryTracker()

    tracker.record('DAILY-CHECK-IN', 'Completed Daily Check-In | type=103 | pointsGained=5 | currentBalance=1005')
    tracker.record('READ-TO-EARN', 'Read article 1/10 | status=200 | pointsGained=3 | currentBalance=1008')
    tracker.record(
        'READ-TO-EARN',
        'Completed Read to Earn | articlesRead=10 | pointsGained=30 | previousBalance=1005 | currentBalance=1035'
    )
    tracker.record('URL-REWARD', 'Completed UrlReward | offerId=one | pointsGained=5 | currentBalance=1040')
    tracker.record('URL-REWARD', 'Completed UrlReward | offerId=two | pointsGained=10 | currentBalance=1050')
    tracker.record('MORE-PROMOTIONS', 'Finished processing "More Promotions" items')
    tracker.record('SEARCH-MANAGER', 'Search summary | mobile=5 | desktop=10 | bonus=2 | total=17')

    const items = tracker.snapshot()
    assert.match(formatTaskSummary(items), /每日签到：已完成（\+5 分）/)
    assert.match(formatTaskSummary(items), /阅读赚积分：已完成（\+30 分）/)
    assert.match(formatTaskSummary(items), /更多活动：已完成（\+15 分）/)
    assert.match(formatTaskSummary(items), /搜索：已完成（\+17 分）/)
    assert.match(formatTaskSummary(items), /^🟢 每日签到：/m)
    assert.match(formatTaskSummary(items), /^🟢 阅读赚积分：/m)
    assert.match(formatTaskSummary(items), /^🟢 搜索：/m)

    const rewardsSnapshot = extractRewardsSnapshot(
        {
            dashboard: {
                userStatus: { availablePoints: 11918 },
                pointClaimBannerPromotion: { attributes: { claimable_points: '0' } },
                streakProtectionPromo: { streakCount: '11' }
            },
            status: { pointsSummary: [{ dayOfWeek: 5, pointsEarned: 180 }] }
        },
        new Date(2026, 7, 14, 12)
    )
    assert.deepEqual(rewardsSnapshot, {
        availablePoints: 11918,
        claimablePoints: 0,
        todayPoints: 180,
        streakDays: 11
    })

    const summary = formatRunSummary([
        {
            email: 'alice@example.com',
            nickname: 'Alice',
            initialPoints: 1000,
            finalPoints: 1050,
            collectedPoints: 50,
            success: true,
            tasks: items,
            rewardsSnapshot
        }
    ])
    assert.match(summary, /📊 Microsoft Rewards 今日汇总\n\n/)
    assert.match(summary, /每日签到：/)
    assert.match(summary, /阅读赚积分：/)
    assert.match(summary, /可用积分：11,918 分/)
    assert.match(summary, /今日积分：180 分/)
    assert.match(summary, /连续打卡：11 天/)
    assert.match(summary, /本次增加：50 分/)
    assert.match(summary, /可用积分：11,918 分/)
    assert.doesNotMatch(summary, /任务完成情况：/)
    assert.doesNotMatch(summary, /官网积分概况：/)
    assert.doesNotMatch(summary, /可领取：0 分/)
    assert.doesNotMatch(summary, /合计：/)
    assert.match(summary, /昵称：Alice/)
    const detailLines = summary
        .split('\n')
        .filter(line => /(?:昵称|每日签到|阅读赚积分|可用积分|今日积分|连续打卡|本次增加)：/.test(line))
    assert.ok(detailLines.length > 0)
    assert.ok(
        detailLines.every(line => /^(?:🔵|🟢|🟡|🟣|🟠|🔴|🟤) /u.test(line)),
        detailLines.join('\n')
    )
    assert.doesNotMatch(summary, /example\.com/)
    assert.doesNotMatch(summary, / \| /)
})

test('resets account task state between accounts', () => {
    const tracker = new TaskSummaryTracker()
    tracker.record('DAILY-CHECK-IN', 'Completed Daily Check-In | type=103 | pointsGained=5 | currentBalance=1005')
    assert.equal(tracker.snapshot().length, 1)
    tracker.reset()
    assert.deepEqual(tracker.snapshot(), [])
})

import assert from 'node:assert/strict'
import test from 'node:test'

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
    assert.match(formatTaskSummary(items), /每日签到 \+5分/)
    assert.match(formatTaskSummary(items), /阅读赚积分 \+30分/)
    assert.match(formatTaskSummary(items), /更多活动 \+15分/)
    assert.match(formatTaskSummary(items), /搜索 \+17分/)

    const summary = formatRunSummary([
        {
            email: 'alice@example.com',
            initialPoints: 1000,
            finalPoints: 1050,
            collectedPoints: 50,
            success: true,
            tasks: items
        }
    ])
    assert.match(summary, /今日任务汇总/)
    assert.match(summary, /增加 50 分/)
    assert.match(summary, /当前 1050 分/)
    assert.match(summary, /a\*\*\*@example\.com/)
})

test('resets account task state between accounts', () => {
    const tracker = new TaskSummaryTracker()
    tracker.record('DAILY-CHECK-IN', 'Completed Daily Check-In | type=103 | pointsGained=5 | currentBalance=1005')
    assert.equal(tracker.snapshot().length, 1)
    tracker.reset()
    assert.deepEqual(tracker.snapshot(), [])
})

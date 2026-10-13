import type { ResultEvent } from '@re/shared'
import { inWindow, tooOld } from '../deals/dates'
import { clusterCandidates, clusterMergedDeals } from '../deals/dedup'
import { mergeCandidates, mergeMergedDeals } from '../deals/merge'
import type { JobAudit, MergedDeal } from '../types'
import { throwIfAborted } from '../util/concurrency'
import { runCompile } from './compile'
import type { PipelineContext } from './context'
import { runDeepening } from './deepening'
import { runDiscovery } from './discovery'
import { msg } from './messages'

/**
 * The research run: Discovery → dedup and window enforcement → Deepening →
 * Compile. Emits progress through ctx.emit and returns the final payload.
 */

export interface ResearchOutcome {
  result: ResultEvent
  audit: JobAudit
}

/**
 * The time window is enforced here, in code — never left to a search engine or
 * the model. Two rules: the deal's date lies inside the window, and no report
 * of it is older than MAX_DEAL_AGE_DAYS — a transaction first reported months
 * ago and merely mentioned again now is not news.
 *
 * Runs twice: leniently before deepening (an undated deal may still get its
 * date from a follow-up article) and strictly after it.
 */
function enforceWindow(deals: MergedDeal[], ctx: PipelineContext, strict: boolean): MergedDeal[] {
  return deals.filter((deal) => {
    if (!deal.announcementDate) {
      if (!strict || !ctx.settings.strictWindow) return true
      ctx.audit.push({ kind: 'deal_dropped', reason: 'no_date', deal: deal.assetName, url: deal.sources[0]?.url })
      return false
    }
    if (!inWindow(deal.announcementDate, ctx.window)) {
      ctx.audit.push({ kind: 'deal_dropped', reason: 'outside_window', deal: deal.assetName, url: deal.sources[0]?.url, detail: deal.announcementDate })
      return false
    }
    return true
  })
}

/**
 * Dated inside the window, but first reported long before it: an old deal
 * mentioned again, not news. Applied before deepening and again after it,
 * because follow-up sources can reveal an earlier report.
 */
function dropStale(deals: MergedDeal[], ctx: PipelineContext): MergedDeal[] {
  return deals.filter((deal) => {
    if (!deal.earliestDate || !tooOld(deal.earliestDate, ctx.window, ctx.settings.maxDealAgeDays)) return true
    ctx.audit.push({
      kind: 'deal_dropped',
      reason: 'too_old',
      deal: deal.assetName,
      url: deal.sources[0]?.url,
      detail: `najstarszy ślad transakcji: ${deal.earliestDate}, limit ${ctx.settings.maxDealAgeDays} dni przed ${ctx.window.to}`,
    })
    return false
  })
}

export async function runResearch(ctx: PipelineContext): Promise<ResearchOutcome> {
  ctx.emit(msg.init(ctx.window))

  const discovery = await runDiscovery(ctx)
  throwIfAborted(ctx.signal)

  const clusters = clusterCandidates(discovery.candidates)
  const merged = clusters.map((cluster, i) => mergeCandidates(i + 1, cluster, ctx.audit)).filter((deal) => {
    if (deal.sources.length > 0) return true
    ctx.audit.push({ kind: 'deal_dropped', reason: 'no_source', deal: deal.assetName })
    return false
  })
  const deals = dropStale(enforceWindow(merged, ctx, false), ctx)
  ctx.emit(msg.merged(deals.length))

  const rejectedFields = ctx.audit.filter((a) => a.kind === 'field_rejected' || a.kind === 'field_demoted').length
  const droppedDeals = ctx.audit.filter((a) => a.kind === 'deal_dropped').length
  ctx.emit(msg.verification(rejectedFields, droppedDeals, deals.length))

  await runDeepening(deals, ctx)
  throwIfAborted(ctx.signal)

  // deepening may have dated an undated deal, revealed one as old news, or made two entries identical
  const dated = dropStale(enforceWindow(deals, ctx, true), ctx)
  const regrouped = clusterMergedDeals(dated).map((group, i) => mergeMergedDeals(i + 1, group, ctx.audit))
  if (regrouped.length < deals.length) ctx.emit(msg.duplicatesMerged(deals.length - regrouped.length, regrouped.length))

  ctx.emit(msg.compile())
  const compiled = await runCompile(regrouped, ctx)
  throwIfAborted(ctx.signal)
  ctx.emit(msg.done(compiled.transactions.length))

  return {
    result: {
      type: 'result',
      transactions: compiled.transactions,
      meta: {
        window: ctx.window,
        opoint_used: discovery.opointUsed,
        articles_scanned: discovery.articlesScanned,
        deals_dropped: ctx.audit.filter((a) => a.kind === 'deal_dropped').length,
      },
    },
    audit: { entries: ctx.audit, deals: compiled.audit },
  }
}

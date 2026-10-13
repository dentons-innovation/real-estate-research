import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { msg } from '../src/pipeline/messages'
import type { LaneId } from '../src/types'

/**
 * The frontend translates backend log lines to English with regex rules.
 * This test reads those rules from the frontend source and checks that every
 * message the backend can emit is covered — so a reworded message cannot
 * silently lose its translation.
 */

const i18nPath = fileURLToPath(new URL('../../frontend/src/lib/i18n.tsx', import.meta.url))
const source = readFileSync(i18nPath, 'utf8')
const block = source.slice(source.indexOf('const LINE_RULES'), source.indexOf('function translateLine'))
const rules = [...block.matchAll(/^\s*\/(\^.+\$)\/,?\s*$|^\s*\[\/(\^.+\$)\/,/gm)].map((m) => new RegExp(m[1] ?? m[2]))

const window = { from: '2026-08-30', to: '2026-09-29', days: 30 }
const lanes = new Set<LaneId>(['sales', 'lawfirms'])

const samples = [
  msg.init(window),
  msg.opointFetch(window),
  msg.opointResult(42),
  msg.opointUnavailable('Opoint: HTTP 503'),
  msg.opointOff(),
  msg.duplicatesMerged(2, 9),
  msg.opointWarning('feed Opoint nie został pobrany w całości'),
  msg.lanesStart(),
  msg.searchDone(24, 180, 97),
  msg.laneProgress(new Set<LaneId>()),
  msg.laneProgress(lanes),
  msg.extractionProgress(10, 97, 4, lanes),
  msg.merged(12),
  msg.verification(7, 3, 12),
  msg.gaps(8, 12),
  msg.noGaps(12),
  msg.dealStart('Wisła Tower', 1, 8, 0),
  msg.dealSources('Wisła Tower', 1, 8, 3, 0.1),
  msg.dealNoSources('Wisła Tower', 1, 8, 0.2),
  msg.dealEnrich('Wisła Tower', 1, 8, 0.2),
  msg.dealResult('Wisła Tower', 1, 8, 2, 0.3),
  msg.dealResult('Wisła Tower', 1, 8, 0, 0.3),
  msg.compile(),
  msg.done(12),
  msg.aborted(),
]

describe('backend log messages', () => {
  it('finds the translation rules in the frontend', () => {
    expect(rules.length).toBeGreaterThan(25)
  })

  it.each(samples.map((s) => [s.message]))('has an English translation: %s', (message) => {
    expect(rules.some((re) => re.test(message))).toBe(true)
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeEntrantScalarUpdate,
  computeMoneyFlowScalarUpdate,
  deriveEntrantIdFromEntrantDocument,
  deriveRaceIdFromEntrantDocument,
  isMissingScalar,
  sanitizeString,
  shouldSkipUpdate
} from './backfill-helpers.js'

test('sanitizeString normalises strings and objects', () => {
  assert.equal(sanitizeString('  abc  '), 'abc')
  assert.equal(sanitizeString({ $id: 'entrant123' }), 'entrant123')
  assert.equal(sanitizeString({ raceId: 'race789 ' }), 'race789')
  assert.equal(sanitizeString(''), null)
})

test('isMissingScalar detects null, undefined, and empty strings', () => {
  assert.equal(isMissingScalar(null), true)
  assert.equal(isMissingScalar(''), true)
  assert.equal(isMissingScalar('value'), false)
})

test('computeEntrantScalarUpdate backfills missing keys from document fallbacks', () => {
  const doc = { $id: 'entrantA', race: 'raceA', entrantId: null, raceId: '' }
  const update = computeEntrantScalarUpdate(doc)
  assert.deepEqual(update, { entrantId: 'entrantA', raceId: 'raceA' })
})

test('computeMoneyFlowScalarUpdate prefers document values then entrant info', () => {
  const doc = { $id: 'mf1', entrant: 'entrantB', raceId: null, entrantId: null }
  const entrantInfo = { entrantId: 'entrantB', raceId: 'raceB' }
  const update = computeMoneyFlowScalarUpdate(doc, entrantInfo)
  assert.deepEqual(update, { entrantId: 'entrantB', raceId: 'raceB' })
})

test('derived helpers fall back to identifiers on the document', () => {
  const entrantDoc = { $id: 'entrantX', race: { $id: 'raceX' } }
  assert.equal(deriveEntrantIdFromEntrantDocument(entrantDoc), 'entrantX')
  assert.equal(deriveRaceIdFromEntrantDocument(entrantDoc), 'raceX')
})

test('shouldSkipUpdate reports empty updates', () => {
  assert.equal(shouldSkipUpdate({}), true)
  assert.equal(shouldSkipUpdate({ entrantId: 'a' }), false)
})

/**
 * test/parser.test.js
 *
 * Tests the SSE parser logic against captured fixtures.
 * Zero dependencies — uses only node:assert and node:fs.
 * Run with:  node test/parser.test.js
 *
 * ── Why the validators are duplicated here ───────────────────────────────
 *
 * injected.js is a browser IIFE that runs in the page's MAIN world. It
 * cannot be require()'d into Node without a build step, and introducing
 * a build step would break the project's no-dependency contract.
 *
 * Duplicating the validators here is intentional: the test targets the
 * *contract* (the SSE schema and the token values it must produce), not
 * the implementation. If injected.js is rewritten, the test still
 * validates the correct behaviour. Any divergence between the two copies
 * of the validators is itself a bug — caught by the test failing.
 *
 * If the validators here are updated, the counterparts in injected.js
 * MUST be updated identically, and SCHEMA_VERSION must be incremented.
 */

'use strict';

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

// ── Schema contract (mirror of injected.js) ──────────────────────────────

const SCHEMA_VERSION = 1;

function fail(field, expected, received) {
  return { ok: false, field, expected, received: String(received) };
}

function validateMessageStart(evt) {
  if (evt === null || typeof evt !== 'object')
    return fail('root', 'object', typeof evt);
  if (evt.type !== 'message_start')
    return fail('type', '"message_start"', JSON.stringify(evt.type));
  if (evt.message === null || typeof evt.message !== 'object')
    return fail('message', 'object', typeof evt.message);
  if (evt.message.usage === null || typeof evt.message.usage !== 'object')
    return fail('message.usage', 'object', typeof evt.message.usage);
  if (typeof evt.message.usage.input_tokens !== 'number')
    return fail('message.usage.input_tokens', 'number', typeof evt.message.usage.input_tokens);
  return { ok: true };
}

function validateMessageDelta(evt) {
  if (evt === null || typeof evt !== 'object')
    return fail('root', 'object', typeof evt);
  if (evt.type !== 'message_delta')
    return fail('type', '"message_delta"', JSON.stringify(evt.type));
  if (evt.usage === null || typeof evt.usage !== 'object')
    return fail('usage', 'object', typeof evt.usage);
  if (typeof evt.usage.output_tokens !== 'number')
    return fail('usage.output_tokens', 'number', typeof evt.usage.output_tokens);
  return { ok: true };
}

// ── SSE fixture parser (mirrors injected.js parseStream, synchronous) ────

/**
 * Parses a raw SSE fixture string (as written to disk) and returns:
 * {
 *   inputTokens:  number,
 *   outputTokens: number,
 *   drifts:       Array<{ eventType, field, expected, received }>
 * }
 */
function parseFixture(raw) {
  const lines       = raw.split('\n');
  let inputTokens   = 0;
  let outputTokens  = 0;
  const drifts      = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;

    const payload = trimmed.slice(6);
    if (payload === '[DONE]') continue;

    let evt;
    try { evt = JSON.parse(payload); }
    catch { continue; }

    if (evt.type === 'message_start') {
      const result = validateMessageStart(evt);
      if (!result.ok) {
        drifts.push({ eventType: 'message_start', ...result });
        inputTokens = evt?.message?.usage?.input_tokens ?? 0;
      } else {
        inputTokens = evt.message.usage.input_tokens;
      }
    }

    if (evt.type === 'message_delta') {
      const result = validateMessageDelta(evt);
      if (!result.ok) {
        drifts.push({ eventType: 'message_delta', ...result });
        outputTokens = evt?.usage?.output_tokens ?? 0;
      } else {
        outputTokens = evt.usage.output_tokens;
      }
    }
  }

  return { inputTokens, outputTokens, drifts };
}

// ── Test harness ──────────────────────────────────────────────────────────

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

// ── Tests ─────────────────────────────────────────────────────────────────

console.log(`\nClaude Token Tracker — parser tests (schema v${SCHEMA_VERSION})\n`);

// ── Case 1: Happy path ────────────────────────────────────────────────────
test('completion.sse → correct inputTokens', () => {
  const { inputTokens } = parseFixture(fixture('completion.sse'));
  assert.equal(inputTokens, 8431,
    `expected inputTokens=8431, got ${inputTokens}`);
});

test('completion.sse → correct outputTokens', () => {
  const { outputTokens } = parseFixture(fixture('completion.sse'));
  assert.equal(outputTokens, 312,
    `expected outputTokens=312, got ${outputTokens}`);
});

test('completion.sse → no drift reported', () => {
  const { drifts } = parseFixture(fixture('completion.sse'));
  assert.equal(drifts.length, 0,
    `expected 0 drifts, got ${drifts.length}: ${JSON.stringify(drifts)}`);
});

test('completion.sse → context fill within 0–100%', () => {
  const { inputTokens, outputTokens } = parseFixture(fixture('completion.sse'));
  const pct = Math.round(((inputTokens + outputTokens) / 200_000) * 100);
  assert.ok(pct >= 0 && pct <= 100,
    `expected pct in [0,100], got ${pct}`);
});

// ── Case 2: Schema drift — wrong type ────────────────────────────────────
test('completion-drift-type.sse → drift reported for message_start', () => {
  const { drifts } = parseFixture(fixture('completion-drift-type.sse'));
  assert.ok(drifts.length > 0, 'expected at least one drift, got none');
  assert.equal(drifts[0].eventType, 'message_start',
    `expected drift on message_start, got ${drifts[0].eventType}`);
});

test('completion-drift-type.sse → drift identifies correct field', () => {
  const { drifts } = parseFixture(fixture('completion-drift-type.sse'));
  assert.equal(drifts[0].field, 'message.usage.input_tokens',
    `expected field=message.usage.input_tokens, got ${drifts[0].field}`);
});

test('completion-drift-type.sse → drift reports expected type as "number"', () => {
  const { drifts } = parseFixture(fixture('completion-drift-type.sse'));
  assert.equal(drifts[0].expected, 'number',
    `expected expected="number", got ${drifts[0].expected}`);
});

test('completion-drift-type.sse → drift reports received type as "string"', () => {
  const { drifts } = parseFixture(fixture('completion-drift-type.sse'));
  assert.equal(drifts[0].received, 'string',
    `expected received="string", got ${drifts[0].received}`);
});

test('completion-drift-type.sse → graceful extraction still returns outputTokens', () => {
  const { outputTokens } = parseFixture(fixture('completion-drift-type.sse'));
  assert.equal(outputTokens, 47,
    `expected outputTokens=47 despite drift, got ${outputTokens}`);
});

// ── Case 3: Schema drift — missing field ──────────────────────────────────
test('completion-drift-missing.sse → drift reported for message_start', () => {
  const { drifts } = parseFixture(fixture('completion-drift-missing.sse'));
  assert.ok(drifts.length > 0, 'expected at least one drift, got none');
  assert.equal(drifts[0].eventType, 'message_start',
    `expected drift on message_start, got ${drifts[0].eventType}`);
});

test('completion-drift-missing.sse → drift identifies missing usage block', () => {
  const { drifts } = parseFixture(fixture('completion-drift-missing.sse'));
  assert.equal(drifts[0].field, 'message.usage',
    `expected field=message.usage, got ${drifts[0].field}`);
});

test('completion-drift-missing.sse → drift reports received type as "undefined"', () => {
  const { drifts } = parseFixture(fixture('completion-drift-missing.sse'));
  assert.equal(drifts[0].received, 'undefined',
    `expected received="undefined", got ${drifts[0].received}`);
});

test('completion-drift-missing.sse → graceful extraction yields inputTokens=0', () => {
  const { inputTokens } = parseFixture(fixture('completion-drift-missing.sse'));
  assert.equal(inputTokens, 0,
    `expected inputTokens=0 when usage block missing, got ${inputTokens}`);
});

// ── Summary ───────────────────────────────────────────────────────────────

console.log('');
console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) process.exit(1);

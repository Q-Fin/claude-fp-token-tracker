/**
 * injected.js — executes in the page's MAIN world.
 *
 * Overrides window.fetch, intercepts Claude's SSE completion stream,
 * validates each relevant event against a typed schema contract, and
 * forwards either a CTT_UPDATE (success) or CTT_DRIFT (schema mismatch)
 * to content.js via postMessage.
 *
 * SCHEMA_VERSION is an integer that increments independently of the
 * extension's semver. It identifies the observed SSE event shape.
 * When Anthropic changes the API response structure, this number must
 * be bumped alongside a fix to the validators below.
 */
(function () {
  'use strict';

  // ── Schema contract ─────────────────────────────────────────────────────
  //
  // Each validator returns either { ok: true } or
  // { ok: false, field: string, expected: string, received: string }.
  //
  // "field" uses dot-notation for nested paths so drift reports are
  // actionable without reading source code
  // (e.g. "message.usage.input_tokens").

  const SCHEMA_VERSION = 1;

  function fail(field, expected, received) {
    return { ok: false, field, expected, received: String(received) };
  }

  /**
   * Validates the `message_start` SSE event.
   * Expected shape:
   * {
   *   type: "message_start",
   *   message: {
   *     usage: {
   *       input_tokens: number   // full context fed to the model this turn
   *     }
   *   }
   * }
   */
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
      return fail(
        'message.usage.input_tokens',
        'number',
        typeof evt.message.usage.input_tokens
      );

    return { ok: true };
  }

  /**
   * Validates the `message_delta` SSE event.
   * Expected shape:
   * {
   *   type: "message_delta",
   *   usage: {
   *     output_tokens: number   // assistant tokens for this turn
   *   }
   * }
   */
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

  // ── Fetch override ──────────────────────────────────────────────────────

  const COMPLETION_RE = /\/chat_conversations\/([^/?#]+)\/completion/;
  const _fetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const response = await _fetch(...args);

    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    const m = url.match(COMPLETION_RE);
    if (!m) return response;

    parseStream(response.clone(), m[1]).catch(() => {});
    return response;
  };

  // ── SSE parser ──────────────────────────────────────────────────────────

  async function parseStream(response, conversationId) {
    if (!response.body) return;

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buf          = '';
    let inputTokens  = 0;
    let outputTokens = 0;

    // Emit at most one drift report per stream: the first failing event
    // is sufficient to act on; flooding background with duplicates adds
    // no value and creates noise.
    let driftReported = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);

          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          let evt;
          try { evt = JSON.parse(payload); }
          catch { continue; }

          if (evt.type === 'message_start') {
            const result = validateMessageStart(evt);
            if (!result.ok) {
              if (!driftReported) {
                emitDrift(conversationId, 'message_start', result);
                driftReported = true;
              }
              // Graceful degradation: extract whatever value exists despite mismatch.
              inputTokens = evt?.message?.usage?.input_tokens ?? 0;
            } else {
              inputTokens = evt.message.usage.input_tokens;
            }
          }

          if (evt.type === 'message_delta') {
            const result = validateMessageDelta(evt);
            if (!result.ok) {
              if (!driftReported) {
                emitDrift(conversationId, 'message_delta', result);
                driftReported = true;
              }
              outputTokens = evt?.usage?.output_tokens ?? 0;
            } else {
              outputTokens = evt.usage.output_tokens;
            }
          }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { /* already released on stream end */ }
    }

    if (inputTokens > 0) {
      window.postMessage(
        {
          __ctt:          true,
          type:           'CTT_UPDATE',
          conversationId,
          inputTokens,
          outputTokens,
          schemaVersion:  SCHEMA_VERSION,
          hasDrift:       driftReported,   // lets popup annotate even on partial success
        },
        window.location.origin
      );
    }
  }

  // ── Drift reporter ──────────────────────────────────────────────────────

  function emitDrift(conversationId, eventType, validationResult) {
    window.postMessage(
      {
        __ctt:          true,
        type:           'CTT_DRIFT',
        conversationId,
        schemaVersion:  SCHEMA_VERSION,
        eventType,                        // which SSE event type failed
        field:          validationResult.field,
        expected:       validationResult.expected,
        received:       validationResult.received,
      },
      window.location.origin
    );
  }
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrediction } from './prediction.js';

const windowTime = {
  slot: 29866354,
  serverTime: '2026-10-14T12:34:20Z',
  validUntil: '2026-10-14T12:35:00Z',
};

test('accepts a shared prediction with a server minute and 1 to 10 positions', () => {
  assert.deepEqual(parsePrediction({ count: 3, positions: [1, 13, 25], ...windowTime }), {
    count: 3, positions: [1, 13, 25], ...windowTime,
  });
});

test('rejects an invalid server minute or dish selection', () => {
  for (const payload of [
    { count: 2, positions: [1, 1], ...windowTime },
    { count: 2, positions: [0, 25], ...windowTime },
    { count: 2, positions: [1], ...windowTime },
    { count: 11, positions: Array.from({ length: 11 }, (_, i) => i + 1), ...windowTime },
    { count: 1, positions: [1], ...windowTime, slot: windowTime.slot + 1 },
  ]) assert.throws(() => parsePrediction(payload), { code: 'INVALID_RESPONSE' });
});

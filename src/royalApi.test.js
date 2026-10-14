import test from 'node:test';
import assert from 'node:assert/strict';
import { ANON_KEY } from './remote.js';
import { predictRoyalDishes } from './royalApi.js';

test('predictor reads the shared minute without login or round code', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      slot: 29866354, count: 2, positions: [4, 19],
      serverTime: '2026-10-14T12:34:20Z', validUntil: '2026-10-14T12:35:00Z',
    }), { status: 200 });
  };
  const result = await predictRoyalDishes();
  assert.deepEqual(result.positions, [4, 19]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/get_current_royal_prediction$/);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${ANON_KEY}`);
  assert.equal(calls[0].options.body, '{}');
});

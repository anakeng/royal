import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROMO_ID, getPromoFromSearch, PROMOS } from './promo/config.js';

test('each opening link selects its promo code and colors', () => {
  for (const [id, promo] of Object.entries(PROMOS)) {
    assert.deepEqual(getPromoFromSearch(`?promo=${id}`), { id, promo });
  }
});

test('codes and unknown links do not select a promo', () => {
  assert.equal(getPromoFromSearch('?promo=ENJ55').id, DEFAULT_PROMO_ID);
  assert.equal(getPromoFromSearch('?code=ENJ55').id, DEFAULT_PROMO_ID);
  assert.equal(getPromoFromSearch('?promo=inconnu').id, DEFAULT_PROMO_ID);
});

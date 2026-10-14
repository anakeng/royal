export const DISH_COUNT = 25;

export class PredictionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PredictionError';
    this.code = code;
  }
}

export function parsePrediction(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PredictionError('INVALID_RESPONSE', 'Le résultat reçu est invalide.');
  }
  const { slot, count, positions, serverTime, validUntil } = payload;
  const serverMs = typeof serverTime === 'string' ? Date.parse(serverTime) : NaN;
  const untilMs = typeof validUntil === 'string' ? Date.parse(validUntil) : NaN;
  if (!Number.isSafeInteger(slot) || slot < 0
    || !Number.isInteger(count) || count < 1 || count > 10
    || !Array.isArray(positions) || positions.length !== count
    || positions.some((position) => !Number.isInteger(position) || position < 1 || position > DISH_COUNT)
    || new Set(positions).size !== positions.length
    || !Number.isFinite(serverMs) || !Number.isFinite(untilMs)
    || untilMs <= serverMs || untilMs - serverMs > 60000
    || untilMs !== (slot + 1) * 60000) {
    throw new PredictionError('INVALID_RESPONSE', 'Le résultat reçu est invalide.');
  }
  return { slot, count, positions: [...positions], serverTime, validUntil };
}

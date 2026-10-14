import { callRoyalRpc } from './remote.js';
import { PredictionError, parsePrediction } from './prediction.js';

export async function predictRoyalDishes(signal) {
  try {
    return parsePrediction(await callRoyalRpc('get_current_royal_prediction', signal));
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (error instanceof PredictionError) throw error;
    throw new PredictionError('NETWORK', error.message || 'Connexion indisponible. Réessaie dans un instant.');
  }
}

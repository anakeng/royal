import { useEffect, useState } from 'react';
import './entry.css';

export default function EntryFlow({ onEnter, promo }) {
  const [step, setStep] = useState('alert');
  const [playerId, setPlayerId] = useState('');
  const [needsPromo, setNeedsPromo] = useState(false);
  const [needsBalance, setNeedsBalance] = useState(false);

  useEffect(() => {
    if (step !== 'syncing') return undefined;
    const timer = setTimeout(() => onEnter(true), 3000);
    return () => clearTimeout(timer);
  }, [step, onEnter]);

  function showPromo() { setStep('promo'); }

  function confirmId(event) {
    event.preventDefault();
    if (/^\d{4,}$/.test(playerId.trim())) setStep('syncing');
  }

  return (
    <div className="entry-overlay">
      <span className="entry-status"><span className="entry-status-dot" />Non connecté au jeu</span>
      {step === 'alert' ? (
        <div className="entry-alert-screen" role="button" tabIndex={0}
          aria-label="Afficher la question sur le code promo"
          onClick={showPromo}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showPromo(); } }}>
          <div className="entry-alert-stream" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="entry-alert-card" key={index} style={{ '--index': index }}>
                <span>⚠</span><strong>NON SYNCHRONISÉ</strong><small>TOUCHEZ L’ÉCRAN POUR CONTINUER</small>
              </div>
            ))}
          </div>
          <div className="entry-alert-center">
            <span className="entry-alert-icon">⚠</span>
            <h1>Non synchronisé</h1>
            <p>Appuie n’importe où pour continuer.</p>
          </div>
        </div>
      ) : (
        <section className="entry-card" aria-label="Accueil Royal">
          {step === 'id' && (
            <form onSubmit={confirmId}>
              <span className="entry-card-icon">♛</span>
              <h1>Ton ID joueur</h1>
              <p>Entre ton ID joueur 1xBet pour terminer et afficher le prédicteur.</p>
              <label htmlFor="entry-player-id">ID JOUEUR 1XBET</label>
              <input id="entry-player-id" type="text" inputMode="numeric" autoComplete="off"
                pattern="[0-9]{4,}" title="Saisis au moins quatre chiffres" placeholder="Ex : 987654321"
                value={playerId} onChange={(event) => setPlayerId(event.target.value.replace(/\D/g, ''))} required />
              <button type="submit" disabled={!/^\d{4,}$/.test(playerId.trim())}>Afficher le prédicteur →</button>
              <small></small>
            </form>
          )}

          {step === 'promo' && (
            <div>
              <span className="entry-card-icon">?</span>
              <h1>Code promo {promo.code}</h1>
              <p>Tu t’es inscrit avec ce code promo ?</p>
              <button type="button" onClick={() => setStep('balance')}>Oui, je suis inscrit →</button>
              <button className="entry-secondary" type="button" onClick={() => setNeedsPromo(true)}>Non, pas encore</button>
              {needsPromo && (
                <div className="entry-help">
                  <p>Utilise le lien partenaire et le code <strong>{promo.code}</strong> si tu souhaites t’inscrire.</p>
                  <a className="entry-affiliate" href={promo.affiliateLink} target="_blank" rel="noopener noreferrer">
                    Ouvrir le lien d’inscription ↗
                  </a>
                  <button type="button" onClick={() => setStep('balance')}>J’ai terminé →</button>
                </div>
              )}
              <small>.</small>
            </div>
          )}

          {step === 'balance' && (
            <div>
              <span className="entry-card-icon">?</span>
              <h1>Solde du compte</h1>
              <p>As-tu au moins <strong>5 000 FCFA</strong> sur ton compte ?</p>
              <button type="button" onClick={() => setStep('id')}>Oui, continuer →</button>
              <button className="entry-secondary" type="button" onClick={() => setNeedsBalance(true)}>Non, pas encore</button>
              {needsBalance && <p className="entry-help">Tu peux revenir à cette étape quand tu seras prêt.</p>}
              <small></small>
            </div>
          )}

          {step === 'syncing' && (
            <div className="entry-sync" role="status" aria-live="polite">
              <div className="entry-sync-symbol" aria-hidden="true">♛</div>
              <h1>Synchronisation en cours…</h1>
              <p>Préparation du prédicteur Royal.</p>
              <div className="entry-sync-progress" aria-hidden="true"><span /></div>
              <small>Le prédicteur s’ouvrira dans 3 secondes.</small>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

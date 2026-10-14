import { useEffect, useRef, useState } from 'react';
import { DISH_COUNT } from './prediction.js';
import { predictRoyalDishes } from './royalApi.js';
import EntryFlow from './EntryFlow.jsx';
import { getPromoFromSearch } from './promo/config.js';

const dishes = Array.from({ length: DISH_COUNT }, (_, index) => index + 1);

function Dish({ number, selected }) {
  return (
    <li className={`dish${selected ? ' dish--selected' : ''}`}
      aria-label={`Plat ${number}${selected ? ' : position indiquée' : ''}`}>
      <span className="dish-number">{String(number).padStart(2, '0')}</span>
      <span className="cloche" aria-hidden="true">
        <span className="cloche-knob" />
        <span className="cloche-dome" />
        <span className="cloche-tray" />
      </span>
      {selected && <span className="dish-check" aria-hidden="true">✓</span>}
    </li>
  );
}

function minuteClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function App() {
  const { promo } = getPromoFromSearch(window.location.search);
  const themeStyle = {
    '--promo-primary': promo.colors.primary,
    '--promo-primary-dark': promo.colors.primaryDark,
    '--promo-accent': promo.colors.accent,
    '--promo-glow-1': promo.colors.glow1,
    '--promo-glow-2': promo.colors.glow2,
    '--promo-success': promo.colors.success,
  };
  const [entered, setEntered] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [remaining, setRemaining] = useState(null);
  const request = useRef(null);
  const refreshTimer = useRef(null);
  const clock = useRef(null);
  const loadRef = useRef(null);

  useEffect(() => {
    if (!entered) return;
    let active = true;
    async function load(background = false) {
      if (!active || request.current || document.hidden) return;
      const controller = new AbortController();
      request.current = controller;
      if (!background) setLoading(true);
      try {
        const sentAt = Date.now();
        const result = await predictRoyalDishes(controller.signal);
        if (!active || controller.signal.aborted) return;
        const receivedAt = Date.now();
        const serverOffset = Date.parse(result.serverTime) - (sentAt + receivedAt) / 2;
        const end = Date.parse(result.validUntil);
        setPrediction(result);
        setMessage('');
        setRemaining(Math.max(0, end - receivedAt - serverOffset));
        clearInterval(clock.current);
        clock.current = setInterval(() => {
          setRemaining(Math.max(0, end - Date.now() - serverOffset));
        }, 250);
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          if (!active) return;
          setPrediction(null);
          setRemaining(null);
          setMessage('Nouvelle combinaison en cours…');
          void load(true);
        }, Math.max(250, end - Date.now() - serverOffset + 150));
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setPrediction(null);
        setRemaining(null);
        clearInterval(clock.current);
        setMessage(error.message || 'La prédiction est indisponible.');
      } finally {
        if (request.current === controller) request.current = null;
        if (active) setLoading(false);
      }
    }
    loadRef.current = load;
    void load();
    const poll = setInterval(() => { if (!document.hidden) void load(true); }, 5000);
    const onVisible = () => { if (!document.hidden) void load(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      loadRef.current = null;
      clearInterval(poll);
      clearInterval(clock.current);
      clearTimeout(refreshTimer.current);
      request.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [entered]);

  function refresh() {
    request.current?.abort();
    request.current = null;
    void loadRef.current?.();
  }

  const highlighted = new Set(prediction?.positions || []);
  const positions = prediction ? [...prediction.positions].sort((a, b) => a - b) : [];

  return (
    <div className="site-shell" style={themeStyle}>
      <header className="site-header">
        <div className="brand">
          <img src="/royal-mark.svg" alt="" className="brand-mark" />
          <div><span className="brand-name">ROYAL</span><span className="brand-caption">PRÉDICTEUR</span></div>
        </div>
        <span className={`connection${prediction ? ' connection--ready' : ''}`}>
          <span className="connection-dot" />
          {prediction ? 'Connecté au jeu' : 'Non connecté au jeu'}
        </span>
      </header>

      <main className="main-layout">
        <section className="intro-panel" aria-labelledby="page-title">
          <p className="eyebrow">LE JEU DES 25 PLATS</p>
          <h1 id="page-title"> Feast<em>Royal.</em></h1>
          <p className="intro-text"></p>

          <div className="minute-panel" role="timer" aria-label="Temps restant avant la prochaine combinaison">
            <span>PROCHAINE COMBINAISON</span>
            <strong>{remaining === null ? '--:--' : minuteClock(remaining)}</strong>
          </div>
          <button className="predict-button" type="button" disabled={loading} onClick={refresh}>
            <span className="predict-symbol" aria-hidden="true">✦</span>
            {loading ? 'Recherche des plats…' : 'PRÉDIC'}
            <span className="predict-arrow" aria-hidden="true">↗</span>
          </button>

          <div className={`feedback${message ? ' feedback--error' : ''}${prediction ? ' feedback--success' : ''}`}
            role={message ? 'alert' : 'status'} aria-live="polite">
            {message || (prediction
              ? `${prediction.count} ${prediction.count === 1 ? 'plat sûr indiqué' : 'plats sûrs indiqués'}. La combinaison change à la fin du compte à rebours.`
              : 'Connexion au plateau Royal en cours…')}
          </div>
        </section>

        <section className="board-panel" aria-labelledby="board-title">
          <div className="board-heading">
            <div><p className="eyebrow">PLATEAU ROYAL</p><h2 id="board-title">25 plats</h2></div>
            <div className="count-badge" aria-label={prediction ? `${prediction.count} plats indiqués` : 'Aucun plat indiqué'}>
              <strong>{prediction ? String(prediction.count).padStart(2, '0') : '—'}</strong>
              <span>INDIQUÉS</span>
            </div>
          </div>
          <ol className="dish-grid" aria-label="Plats numérotés de 1 à 25, de gauche à droite et de haut en bas">
            {dishes.map((number) => <Dish key={number} number={number} selected={highlighted.has(number)} />)}
          </ol>
          <div className="board-footer">
            {prediction ? (
              <p><span className="footer-label">POSITIONS</span><span className="position-list">{positions.map((position) => String(position).padStart(2, '0')).join(' · ')}</span></p>
            ) : (
              <p><span className="footer-label">POSITIONS</span><span className="position-placeholder">En attente du plateau</span></p>
            )}
            <span className="board-orientation">01 en haut à gauche · 25 en bas à droite</span>
          </div>
        </section>
      </main>
      <footer className="site-footer">ROYAL <span>✦</span> PRÉDICTEUR</footer>
      {!entered && <EntryFlow onEnter={setEntered} promo={promo} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  createUser, hasAdminSession, listDevices, listUsers, requireAdmin,
  revokeDevice, setDeviceLimit, setUserAccess, signInAdmin, signOutAdmin,
} from './adminClient.js';
import './admin.css';

const date = (value) => new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
const daysLeft = (value) => Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));

export default function AdminApp() {
  const [signedIn, setSignedIn] = useState(false);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDays, setNewDays] = useState('30');
  const [selected, setSelected] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceLimit, setDeviceLimitValue] = useState('1');

  async function loadUsers(nextPage = page) {
    const result = await listUsers(nextPage);
    setUsers(result.users);
    setTotal(result.total);
    setPage(nextPage);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!hasAdminSession()) { setBooting(false); return; }
      try {
        await requireAdmin();
        const result = await listUsers(0);
        if (active) { setSignedIn(true); setUsers(result.users); setTotal(result.total); }
      } catch (failure) { if (active) setError(failure.message); }
      finally { if (active) setBooting(false); }
    })();
    return () => { active = false; };
  }, []);

  async function run(action, success) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      if (success) setNotice(success);
    } catch (failure) { setError(failure.message || 'Opération non confirmée.'); }
    finally { setBusy(false); }
  }

  function login(event) {
    event.preventDefault();
    void run(async () => {
      await signInAdmin(email, password);
      setPassword('');
      await loadUsers(0);
      setSignedIn(true);
    });
  }

  function create(event) {
    event.preventDefault();
    const days = Number(newDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650 || newPassword.length < 12) {
      setError('Indique de 1 à 3650 jours et un mot de passe de 12 caractères minimum.');
      return;
    }
    void run(async () => {
      await createUser(newEmail, newPassword, days);
      setNewEmail(''); setNewPassword('');
      await loadUsers(0);
    }, 'Compte créé et activé.');
  }

  function changeDays(user) {
    const raw = window.prompt('Nombre de jours d’accès à partir de maintenant (0 à 3650) :', String(daysLeft(user.access_expires_at)));
    if (raw === null) return;
    const days = Number(raw);
    if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(days) || days > 3650) {
      setError('Durée invalide : entre 0 et 3650 jours.');
      return;
    }
    void run(async () => { await setUserAccess(user.id, days); await loadUsers(); }, 'Durée d’accès mise à jour.');
  }

  function changeBlock(user) {
    void run(async () => {
      await setUserAccess(user.id, null, !user.is_blocked);
      await loadUsers();
    }, user.is_blocked ? 'Compte débloqué.' : 'Compte bloqué.');
  }

  function openDevices(user) {
    void run(async () => {
      const rows = await listDevices(user.id);
      setSelected(user);
      setDevices(rows);
      setDeviceLimitValue(String(user.device_limit));
    });
  }

  function saveDeviceLimit() {
    const limit = Number(deviceLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      setError('La limite doit être comprise entre 1 et 10 appareils.');
      return;
    }
    void run(async () => {
      await setDeviceLimit(selected.id, limit);
      setDevices(await listDevices(selected.id));
      setSelected({ ...selected, device_limit: limit });
      await loadUsers();
    }, 'Limite d’appareils mise à jour.');
  }

  function removeDevice(device) {
    void run(async () => {
      await revokeDevice(device.id);
      setDevices(await listDevices(selected.id));
    }, 'Appareil révoqué.');
  }

  return <div className="admin-shell">
    <header className="admin-header">
      <div><span className="admin-kicker">ROYAL</span><h1>Administration</h1></div>
      {signedIn && <button type="button" className="admin-secondary" onClick={() => {
        void signOutAdmin(); setSignedIn(false); setUsers([]); setSelected(null); setNotice('');
      }}>Déconnexion</button>}
    </header>
    {booting ? <p className="admin-center">Vérification de la session…</p> : !signedIn ?
      <main className="admin-login admin-card">
        <h2>Connexion administrateur</h2>
        <p>Utilise le compte créé dans le projet Supabase Royal.</p>
        <form onSubmit={login}>
          <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        </form>
        {error && <p className="admin-error" role="alert">{error}</p>}
      </main> :
      <main className="admin-layout">
        <section className="admin-card">
          <h2>Créer un utilisateur</h2>
          <form onSubmit={create} className="admin-create">
            <label>E-mail<input type="email" required maxLength={254} autoComplete="off" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
            <label>Mot de passe<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            <label>Jours d’accès<input type="number" required min="1" max="3650" value={newDays} onChange={(event) => setNewDays(event.target.value)} /></label>
            <button type="submit" disabled={busy}>{busy ? 'Patiente…' : 'Créer le compte'}</button>
          </form>
          <p className="admin-hint">Les mots de passe sont envoyés uniquement à la fonction sécurisée de création des comptes.</p>
        </section>
        <section className="admin-card admin-users">
          <div className="admin-row"><h2>{total} comptes</h2><button type="button" className="admin-secondary" disabled={busy} onClick={() => void run(() => loadUsers())}>Actualiser</button></div>
          {notice && <p className="admin-success" role="status">{notice}</p>}
          {error && <p className="admin-error" role="alert">{error}</p>}
          {users.length === 0 && <p>Aucun compte à afficher.</p>}
          <div className="admin-list">{users.map((user) => {
            const isAdmin = user.role === 'admin';
            const days = daysLeft(user.access_expires_at);
            const status = user.is_blocked ? 'Bloqué' : isAdmin ? 'Administrateur' : days > 0 ? 'Actif' : 'Expiré';
            return <article key={user.id} className="admin-user">
              <div className="admin-row"><strong>{user.email}</strong><span className={`admin-status ${user.is_blocked || (!isAdmin && !days) ? 'admin-status--off' : ''}`}>{status}</span></div>
              <p>{isAdmin ? 'Accès illimité · compte protégé' : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''} · fin ${date(user.access_expires_at)}`}</p>
              {!isAdmin && <div className="admin-actions">
                <button type="button" disabled={busy} onClick={() => changeDays(user)}>Modifier les jours</button>
                <button type="button" disabled={busy} onClick={() => openDevices(user)}>Appareils ({user.device_limit})</button>
                <button type="button" disabled={busy} className={user.is_blocked ? '' : 'admin-danger'} onClick={() => changeBlock(user)}>{user.is_blocked ? 'Débloquer' : 'Bloquer'}</button>
              </div>}
            </article>;
          })}</div>
          <div className="admin-pagination">
            <button type="button" className="admin-secondary" disabled={busy || page === 0} onClick={() => void run(() => loadUsers(page - 1))}>Précédent</button>
            <span>Page {page + 1} / {Math.max(1, Math.ceil(total / 50))}</span>
            <button type="button" className="admin-secondary" disabled={busy || (page + 1) * 50 >= total} onClick={() => void run(() => loadUsers(page + 1))}>Suivant</button>
          </div>
        </section>
      </main>}
    {selected && <div className="admin-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null); }}>
      <section className="admin-card admin-dialog" role="dialog" aria-modal="true" aria-label={`Appareils de ${selected.email}`}>
        <div className="admin-row"><h2>Appareils de {selected.email}</h2><button type="button" className="admin-secondary" disabled={busy} onClick={() => setSelected(null)}>Fermer</button></div>
        {notice && <p className="admin-success" role="status">{notice}</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="admin-limit"><label>Appareils autorisés<input type="number" min="1" max="10" value={deviceLimit} onChange={(event) => setDeviceLimitValue(event.target.value)} /></label><button type="button" disabled={busy} onClick={saveDeviceLimit}>Enregistrer</button></div>
        {devices.length === 0 && <p>Aucun appareil enregistré.</p>}
        {devices.map((device) => <div className="admin-device" key={device.id}>
          <div><strong>{device.name}</strong><p>{device.revoked ? 'Révoqué' : 'Actif'} · Dernière connexion : {date(device.last_seen_at)}</p></div>
          {!device.revoked && <button type="button" className="admin-danger" disabled={busy} onClick={() => removeDevice(device)}>Révoquer</button>}
        </div>)}
      </section>
    </div>}
  </div>;
}

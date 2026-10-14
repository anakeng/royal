# Prédicteur Royal

Royal et le prédicteur interrogent le **même projet Supabase**, sans code de partie. Le **jeu Royal demande une connexion e-mail/mot de passe** ; le prédicteur reste accessible sans compte. Le serveur conserve cinq positions de poison communes à toutes les nouvelles parties. Royal place les mets sur les 20 cases sûres ; le prédicteur choisit chaque minute une combinaison de **1 à 10 cases sûres**. Le compte à rebours utilise l'heure renvoyée par Supabase et le site recharge automatiquement la combinaison à la minute suivante.

Les plats sont numérotés de 1 à 25, de gauche à droite et de haut en bas. La combinaison peut inclure une case déjà ouverte dans une partie, car le site ne reçoit aucun identifiant ni l'historique des ouvertures de chaque joueur. Elle indique toujours une case sans poison pour les **nouvelles parties créées avec le plateau partagé**.

## Préparer Supabase

Dans le **SQL Editor** du projet `ihlnhjistuvvbdnuvhcu`, exécute la migration `supabase/migrations/202610140002_royal_shared_minute.sql`. Elle peut être exécutée si l'ancienne migration `202610140001_royal_prediction.sql` a déjà été appliquée ; sinon, elle suffit à elle seule pour le plateau partagé. Elle retire les anciens RPC par code et crée `get_royal_shared_layout()` et `get_current_royal_prediction()` accessibles avec la clé publique. Les migrations 003 et 004 ci-dessous sont aussi nécessaires pour autoriser les connexions au jeu.

Ne change pas manuellement les cinq positions de poison pendant qu'une partie est active : les parties déjà démarrées gardent leur plateau local jusqu'à la fin.

## Démarrer et vérifier

```powershell
npm.cmd run dev --prefix royal
npm.cmd run dev --prefix royal/predicteur_royal
```

1. Ouvre le prédicteur : une combinaison apparaît, sans connexion ni saisie.
2. Dans Royal, connecte-toi avec un compte créé par l'administrateur, puis place une mise pour créer une nouvelle partie avec le plateau partagé.
3. Choisis l'une des cases indiquées par le prédicteur qui est encore fermée dans Royal.
4. Attends la fin du compte à rebours : la combinaison change automatiquement.

`npm.cmd run test --prefix royal/predicteur_royal` vérifie les réponses et `npm.cmd run build --prefix royal/predicteur_royal` construit le site. L'APK n'est pas régénéré automatiquement.

Cette liaison concerne un prototype à crédits fictifs. Les positions de poison sont accessibles au client du jeu pour qu'il construise son plateau ; cela ne convient pas à des mises réelles. Pour de l'argent réel, le serveur devrait créer les parties, contrôler les soldes et décider du résultat de chaque ouverture.

## Administration Royal

L'administration est intégrée à l'application mobile Royal. Un compte administrateur connecté voit la gestion des utilisateurs et un bouton **Jouer**. Depuis le jeu, le bouton retour permet de rouvrir l'administration. La page web `/admin/` reste disponible. Les administrateurs peuvent créer les comptes, fixer leur durée d'accès, bloquer un utilisateur, limiter les appareils et en révoquer un. Le jeu exige un compte actif et un appareil autorisé ; le prédicteur reste public.

Dans le **projet Supabase Royal** `ihlnhjistuvvbdnuvhcu`, applique dans cet ordre :

1. `supabase/migrations/202610140002_royal_shared_minute.sql` si elle n'est pas déjà appliquée ;
2. `supabase/migrations/202610140003_royal_admin_accounts.sql` ;
3. `supabase/migrations/202610140004_royal_admin_devices.sql`.

Utilise **SQL Editor** dans le tableau de bord du projet Royal. Il ne faut pas appliquer ces migrations dans le projet Supabase d'Over. La migration des comptes crée aussi les profils bloqués des comptes Auth déjà présents.

### Créer le premier administrateur

1. Dans **Authentication → Providers → Email**, garde la connexion par e-mail active. Dans les paramètres d'inscription d'Authentication, désactive l'inscription publique (*Allow new users to sign up*). Choisis un mot de passe fort, de 12 caractères minimum.
2. Dans **Authentication → Users → Add user → Create new user**, crée ton compte administrateur et confirme l'e-mail dans le tableau de bord. Copie l'**UUID** de cet utilisateur. Ne mets jamais son mot de passe dans un fichier ou dans le chat.
3. Dans **SQL Editor** du projet Royal, remplace l'UUID dans cette requête et exécute-la :

```sql
update public.profiles
set role = 'admin', is_blocked = false, updated_at = now()
where id = 'REMPLACER_PAR_UUID_DU_COMPTE'::uuid
returning id, email, role, is_blocked;
```

Vérifie que la requête renvoie **une seule ligne**, avec ton e-mail, `admin` et `false`. Si elle ne renvoie aucune ligne, vérifie l'UUID et l'application de la migration 003. Le site ne peut pas accorder le rôle admin lui-même.

### Activer la création de comptes

Déploie `supabase/functions/admin-create-user/index.ts` dans **Edge Functions** sous le nom exact `admin-create-user`. Désactive **Verify JWT** pour cette fonction : son code valide lui-même le jeton Supabase et le rôle admin en base. Le secret `SUPABASE_SERVICE_ROLE_KEY` doit rester dans les secrets du serveur Supabase, jamais dans React ni dans l'APK.

Tu peux aussi utiliser le CLI depuis le dossier `royal/predicteur_royal` après t'être connecté à Supabase :

```powershell
supabase link --project-ref ihlnhjistuvvbdnuvhcu
supabase db push
supabase functions deploy admin-create-user --no-verify-jwt
```

Si les migrations ont été appliquées dans SQL Editor, réconcilie l'historique avant `supabase db push` ; ne les rejoue pas à l'aveugle.

Connecte-toi ensuite dans l'APK Royal ou sur `http://localhost:5173/admin/`. Pour les utilisateurs ordinaires, le formulaire crée le compte, fixe les jours d'accès et le débloque. Les comptes administrateurs ne peuvent être créés ou modifiés que depuis le tableau de bord Supabase et le SQL Editor. Aucun identifiant n'est demandé sur le prédicteur public.

Le jeu enregistre automatiquement son appareil après la connexion, vérifie l'accès avant chaque action et à chaque retour au premier plan, puis contrôle la session régulièrement. La partie et le solde fictif restent sauvegardés sur le téléphone **par compte** ; une ancienne sauvegarde anonyme n'est pas transférée automatiquement à un compte. Les crédits et les résultats étant encore calculés localement, une application modifiée pourrait contourner ce contrôle. Des mises réelles demanderaient une logique de jeu et de paiement côté serveur.

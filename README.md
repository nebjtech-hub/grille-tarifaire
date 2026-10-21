# Grille tarifaire — Centre Diagnostic de Libreville

Application du call center : l'agent tape quelques lettres, les actes correspondants
s'affichent instantanément avec leurs tarifs assuré et non assuré.
Les administrateurs disposent d'un tableau de bord (KPI, exports Excel),
de la gestion de la grille et de la gestion des comptes.

Stack : React + Vite (frontend), Supabase (base, authentification, sécurité RLS), Netlify (hébergement).

## 1. Préparer Supabase

Dans le projet Supabase, ouvrez **SQL Editor** et exécutez les scripts du dossier
`supabase/` **dans l'ordre** :

| Script | Rôle |
|---|---|
| `01_schema.sql` | Tables, règles de sécurité (RLS), fonctions admin et KPI |
| `02_tarifs.sql` | Import des 216 actes (28 consultations, 188 imagerie) |
| `03_premier_admin.sql` | Premier compte administrateur — **modifiez l'e-mail et le mot de passe avant d'exécuter** |

Les trois scripts sont réexécutables sans créer de doublons.

Puis dans **Authentication → Sign In / Providers** : désactivez *Allow new users to sign up*.
Les comptes se créent uniquement depuis l'application (menu **Comptes**) ; personne ne peut
s'inscrire seul.

## 2. Lancer en local

```bash
cp .env.example .env
npm install
npm run dev
```

## 3. Publier sur GitHub

```bash
git push -u origin main
```

(Le dépôt est déjà initialisé avec `origin` = https://github.com/nebjtech-hub/grille-tarifaire.git)

## 4. Déployer sur Netlify

1. **Add new site → Import an existing project → GitHub**, choisissez `grille-tarifaire`.
2. Netlify lit `netlify.toml` : build `npm run build`, dossier `dist`, variables Supabase
   et redirection des routes déjà configurées. Cliquez **Deploy**.
3. Dans Supabase, **Authentication → URL Configuration** : renseignez l'URL Netlify
   dans *Site URL*.

La clé `sb_publishable_…` est conçue pour être visible côté navigateur : la protection
des données repose sur les règles RLS (un agent ne peut ni modifier un prix, ni voir
les KPI, ni lire les comptes des autres ; un compte désactivé n'accède plus à rien).
Ne mettez jamais la clé `service_role` / `sb_secret_…` dans ce projet.

## Fonctionnement

**Agents** : recherche tolérante aux accents, aux abréviations (`tdm`, `écho`, `rx`, `radio`)
et aux fautes de frappe ; navigation au clavier (↑ ↓ Entrée, Échap pour recommencer,
Ctrl K pour revenir au champ) ; filtres par catégorie ; bouton *Copier* pour transmettre
un tarif par SMS/WhatsApp ; raccourcis vers les actes les plus demandés du mois.

**Journal** : chaque tarif consulté et chaque recherche sans résultat sont enregistrés
(table `recherches`), ce qui alimente les KPI.

**Administrateurs** :
- *Tableau de bord* : tarifs communiqués, recherches sans résultat, taux d'aboutissement,
  agents actifs, activité par jour, heures d'affluence, top 10 des actes, répartition
  par catégorie, activité par agent, termes non trouvés (avec bouton *Ajouter* à la grille).
  Périodes : aujourd'hui, 7 jours, 30 jours, mois en cours ou dates libres.
  Exports Excel : indicateurs (6 feuilles) et journal détaillé ligne par ligne.
- *Grille* : ajout, modification, retrait/rétablissement d'actes, export Excel.
  Chaque changement de prix est historisé (table `historique_tarifs`).
- *Comptes* : création d'agents ou d'admins avec mot de passe provisoire,
  réinitialisation de mot de passe, désactivation.

Chacun peut changer son mot de passe en cliquant sur son nom en haut de l'écran.

## Ajouter une catégorie (ex. Laboratoire)

```sql
insert into public.categories (nom, ordre) values ('Laboratoire', 3);
```
Elle apparaît aussitôt dans les filtres et dans le formulaire d'ajout d'acte.

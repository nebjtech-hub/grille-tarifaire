-- =====================================================================
--  Grille tarifaire — Centre Diagnostic de Libreville
--  Script 1/3 : schéma, sécurité (RLS) et fonctions
--  À exécuter dans Supabase > SQL Editor, dans l'ordre 01 → 02 → 03.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Tables
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  id     smallint generated always as identity primary key,
  nom    text not null unique,
  ordre  smallint not null default 0
);

create table if not exists public.actes (
  id                bigint generated always as identity primary key,
  libelle           text not null,
  categorie_id      smallint not null references public.categories(id),
  tarif_assure      integer not null check (tarif_assure >= 0),
  tarif_non_assure  integer not null check (tarif_non_assure >= 0),
  actif             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  unique (categorie_id, libelle)
);

create table if not exists public.profils (
  id          uuid primary key references auth.users(id) on delete cascade,
  nom         text not null,
  email       text not null,
  role        text not null default 'agent' check (role in ('agent', 'admin')),
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Journal d'activité du call center : chaque tarif consulté (resultat = true)
-- et chaque recherche restée sans résultat (resultat = false).
create table if not exists public.recherches (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null default auth.uid() references public.profils(id) on delete cascade,
  terme       text,
  acte_id     bigint references public.actes(id) on delete set null,
  resultat    boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists recherches_created_at_idx on public.recherches (created_at);
create index if not exists recherches_agent_idx      on public.recherches (agent_id, created_at);
create index if not exists recherches_acte_idx       on public.recherches (acte_id);

-- Traçabilité des changements de prix
create table if not exists public.historique_tarifs (
  id                       bigint generated always as identity primary key,
  acte_id                  bigint not null references public.actes(id) on delete cascade,
  ancien_tarif_assure      integer,
  ancien_tarif_non_assure  integer,
  nouveau_tarif_assure     integer,
  nouveau_tarif_non_assure integer,
  modifie_par              uuid references auth.users(id) on delete set null,
  modifie_le               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Fonctions utilitaires de rôle
-- ---------------------------------------------------------------------

create or replace function public.est_actif()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profils where id = auth.uid() and actif);
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profils where id = auth.uid() and actif and role = 'admin');
$$;

-- ---------------------------------------------------------------------
--  Trigger : date de mise à jour + historique des prix
-- ---------------------------------------------------------------------

create or replace function public.actes_avant_maj()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.tarif_assure is distinct from old.tarif_assure
     or new.tarif_non_assure is distinct from old.tarif_non_assure then
    insert into public.historique_tarifs
      (acte_id, ancien_tarif_assure, ancien_tarif_non_assure,
       nouveau_tarif_assure, nouveau_tarif_non_assure, modifie_par)
    values
      (old.id, old.tarif_assure, old.tarif_non_assure,
       new.tarif_assure, new.tarif_non_assure, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists actes_avant_maj on public.actes;
create trigger actes_avant_maj before update on public.actes
  for each row execute function public.actes_avant_maj();

-- ---------------------------------------------------------------------
--  Sécurité : Row Level Security
-- ---------------------------------------------------------------------

alter table public.categories        enable row level security;
alter table public.actes             enable row level security;
alter table public.profils           enable row level security;
alter table public.recherches        enable row level security;
alter table public.historique_tarifs enable row level security;

drop policy if exists categories_lecture on public.categories;
create policy categories_lecture on public.categories
  for select to authenticated using (public.est_actif());
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

drop policy if exists actes_lecture on public.actes;
create policy actes_lecture on public.actes
  for select to authenticated using (public.est_actif());
drop policy if exists actes_admin on public.actes;
create policy actes_admin on public.actes
  for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- Les profils ne se modifient que via les fonctions admin_* ci-dessous.
drop policy if exists profils_lecture on public.profils;
create policy profils_lecture on public.profils
  for select to authenticated using (id = auth.uid() or public.est_admin());

drop policy if exists recherches_ajout on public.recherches;
create policy recherches_ajout on public.recherches
  for insert to authenticated with check (agent_id = auth.uid() and public.est_actif());
drop policy if exists recherches_lecture on public.recherches;
create policy recherches_lecture on public.recherches
  for select to authenticated using (agent_id = auth.uid() or public.est_admin());

drop policy if exists historique_lecture on public.historique_tarifs;
create policy historique_lecture on public.historique_tarifs
  for select to authenticated using (public.est_admin());

-- ---------------------------------------------------------------------
--  Gestion des comptes (aucune inscription publique n'est nécessaire)
-- ---------------------------------------------------------------------

-- Fonction interne : crée un compte Supabase Auth + son profil.
create or replace function public._creer_compte(
  p_id uuid, p_email text, p_mot_de_passe text, p_nom text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_mot_de_passe, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nom', p_nom), now(), now(), '', '', '', '');

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());

  insert into public.profils (id, nom, email, role) values (p_id, p_nom, p_email, p_role);
end $$;

create or replace function public.admin_creer_utilisateur(
  p_email text, p_mot_de_passe text, p_nom text, p_role text default 'agent')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  end if;
  if p_role not in ('agent', 'admin') then
    raise exception 'Rôle inconnu : %', p_role;
  end if;
  if coalesce(trim(p_nom), '') = '' then
    raise exception 'Indiquez le nom de la personne';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide';
  end if;
  if length(coalesce(p_mot_de_passe, '')) < 8 then
    raise exception 'Le mot de passe doit contenir au moins 8 caractères';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Un compte existe déjà avec cette adresse e-mail';
  end if;
  perform public._creer_compte(v_id, v_email, p_mot_de_passe, trim(p_nom), p_role);
  return v_id;
end $$;

create or replace function public.admin_modifier_utilisateur(
  p_id uuid, p_nom text, p_role text, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  end if;
  if p_id = auth.uid() and (p_role <> 'admin' or not p_actif) then
    raise exception 'Vous ne pouvez pas retirer vos propres droits administrateur';
  end if;
  if p_role not in ('agent', 'admin') then
    raise exception 'Rôle inconnu : %', p_role;
  end if;
  update public.profils
     set nom = trim(p_nom), role = p_role, actif = p_actif
   where id = p_id;
  -- Un compte désactivé ne peut plus se connecter.
  update auth.users
     set banned_until = case when p_actif then null else 'infinity'::timestamptz end,
         updated_at   = now()
   where id = p_id;
end $$;

create or replace function public.admin_definir_mot_de_passe(p_id uuid, p_mot_de_passe text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  end if;
  if length(coalesce(p_mot_de_passe, '')) < 8 then
    raise exception 'Le mot de passe doit contenir au moins 8 caractères';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_mot_de_passe, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_id;
end $$;

-- ---------------------------------------------------------------------
--  Actes les plus demandés (raccourcis sur l'écran agent)
-- ---------------------------------------------------------------------

create or replace function public.actes_populaires(p_limite int default 8)
returns table (acte_id bigint, nombre bigint)
language sql stable security definer set search_path = '' as $$
  select r.acte_id, count(*)
    from public.recherches r
    join public.actes a on a.id = r.acte_id
   where public.est_actif()
     and r.resultat and a.actif
     and r.created_at > now() - interval '30 days'
   group by r.acte_id
   order by count(*) desc
   limit least(greatest(p_limite, 1), 20);
$$;

-- ---------------------------------------------------------------------
--  KPI du tableau de bord (heure locale : Africa/Libreville)
-- ---------------------------------------------------------------------

create or replace function public.kpi_tableau_de_bord(p_debut timestamptz, p_fin timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs' using errcode = '42501';
  end if;

  with base as (
    select r.*, (r.created_at at time zone 'Africa/Libreville') as heure_locale
      from public.recherches r
     where r.created_at >= p_debut and r.created_at < p_fin
  )
  select jsonb_build_object(
    'consultations',   (select count(*) from base where resultat),
    'sans_resultat',   (select count(*) from base where not resultat),
    'agents_actifs',   (select count(distinct agent_id) from base),
    'actes_distincts', (select count(distinct acte_id) from base where resultat),

    'par_jour', coalesce((
      select jsonb_agg(jsonb_build_object('jour', jour, 'consultations', c, 'sans_resultat', s) order by jour)
        from (select heure_locale::date as jour,
                     count(*) filter (where resultat)     as c,
                     count(*) filter (where not resultat) as s
                from base group by 1) t), '[]'::jsonb),

    'par_heure', coalesce((
      select jsonb_agg(jsonb_build_object('heure', h, 'nombre', n) order by h)
        from (select extract(hour from heure_locale)::int as h, count(*) as n
                from base where resultat group by 1) t), '[]'::jsonb),

    'top_actes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'libelle', libelle, 'categorie', categorie,
               'tarif_assure', tarif_assure, 'tarif_non_assure', tarif_non_assure,
               'nombre', n) order by n desc, libelle)
        from (select a.id, a.libelle, c.nom as categorie, a.tarif_assure, a.tarif_non_assure,
                     count(*) as n
                from base b
                join public.actes a      on a.id = b.acte_id
                join public.categories c on c.id = a.categorie_id
               where b.resultat
               group by a.id, c.nom
               order by n desc, a.libelle
               limit 10) t), '[]'::jsonb),

    'par_categorie', coalesce((
      select jsonb_agg(jsonb_build_object('categorie', nom, 'nombre', n) order by n desc)
        from (select c.nom, count(*) as n
                from base b
                join public.actes a      on a.id = b.acte_id
                join public.categories c on c.id = a.categorie_id
               where b.resultat
               group by c.nom) t), '[]'::jsonb),

    'par_agent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom', nom, 'email', email, 'consultations', c,
               'sans_resultat', s, 'derniere_activite', d) order by c desc)
        from (select p.nom, p.email,
                     count(*) filter (where b.resultat)     as c,
                     count(*) filter (where not b.resultat) as s,
                     max(b.created_at) as d
                from base b join public.profils p on p.id = b.agent_id
               group by p.id) t), '[]'::jsonb),

    'termes_sans_resultat', coalesce((
      select jsonb_agg(jsonb_build_object('terme', terme, 'nombre', n, 'dernier', d) order by n desc, d desc)
        from (select lower(trim(terme)) as terme, count(*) as n, max(created_at) as d
                from base
               where not resultat and coalesce(trim(terme), '') <> ''
               group by 1
               order by n desc, d desc
               limit 25) t), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
--  Droits d'exécution
-- ---------------------------------------------------------------------

revoke execute on function public._creer_compte(uuid, text, text, text, text) from public, anon, authenticated;

revoke execute on function public.admin_creer_utilisateur(text, text, text, text)  from public, anon;
revoke execute on function public.admin_modifier_utilisateur(uuid, text, text, boolean) from public, anon;
revoke execute on function public.admin_definir_mot_de_passe(uuid, text)          from public, anon;
revoke execute on function public.kpi_tableau_de_bord(timestamptz, timestamptz)   from public, anon;
revoke execute on function public.actes_populaires(int)                           from public, anon;

grant execute on function public.admin_creer_utilisateur(text, text, text, text)  to authenticated;
grant execute on function public.admin_modifier_utilisateur(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_definir_mot_de_passe(uuid, text)          to authenticated;
grant execute on function public.kpi_tableau_de_bord(timestamptz, timestamptz)   to authenticated;
grant execute on function public.actes_populaires(int)                           to authenticated;

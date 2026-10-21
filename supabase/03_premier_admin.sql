-- =====================================================================
--  Script 3/3 : création du premier compte administrateur
--  Remplacez l'e-mail, le mot de passe et le nom AVANT d'exécuter.
--  Les comptes suivants (agents, autres admins) se créent depuis l'application.
-- =====================================================================

select public._creer_compte(
  gen_random_uuid(),
  'admin@centre-diagnostic.com',   -- e-mail de connexion
  'RemplacezCeMotDePasse!',        -- 8 caractères minimum
  'Administrateur',                -- nom affiché
  'admin'
);

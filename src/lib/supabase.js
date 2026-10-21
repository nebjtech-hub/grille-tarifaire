import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

if (!url || !key) {
  throw new Error('Configuration Supabase manquante : définissez VITE_SUPABASE_URL et VITE_SUPABASE_KEY.')
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true }
})

/** Récupère toutes les lignes d'une requête en contournant la limite de 1 000 lignes. */
export async function toutRecuperer(construireRequete, taillePage = 1000) {
  const lignes = []
  for (let debut = 0; ; debut += taillePage) {
    const { data, error } = await construireRequete().range(debut, debut + taillePage - 1)
    if (error) throw error
    lignes.push(...data)
    if (data.length < taillePage) return lignes
  }
}

/** Message d'erreur lisible à partir d'une erreur Supabase. */
export function messageErreur(err) {
  if (!err) return ''
  const m = err.message || String(err)
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.'
  if (/banned/i.test(m)) return 'Ce compte est désactivé. Contactez un administrateur.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion au serveur impossible. Vérifiez votre accès internet.'
  if (/duplicate key/i.test(m)) return 'Cet acte existe déjà dans cette catégorie.'
  return m
}

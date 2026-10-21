import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [alerte, setAlerte] = useState('')

  const chargerProfil = useCallback(async (s) => {
    if (!s) { setProfil(null); return }
    const { data, error } = await supabase
      .from('profils').select('id, nom, email, role, actif').eq('id', s.user.id).maybeSingle()
    if (error || !data) {
      setAlerte('Ce compte n’a pas accès à la grille tarifaire. Contactez un administrateur.')
      await supabase.auth.signOut()
      setProfil(null)
      return
    }
    if (!data.actif) {
      setAlerte('Ce compte est désactivé. Contactez un administrateur.')
      await supabase.auth.signOut()
      setProfil(null)
      return
    }
    setProfil(data)
  }, [])

  useEffect(() => {
    let actif = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!actif) return
      setSession(data.session)
      await chargerProfil(data.session)
      setChargement(false)
    })
    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement, s) => {
      setSession(s)
      if (evenement === 'SIGNED_IN' || evenement === 'SIGNED_OUT') {
        // Différé : évite un appel Supabase à l'intérieur du callback d'auth
        setTimeout(() => chargerProfil(s), 0)
      }
    })
    return () => { actif = false; abonnement.subscription.unsubscribe() }
  }, [chargerProfil])

  const deconnexion = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, profil, chargement, alerte, setAlerte, deconnexion, estAdmin: profil?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

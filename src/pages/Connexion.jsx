import { useState } from 'react'
import { supabase, messageErreur } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Connexion() {
  const { alerte, setAlerte } = useAuth()
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  const valider = async (e) => {
    e.preventDefault()
    setEnvoi(true); setErreur(''); setAlerte('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: mdp })
    if (error) setErreur(messageErreur(error))
    setEnvoi(false)
  }

  return (
    <div className="connexion">
      <div className="connexion__coeur" aria-hidden="true" />
      <form className="connexion__carte" onSubmit={valider}>
        <img src="/logo.png" alt="Centre Diagnostic" className="connexion__logo" />
        <h1>Grille tarifaire</h1>
        <p className="connexion__sous-titre">Espace call center</p>
        <label className="champ">Adresse e-mail
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="champ">Mot de passe
          <input type="password" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
        </label>
        {(erreur || alerte) && <p className="message message--erreur" role="alert">{erreur || alerte}</p>}
        <button className="bouton bouton--plein" disabled={envoi}>{envoi ? 'Connexion…' : 'Se connecter'}</button>
        <p className="connexion__aide">Mot de passe oublié ? Demandez à un administrateur de le réinitialiser.</p>
      </form>
    </div>
  )
}

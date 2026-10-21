import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, messageErreur } from '../lib/supabase'
import Dialogue from './Dialogue'

function ChangerMotDePasse({ onFermer }) {
  const [mdp, setMdp] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [etat, setEtat] = useState({ envoi: false, erreur: '', ok: false })

  const valider = async (e) => {
    e.preventDefault()
    if (mdp.length < 8) return setEtat({ erreur: 'Le mot de passe doit contenir au moins 8 caractères.' })
    if (mdp !== confirmation) return setEtat({ erreur: 'Les deux saisies ne correspondent pas.' })
    setEtat({ envoi: true })
    const { error } = await supabase.auth.updateUser({ password: mdp })
    setEtat(error ? { erreur: messageErreur(error) } : { ok: true })
  }

  if (etat.ok) return (
    <div className="pile">
      <p className="message message--succes">Mot de passe modifié.</p>
      <button className="bouton" onClick={onFermer}>Fermer</button>
    </div>
  )
  return (
    <form className="pile" onSubmit={valider}>
      <label className="champ">Nouveau mot de passe
        <input type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required />
      </label>
      <label className="champ">Confirmer le mot de passe
        <input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
      </label>
      {etat.erreur && <p className="message message--erreur" role="alert">{etat.erreur}</p>}
      <button className="bouton" disabled={etat.envoi}>{etat.envoi ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button>
    </form>
  )
}

export default function EnTete() {
  const { profil, estAdmin, deconnexion } = useAuth()
  const [compte, setCompte] = useState(false)

  return (
    <header className="entete">
      <NavLink to="/" className="entete__logo" aria-label="Accueil — recherche de tarifs">
        <img src="/logo.png" alt="Centre Diagnostic" />
      </NavLink>
      <nav className="entete__nav" aria-label="Navigation principale">
        <NavLink to="/" end>Tarifs</NavLink>
        {estAdmin && <>
          <NavLink to="/admin" end>Tableau de bord</NavLink>
          <NavLink to="/admin/tarifs">Grille</NavLink>
          <NavLink to="/admin/agents">Comptes</NavLink>
        </>}
      </nav>
      <div className="entete__compte">
        <button className="lien" onClick={() => setCompte(true)} title="Changer mon mot de passe">
          {profil?.nom}{estAdmin && <span className="pastille">Admin</span>}
        </button>
        <button className="bouton bouton--discret" onClick={deconnexion}>Se déconnecter</button>
      </div>
      <Dialogue ouvert={compte} onFermer={() => setCompte(false)} titre="Changer mon mot de passe">
        <ChangerMotDePasse onFermer={() => setCompte(false)} />
      </Dialogue>
    </header>
  )
}

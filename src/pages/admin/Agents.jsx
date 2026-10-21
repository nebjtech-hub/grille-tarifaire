import { useCallback, useEffect, useState } from 'react'
import { supabase, messageErreur } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { dateHeure } from '../../lib/format'
import Dialogue from '../../components/Dialogue'

const motDePasseAleatoire = () => {
  const car = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const valeurs = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(valeurs, (v) => car[v % car.length]).join('')
}

function FormulaireCompte({ compte, onTermine }) {
  const nouveau = !compte
  const [nom, setNom] = useState(compte?.nom || '')
  const [email, setEmail] = useState(compte?.email || '')
  const [role, setRole] = useState(compte?.role || 'agent')
  const [mdp, setMdp] = useState(nouveau ? motDePasseAleatoire() : '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [cree, setCree] = useState(null)

  const valider = async (e) => {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    const { error } = nouveau
      ? await supabase.rpc('admin_creer_utilisateur', { p_email: email, p_mot_de_passe: mdp, p_nom: nom, p_role: role })
      : await supabase.rpc('admin_modifier_utilisateur', { p_id: compte.id, p_nom: nom, p_role: role, p_actif: compte.actif })
    setEnvoi(false)
    if (error) return setErreur(messageErreur(error))
    if (nouveau) setCree({ email: email.trim().toLowerCase(), mdp })
    else onTermine(true)
  }

  if (cree) return (
    <div className="pile">
      <p className="message message--succes">Compte créé. Transmettez ces identifiants à la personne concernée :</p>
      <dl className="identifiants">
        <dt>E-mail</dt><dd>{cree.email}</dd>
        <dt>Mot de passe</dt><dd><code>{cree.mdp}</code></dd>
      </dl>
      <p className="aide">Elle pourra le changer en cliquant sur son nom, en haut de l’écran.</p>
      <button className="bouton" onClick={() => onTermine(true)}>Terminé</button>
    </div>
  )

  return (
    <form className="pile" onSubmit={valider}>
      <label className="champ">Nom complet
        <input value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
      </label>
      <label className="champ">Adresse e-mail de connexion
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!nouveau} />
      </label>
      <fieldset className="choix">
        <legend>Rôle</legend>
        <label><input type="radio" name="role" checked={role === 'agent'} onChange={() => setRole('agent')} /> Agent du call center <span className="aide">recherche les tarifs</span></label>
        <label><input type="radio" name="role" checked={role === 'admin'} onChange={() => setRole('admin')} /> Administrateur <span className="aide">tableau de bord, grille et comptes</span></label>
      </fieldset>
      {nouveau && (
        <label className="champ">Mot de passe provisoire
          <span className="champ__ligne">
            <input value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required />
            <button type="button" className="bouton bouton--discret" onClick={() => setMdp(motDePasseAleatoire())}>Générer</button>
          </span>
        </label>
      )}
      {erreur && <p className="message message--erreur" role="alert">{erreur}</p>}
      <button className="bouton bouton--plein" disabled={envoi}>
        {envoi ? 'Enregistrement…' : nouveau ? 'Créer le compte' : 'Enregistrer les modifications'}
      </button>
    </form>
  )
}

function ReinitialiserMotDePasse({ compte, onTermine }) {
  const [mdp, setMdp] = useState(motDePasseAleatoire())
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const [fait, setFait] = useState(false)

  const valider = async (e) => {
    e.preventDefault()
    setEnvoi(true); setErreur('')
    const { error } = await supabase.rpc('admin_definir_mot_de_passe', { p_id: compte.id, p_mot_de_passe: mdp })
    setEnvoi(false)
    if (error) setErreur(messageErreur(error)); else setFait(true)
  }

  if (fait) return (
    <div className="pile">
      <p className="message message--succes">Nouveau mot de passe de {compte.nom} :</p>
      <p><code className="code-grand">{mdp}</code></p>
      <button className="bouton" onClick={onTermine}>Terminé</button>
    </div>
  )
  return (
    <form className="pile" onSubmit={valider}>
      <label className="champ">Nouveau mot de passe pour {compte.nom}
        <span className="champ__ligne">
          <input value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required />
          <button type="button" className="bouton bouton--discret" onClick={() => setMdp(motDePasseAleatoire())}>Générer</button>
        </span>
      </label>
      {erreur && <p className="message message--erreur" role="alert">{erreur}</p>}
      <button className="bouton bouton--plein" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Définir le mot de passe'}</button>
    </form>
  )
}

export default function Agents() {
  const { profil } = useAuth()
  const [comptes, setComptes] = useState([])
  const [erreur, setErreur] = useState('')
  const [dialogue, setDialogue] = useState(null) // { type: 'creer' | 'modifier' | 'mdp', compte }

  const charger = useCallback(async () => {
    const { data, error } = await supabase.from('profils').select('*').order('actif', { ascending: false }).order('nom')
    if (error) setErreur(messageErreur(error)); else setComptes(data)
  }, [])

  useEffect(() => { charger() }, [charger])

  const basculer = async (c) => {
    if (c.actif && !confirm(`Désactiver le compte de ${c.nom} ? La personne ne pourra plus se connecter.`)) return
    const { error } = await supabase.rpc('admin_modifier_utilisateur', { p_id: c.id, p_nom: c.nom, p_role: c.role, p_actif: !c.actif })
    if (error) setErreur(messageErreur(error)); else charger()
  }

  const fermer = (rafraichir) => { setDialogue(null); if (rafraichir) charger() }
  const titres = { creer: 'Nouveau compte', modifier: 'Modifier le compte', mdp: 'Réinitialiser le mot de passe' }

  return (
    <div className="admin">
      <div className="admin__entete">
        <div>
          <h1>Comptes</h1>
          <p className="admin__periode">{comptes.filter((c) => c.actif).length} comptes actifs</p>
        </div>
        <button className="bouton bouton--plein" onClick={() => setDialogue({ type: 'creer' })}>Créer un compte</button>
      </div>

      {erreur && <p className="message message--erreur" role="alert">{erreur}</p>}

      <div className="panneau tableau-defilant">
        <table className="tableau">
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th><span className="visuellement-cache">Actions</span></th></tr></thead>
          <tbody>
            {comptes.map((c) => (
              <tr key={c.id} className={c.actif ? '' : 'ligne--inactive'}>
                <td>{c.nom}{c.id === profil.id && <span className="pastille pastille--claire">vous</span>}</td>
                <td>{c.email}</td>
                <td>{c.role === 'admin' ? 'Administrateur' : 'Agent'}</td>
                <td><span className={`statut statut--${c.actif ? 'actif' : 'inactif'}`}>{c.actif ? 'Actif' : 'Désactivé'}</span></td>
                <td>{dateHeure(c.created_at)}</td>
                <td className="tableau__actions">
                  <button className="lien" onClick={() => setDialogue({ type: 'modifier', compte: c })}>Modifier</button>
                  <button className="lien" onClick={() => setDialogue({ type: 'mdp', compte: c })}>Mot de passe</button>
                  {c.id !== profil.id && (
                    <button className="lien" onClick={() => basculer(c)}>{c.actif ? 'Désactiver' : 'Réactiver'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialogue ouvert={!!dialogue} onFermer={() => fermer(dialogue?.type === 'creer')} titre={dialogue ? titres[dialogue.type] : ''}>
        {dialogue?.type === 'mdp'
          ? <ReinitialiserMotDePasse compte={dialogue.compte} onTermine={() => fermer(false)} />
          : <FormulaireCompte key={dialogue?.compte?.id || 'nouveau'} compte={dialogue?.compte} onTermine={fermer} />}
      </Dialogue>
    </div>
  )
}

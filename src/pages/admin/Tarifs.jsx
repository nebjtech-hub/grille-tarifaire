import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, toutRecuperer, messageErreur } from '../../lib/supabase'
import { indexer, rechercher } from '../../lib/search'
import { exporterGrille } from '../../lib/export'
import { dateHeure, fcfa } from '../../lib/format'
import Dialogue from '../../components/Dialogue'

function Historique({ acteId }) {
  const [lignes, setLignes] = useState(null)
  useEffect(() => {
    supabase.from('historique_tarifs').select('*').eq('acte_id', acteId).order('modifie_le', { ascending: false }).limit(5)
      .then(({ data }) => setLignes(data || []))
  }, [acteId])
  if (!lignes?.length) return null
  return (
    <div className="historique">
      <h3>Derniers changements de prix</h3>
      <ul>
        {lignes.map((l) => (
          <li key={l.id}>
            <span>{dateHeure(l.modifie_le)}</span>
            <span>{fcfa(l.ancien_tarif_assure)} / {fcfa(l.ancien_tarif_non_assure)} devient {fcfa(l.nouveau_tarif_assure)} / {fcfa(l.nouveau_tarif_non_assure)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FormulaireActe({ acte, categories, libelleInitial, onTermine }) {
  const nouveau = !acte?.id
  const [libelle, setLibelle] = useState(acte?.libelle || libelleInitial || '')
  const [categorieId, setCategorieId] = useState(acte?.categorie_id || categories[0]?.id || '')
  const [assure, setAssure] = useState(acte?.tarif_assure ?? '')
  const [nonAssure, setNonAssure] = useState(acte?.tarif_non_assure ?? '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')

  const entier = (v) => Number(String(v).replace(/[\s\u00a0\u202f]/g, ''))

  const valider = async (e) => {
    e.preventDefault()
    const a = entier(assure), na = entier(nonAssure)
    if (!Number.isInteger(a) || a < 0 || !Number.isInteger(na) || na < 0) {
      return setErreur('Les tarifs doivent être des montants entiers en FCFA.')
    }
    setEnvoi(true); setErreur('')
    const ligne = {
      libelle: libelle.replace(/\s+/g, ' ').trim(),
      categorie_id: Number(categorieId),
      tarif_assure: a,
      tarif_non_assure: na
    }
    const { error } = nouveau
      ? await supabase.from('actes').insert(ligne)
      : await supabase.from('actes').update(ligne).eq('id', acte.id)
    setEnvoi(false)
    if (error) setErreur(messageErreur(error)); else onTermine(true)
  }

  return (
    <form className="pile" onSubmit={valider}>
      <label className="champ">Libellé de l’acte
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required autoFocus />
      </label>
      <label className="champ">Catégorie
        <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)} required>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </label>
      <div className="deux-colonnes">
        <label className="champ champ--assure">Tarif assuré (FCFA)
          <input inputMode="numeric" value={assure} onChange={(e) => setAssure(e.target.value)} required />
        </label>
        <label className="champ champ--non-assure">Tarif non assuré (FCFA)
          <input inputMode="numeric" value={nonAssure} onChange={(e) => setNonAssure(e.target.value)} required />
        </label>
      </div>
      {erreur && <p className="message message--erreur" role="alert">{erreur}</p>}
      <button className="bouton bouton--plein" disabled={envoi}>
        {envoi ? 'Enregistrement…' : nouveau ? 'Ajouter l’acte' : 'Enregistrer les modifications'}
      </button>
      {!nouveau && <Historique acteId={acte.id} />}
    </form>
  )
}

export default function Tarifs() {
  const [params, setParams] = useSearchParams()
  const [actes, setActes] = useState([])
  const [categories, setCategories] = useState([])
  const [filtre, setFiltre] = useState('')
  const [categorieId, setCategorieId] = useState(null)
  const [voirRetires, setVoirRetires] = useState(false)
  const [erreur, setErreur] = useState('')
  const [edition, setEdition] = useState(null)
  const [exportEnCours, setExportEnCours] = useState(false)

  const charger = useCallback(async () => {
    try {
      const [donnees, cats] = await Promise.all([
        toutRecuperer(() => supabase.from('actes').select('*, categories(nom)').order('libelle')),
        supabase.from('categories').select('*').order('ordre')
      ])
      if (cats.error) throw cats.error
      setActes(indexer(donnees.map((a) => ({ ...a, categorie: a.categories?.nom }))))
      setCategories(cats.data)
    } catch (e) { setErreur(messageErreur(e)) }
  }, [])

  useEffect(() => { charger() }, [charger])

  // Lien « Ajouter » depuis les recherches sans résultat du tableau de bord
  useEffect(() => {
    const terme = params.get('ajouter')
    if (terme && categories.length) {
      setEdition({ acte: null, libelleInitial: terme.charAt(0).toUpperCase() + terme.slice(1) })
      setParams({}, { replace: true })
    }
  }, [params, categories, setParams])

  const visibles = useMemo(() => {
    const base = actes.filter((a) => voirRetires || a.actif)
    if (filtre.trim()) return rechercher(base, filtre, { categorieId, limite: 500 }).map((r) => r.acte)
    return base.filter((a) => !categorieId || a.categorie_id === categorieId)
  }, [actes, filtre, categorieId, voirRetires])

  const basculer = async (a) => {
    if (a.actif && !confirm(`Retirer « ${a.libelle} » de la grille ? Les agents ne le verront plus.`)) return
    const { error } = await supabase.from('actes').update({ actif: !a.actif }).eq('id', a.id)
    if (error) setErreur(messageErreur(error)); else charger()
  }

  const exporter = async () => {
    setExportEnCours(true)
    try { await exporterGrille(actes.filter((a) => voirRetires || a.actif)) } catch (e) { setErreur(messageErreur(e)) }
    setExportEnCours(false)
  }

  const fermer = (rafraichir) => { setEdition(null); if (rafraichir) charger() }

  return (
    <div className="admin">
      <div className="admin__entete">
        <div>
          <h1>Grille tarifaire</h1>
          <p className="admin__periode">{actes.filter((a) => a.actif).length} actes proposés aux agents</p>
        </div>
        <div className="admin__actions">
          <button className="bouton" onClick={exporter} disabled={exportEnCours || !actes.length}>
            {exportEnCours ? 'Préparation…' : 'Exporter la grille (Excel)'}
          </button>
          <button className="bouton bouton--plein" onClick={() => setEdition({ acte: null })}>Ajouter un acte</button>
        </div>
      </div>

      <div className="barre-outils">
        <input type="search" className="barre-outils__recherche" placeholder="Filtrer les actes…" value={filtre}
          onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer les actes" />
        <div className="filtres" role="group" aria-label="Catégorie">
          <button className={`filtre${categorieId === null ? ' filtre--actif' : ''}`} aria-pressed={categorieId === null} onClick={() => setCategorieId(null)}>Toutes</button>
          {categories.map((c) => (
            <button key={c.id} className={`filtre${categorieId === c.id ? ' filtre--actif' : ''}`} aria-pressed={categorieId === c.id} onClick={() => setCategorieId(c.id)}>{c.nom}</button>
          ))}
        </div>
        <label className="case"><input type="checkbox" checked={voirRetires} onChange={(e) => setVoirRetires(e.target.checked)} /> Afficher les actes retirés</label>
      </div>

      {erreur && <p className="message message--erreur" role="alert">{erreur}</p>}

      <div className="panneau tableau-defilant">
        <table className="tableau">
          <thead>
            <tr>
              <th>Acte</th><th>Catégorie</th>
              <th className="nombre th--assure">Assuré</th><th className="nombre th--non-assure">Non assuré</th>
              <th><span className="visuellement-cache">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((a) => (
              <tr key={a.id} className={a.actif ? '' : 'ligne--inactive'}>
                <td>{a.libelle}{!a.actif && <span className="pastille pastille--claire">retiré</span>}</td>
                <td>{a.categorie}</td>
                <td className="nombre">{fcfa(a.tarif_assure)}</td>
                <td className="nombre">{fcfa(a.tarif_non_assure)}</td>
                <td className="tableau__actions">
                  <button className="lien" onClick={() => setEdition({ acte: a })}>Modifier</button>
                  <button className="lien" onClick={() => basculer(a)}>{a.actif ? 'Retirer' : 'Rétablir'}</button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={5} className="tableau__vide">Aucun acte ne correspond. Vérifiez l’orthographe ou ajoutez l’acte à la grille.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialogue ouvert={!!edition} onFermer={() => fermer(false)} titre={edition?.acte ? 'Modifier l’acte' : 'Ajouter un acte'}>
        {edition && (
          <FormulaireActe key={edition.acte?.id || 'nouveau'} acte={edition.acte} categories={categories}
            libelleInitial={edition.libelleInitial} onTermine={fermer} />
        )}
      </Dialogue>
    </div>
  )
}

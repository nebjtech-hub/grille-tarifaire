import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, toutRecuperer, messageErreur } from '../lib/supabase'
import { indexer, rechercher, segments, normaliser } from '../lib/search'
import { fcfa, montant } from '../lib/format'

const RAFRAICHIR_APRES_MS = 5 * 60 * 1000
const DELAI_SANS_RESULTAT_MS = 1500
const CLE_HISTORIQUE = 'cdl-historique'

function journaliser(entree) {
  // Sans attente : l'agent ne doit jamais patienter à cause du journal.
  supabase.from('recherches').insert(entree).then(({ error }) => {
    if (error) console.warn('Journal non enregistré :', error.message)
  })
}

function Libelle({ texte, zones }) {
  return segments(texte, zones).map((s, i) => (s.marque ? <mark key={i}>{s.texte}</mark> : <span key={i}>{s.texte}</span>))
}

function CartePrix({ acte, onFermer }) {
  const [copie, setCopie] = useState(false)
  const identiques = acte.tarif_assure === acte.tarif_non_assure
  const ecart = Math.abs(acte.tarif_non_assure - acte.tarif_assure)

  const copier = async () => {
    const texte = identiques
      ? `${acte.libelle} : ${fcfa(acte.tarif_assure)}`
      : `${acte.libelle} : ${fcfa(acte.tarif_assure)} (assuré), ${fcfa(acte.tarif_non_assure)} (non assuré)`
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 1800)
    } catch { /* presse-papiers indisponible */ }
  }

  return (
    <section className="carte-prix" aria-live="polite" aria-labelledby="acte-choisi">
      <div className="carte-prix__haut">
        <div>
          <p className="carte-prix__categorie">{acte.categorie}</p>
          <h2 id="acte-choisi" className="carte-prix__libelle">{acte.libelle}</h2>
        </div>
        <div className="carte-prix__actions">
          <button className="bouton bouton--discret" onClick={copier}>{copie ? 'Copié' : 'Copier'}</button>
          <button className="bouton-icone" onClick={onFermer} aria-label="Fermer la fiche">×</button>
        </div>
      </div>
      <div className="carte-prix__tarifs">
        <div className="tarif tarif--assure">
          <span className="tarif__type">Patient assuré</span>
          <span className="tarif__montant">{montant(acte.tarif_assure)}<small>FCFA</small></span>
        </div>
        <div className="tarif tarif--non-assure">
          <span className="tarif__type">Patient non assuré</span>
          <span className="tarif__montant">{montant(acte.tarif_non_assure)}<small>FCFA</small></span>
        </div>
      </div>
      <p className="carte-prix__note">
        {identiques ? 'Même tarif que le patient soit assuré ou non.' : `Écart de ${fcfa(ecart)} entre les deux tarifs.`}
      </p>
    </section>
  )
}

export default function Recherche() {
  const [actes, setActes] = useState([])
  const [categories, setCategories] = useState([])
  const [populaires, setPopulaires] = useState([])
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)

  const [requete, setRequete] = useState('')
  const [categorieId, setCategorieId] = useState(null)
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const [choisi, setChoisi] = useState(null)
  const [historique, setHistorique] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(CLE_HISTORIQUE)) || [] } catch { return [] }
  })

  const champ = useRef(null)
  const liste = useRef(null)
  const dernierChargement = useRef(0)
  const termesSignales = useRef(new Set())

  const charger = useCallback(async () => {
    try {
      const [donnees, cats, pop] = await Promise.all([
        toutRecuperer(() => supabase
          .from('actes')
          .select('id, libelle, tarif_assure, tarif_non_assure, categorie_id, categories(nom)')
          .eq('actif', true)
          .order('id')),
        supabase.from('categories').select('id, nom, ordre').order('ordre'),
        supabase.rpc('actes_populaires', { p_limite: 8 })
      ])
      if (cats.error) throw cats.error
      setActes(indexer(donnees.map((a) => ({ ...a, categorie: a.categories?.nom }))))
      setCategories(cats.data)
      setPopulaires(pop.data || [])
      dernierChargement.current = Date.now()
      setErreur('')
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => { charger() }, [charger])

  // Curseur prêt dans le champ dès que la grille est chargée
  useEffect(() => { if (!chargement) champ.current?.focus() }, [chargement])

  // Tarifs toujours à jour : rechargement au retour sur l'onglet
  useEffect(() => {
    const surVisibilite = () => {
      if (document.visibilityState === 'visible' && Date.now() - dernierChargement.current > RAFRAICHIR_APRES_MS) charger()
    }
    document.addEventListener('visibilitychange', surVisibilite)
    return () => document.removeEventListener('visibilitychange', surVisibilite)
  }, [charger])

  // Raccourcis : Ctrl+K ou « / » pour revenir à la recherche
  useEffect(() => {
    const surTouche = (e) => {
      const dansChamp = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !dansChamp)) {
        e.preventDefault()
        champ.current?.focus()
        champ.current?.select()
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [])

  const parId = useMemo(() => new Map(actes.map((a) => [a.id, a])), [actes])

  const suggestions = useMemo(() => {
    if (requete.trim()) return rechercher(actes, requete, { categorieId, limite: 12 })
    if (categorieId) {
      return actes
        .filter((a) => a.categorie_id === categorieId)
        .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
        .map((acte) => ({ acte, surlignage: [] }))
    }
    return []
  }, [actes, requete, categorieId])

  useEffect(() => { setActif(0) }, [requete, categorieId])

  // Recherche sans résultat : signalée une fois l'agent arrêté de taper
  useEffect(() => {
    const terme = requete.trim()
    if (chargement || suggestions.length || normaliser(terme).replace(/\s/g, '').length < 3) return
    const t = setTimeout(() => {
      const cle = normaliser(terme).trim()
      if (termesSignales.current.has(cle)) return
      termesSignales.current.add(cle)
      journaliser({ terme, resultat: false })
    }, DELAI_SANS_RESULTAT_MS)
    return () => clearTimeout(t)
  }, [requete, suggestions.length, chargement])

  // Garder l'élément actif visible dans la liste
  useEffect(() => {
    liste.current?.querySelector(`[data-index="${actif}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [actif])

  const choisir = (acte) => {
    setChoisi(acte)
    setOuvert(false)
    journaliser({ terme: requete.trim() || null, acte_id: acte.id, resultat: true })
    setHistorique((h) => {
      const suivant = [acte.id, ...h.filter((id) => id !== acte.id)].slice(0, 8)
      try { sessionStorage.setItem(CLE_HISTORIQUE, JSON.stringify(suivant)) } catch { /* ignoré */ }
      return suivant
    })
  }

  const surTouche = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOuvert(true)
      setActif((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setActif((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (ouvert && suggestions[actif]) { e.preventDefault(); choisir(suggestions[actif].acte) }
    } else if (e.key === 'Escape') {
      if (ouvert && suggestions.length) setOuvert(false)
      else { setRequete(''); setChoisi(null) }
    }
  }

  const nouvelleRecherche = () => {
    setRequete(''); setChoisi(null); setOuvert(false)
    champ.current?.focus()
  }

  const listeOuverte = ouvert && (suggestions.length > 0 || requete.trim().length > 0)
  const actesHistorique = historique.map((id) => parId.get(id)).filter(Boolean)
  const actesPopulaires = populaires.map((p) => parId.get(p.acte_id)).filter(Boolean)

  return (
    <div className="recherche">
      <div className="recherche__zone">
        <h1 className="recherche__titre">Quel acte le patient demande-t-il ?</h1>

        <div className="combobox">
          <svg className="combobox__loupe" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            ref={champ}
            className="combobox__champ"
            type="search"
            role="combobox"
            aria-expanded={listeOuverte}
            aria-controls="suggestions"
            aria-autocomplete="list"
            aria-activedescendant={listeOuverte && suggestions[actif] ? `suggestion-${actif}` : undefined}
            aria-label="Rechercher un acte"
            placeholder={chargement ? 'Chargement de la grille…' : 'Ex. : écho abdominale, scanner cérébral, dentiste'}
            value={requete}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setRequete(e.target.value); setOuvert(true) }}
            onFocus={() => setOuvert(true)}
            onBlur={() => setTimeout(() => setOuvert(false), 120)}
            onKeyDown={surTouche}
          />
          <kbd className="combobox__raccourci" aria-hidden="true">Ctrl K</kbd>

          {listeOuverte && (
            <ul id="suggestions" ref={liste} className="combobox__liste" role="listbox" aria-label="Actes proposés">
              {suggestions.length === 0 && (
                <li className="combobox__vide">
                  Aucun acte ne correspond à « {requete.trim()} ».
                  <span>Essayez un autre mot (ex. « radio » au lieu de « RX ») ou retirez le filtre de catégorie.</span>
                </li>
              )}
              {suggestions.map(({ acte, surlignage }, i) => (
                <li
                  key={acte.id}
                  id={`suggestion-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === actif}
                  className={`suggestion${i === actif ? ' suggestion--active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); choisir(acte) }}
                  onMouseEnter={() => setActif(i)}
                >
                  <span className="suggestion__libelle"><Libelle texte={acte.libelle} zones={surlignage} /></span>
                  <span className="suggestion__prix">
                    {acte.tarif_assure === acte.tarif_non_assure
                      ? fcfa(acte.tarif_assure)
                      : <>{montant(acte.tarif_assure)} <i>/</i> {fcfa(acte.tarif_non_assure)}</>}
                  </span>
                  <span className="suggestion__categorie">{acte.categorie}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="filtres" role="group" aria-label="Filtrer par catégorie">
          <button className={`filtre${categorieId === null ? ' filtre--actif' : ''}`} aria-pressed={categorieId === null}
            onClick={() => { setCategorieId(null); champ.current?.focus() }}>Toutes</button>
          {categories.map((c) => (
            <button key={c.id} className={`filtre${categorieId === c.id ? ' filtre--actif' : ''}`} aria-pressed={categorieId === c.id}
              onClick={() => { setCategorieId(c.id); setOuvert(true); champ.current?.focus() }}>
              {c.nom}
            </button>
          ))}
        </div>

        {erreur && (
          <p className="message message--erreur" role="alert">
            {erreur} <button className="lien" onClick={charger}>Réessayer</button>
          </p>
        )}
      </div>

      {choisi && (
        <>
          <CartePrix acte={choisi} onFermer={nouvelleRecherche} />
          <div className="recherche__suite">
            <button className="bouton" onClick={nouvelleRecherche}>Nouvelle recherche</button>
            <span className="aide">ou appuyez sur Échap</span>
          </div>
        </>
      )}

      {!choisi && (actesHistorique.length > 0 || actesPopulaires.length > 0) && (
        <div className="raccourcis">
          {actesHistorique.length > 0 && (
            <section>
              <h2>Consultés pendant votre session</h2>
              <ul className="puces">
                {actesHistorique.map((a) => <li key={a.id}><button onClick={() => choisir(a)}>{a.libelle}</button></li>)}
              </ul>
            </section>
          )}
          {actesPopulaires.length > 0 && (
            <section>
              <h2>Les plus demandés ce mois-ci</h2>
              <ul className="puces">
                {actesPopulaires.map((a) => <li key={a.id}><button onClick={() => choisir(a)}>{a.libelle}</button></li>)}
              </ul>
            </section>
          )}
        </div>
      )}

      {!choisi && !chargement && actes.length > 0 && (
        <p className="recherche__compte">{actes.length} actes dans la grille. Tapez quelques lettres, les propositions s’affichent aussitôt.</p>
      )}
    </div>
  )
}

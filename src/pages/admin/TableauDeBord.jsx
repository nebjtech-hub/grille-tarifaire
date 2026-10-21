import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, toutRecuperer, messageErreur } from '../../lib/supabase'
import { exporterJournal, exporterTableauDeBord } from '../../lib/export'
import { dateHeure, fcfa, nombre, pourcentage } from '../../lib/format'

const FUSEAU = 'Africa/Libreville' // UTC+1 toute l'année
const jourLocal = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: FUSEAU })
const decaler = (iso, jours) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + jours)
  return d.toISOString().slice(0, 10)
}
const debutJour = (iso) => `${iso}T00:00:00+01:00`
const jourCourt = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const PERIODES = [
  { cle: 'jour', nom: 'Aujourd’hui' },
  { cle: '7j', nom: '7 derniers jours' },
  { cle: '30j', nom: '30 derniers jours' },
  { cle: 'mois', nom: 'Ce mois-ci' },
  { cle: 'perso', nom: 'Personnalisée' }
]

function bornes(cle, du, au) {
  const aujourdhui = jourLocal()
  switch (cle) {
    case 'jour': return { du: aujourdhui, au: aujourdhui }
    case '7j': return { du: decaler(aujourdhui, -6), au: aujourdhui }
    case '30j': return { du: decaler(aujourdhui, -29), au: aujourdhui }
    case 'mois': return { du: `${aujourdhui.slice(0, 8)}01`, au: aujourdhui }
    default: return { du, au }
  }
}

function Indicateur({ valeur, libelle, detail, ton }) {
  return (
    <div className={`indicateur${ton ? ` indicateur--${ton}` : ''}`}>
      <span className="indicateur__valeur">{valeur}</span>
      <span className="indicateur__libelle">{libelle}</span>
      {detail && <span className="indicateur__detail">{detail}</span>}
    </div>
  )
}

function ActiviteParJour({ donnees, du, au }) {
  const jours = useMemo(() => {
    const parJour = new Map(donnees.map((d) => [d.jour, d]))
    const liste = []
    for (let j = du; j <= au && liste.length < 93; j = decaler(j, 1)) {
      liste.push(parJour.get(j) || { jour: j, consultations: 0, sans_resultat: 0 })
    }
    return liste
  }, [donnees, du, au])
  const max = Math.max(1, ...jours.map((j) => j.consultations + j.sans_resultat))
  const pas = Math.ceil(jours.length / 10)

  return (
    <div className="histogramme" role="img" aria-label="Recherches par jour">
      {jours.map((j, i) => (
        <div key={j.jour} className="histogramme__colonne" title={`${jourCourt(j.jour)} : ${j.consultations} tarif(s) communiqué(s), ${j.sans_resultat} sans résultat`}>
          <div className="histogramme__pile">
            <span className="barre barre--gris" style={{ height: `${(j.sans_resultat / max) * 100}%` }} />
            <span className="barre barre--vert" style={{ height: `${(j.consultations / max) * 100}%` }} />
          </div>
          <span className="histogramme__etiquette">{i % pas === 0 ? jourCourt(j.jour) : ''}</span>
        </div>
      ))}
    </div>
  )
}

function HeuresAffluence({ donnees }) {
  const parHeure = new Map(donnees.map((d) => [d.heure, d.nombre]))
  const heures = Array.from({ length: 24 }, (_, h) => ({ h, n: parHeure.get(h) || 0 }))
  const max = Math.max(1, ...heures.map((x) => x.n))
  return (
    <div className="histogramme histogramme--heures" role="img" aria-label="Tarifs communiqués par heure">
      {heures.map(({ h, n }) => (
        <div key={h} className="histogramme__colonne" title={`${h}h : ${n}`}>
          <div className="histogramme__pile">
            <span className="barre barre--ciel" style={{ height: `${(n / max) * 100}%` }} />
          </div>
          <span className="histogramme__etiquette">{h % 3 === 0 ? `${h}h` : ''}</span>
        </div>
      ))}
    </div>
  )
}

export default function TableauDeBord() {
  const [periode, setPeriode] = useState('7j')
  const [perso, setPerso] = useState({ du: decaler(jourLocal(), -6), au: jourLocal() })
  const [kpi, setKpi] = useState(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [exportEnCours, setExportEnCours] = useState('')

  const { du, au } = bornes(periode, perso.du, perso.au)
  const plageValide = du && au && du <= au
  const libellePeriode = du === au
    ? `le ${new Date(`${du}T12:00:00Z`).toLocaleDateString('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })}`
    : `du ${jourCourt(du)} au ${jourCourt(au)} ${au.slice(0, 4)}`

  const charger = useCallback(async () => {
    if (!plageValide) return
    setChargement(true); setErreur('')
    const { data, error } = await supabase.rpc('kpi_tableau_de_bord', {
      p_debut: debutJour(du), p_fin: debutJour(decaler(au, 1))
    })
    if (error) setErreur(messageErreur(error))
    else setKpi(data)
    setChargement(false)
  }, [du, au, plageValide])

  useEffect(() => { charger() }, [charger])

  const exporterSynthese = async () => {
    setExportEnCours('synthese')
    try { await exporterTableauDeBord(kpi, libellePeriode) } catch (e) { setErreur(messageErreur(e)) }
    setExportEnCours('')
  }

  const exporterDetail = async () => {
    setExportEnCours('journal')
    try {
      const lignes = await toutRecuperer(() => supabase
        .from('recherches')
        .select('created_at, terme, resultat, profils(nom), actes(libelle, tarif_assure, tarif_non_assure, categories(nom))')
        .gte('created_at', debutJour(du))
        .lt('created_at', debutJour(decaler(au, 1)))
        .order('created_at', { ascending: false }))
      await exporterJournal(lignes, libellePeriode)
    } catch (e) { setErreur(messageErreur(e)) }
    setExportEnCours('')
  }

  const total = kpi ? kpi.consultations + kpi.sans_resultat : 0
  const maxTop = kpi?.top_actes?.[0]?.nombre || 1

  return (
    <div className="admin">
      <div className="admin__entete">
        <div>
          <h1>Tableau de bord</h1>
          <p className="admin__periode">Activité du call center {libellePeriode}</p>
        </div>
        <div className="admin__actions">
          <button className="bouton" onClick={exporterSynthese} disabled={!kpi || !!exportEnCours}>
            {exportEnCours === 'synthese' ? 'Préparation…' : 'Exporter les indicateurs'}
          </button>
          <button className="bouton bouton--discret" onClick={exporterDetail} disabled={!plageValide || !!exportEnCours}>
            {exportEnCours === 'journal' ? 'Préparation…' : 'Exporter le journal détaillé'}
          </button>
        </div>
      </div>

      <div className="periodes" role="group" aria-label="Période">
        {PERIODES.map((p) => (
          <button key={p.cle} className={`filtre${periode === p.cle ? ' filtre--actif' : ''}`} aria-pressed={periode === p.cle} onClick={() => setPeriode(p.cle)}>
            {p.nom}
          </button>
        ))}
        {periode === 'perso' && (
          <span className="periodes__dates">
            <label>Du <input type="date" value={perso.du} max={perso.au} onChange={(e) => setPerso((x) => ({ ...x, du: e.target.value }))} /></label>
            <label>au <input type="date" value={perso.au} min={perso.du} onChange={(e) => setPerso((x) => ({ ...x, au: e.target.value }))} /></label>
          </span>
        )}
      </div>

      {erreur && <p className="message message--erreur" role="alert">{erreur}</p>}
      {chargement && !kpi && <p className="aide">Calcul des indicateurs…</p>}

      {kpi && (
        <div className={chargement ? 'admin__grille admin__grille--attente' : 'admin__grille'}>
          <div className="indicateurs">
            <Indicateur valeur={nombre(kpi.consultations)} libelle="Tarifs communiqués" ton="vert" />
            <Indicateur valeur={nombre(kpi.sans_resultat)} libelle="Recherches sans résultat"
              detail={total ? `${pourcentage(kpi.sans_resultat, total)} % des recherches` : null} ton="gris" />
            <Indicateur valeur={total ? `${pourcentage(kpi.consultations, total)} %` : '—'} libelle="Recherches abouties" ton="ciel" />
            <Indicateur valeur={nombre(kpi.agents_actifs)} libelle="Agents actifs" />
            <Indicateur valeur={nombre(kpi.actes_distincts)} libelle="Actes différents demandés" />
          </div>

          <section className="panneau panneau--large">
            <h2>Recherches par jour</h2>
            <p className="legende"><span className="legende__pastille barre--vert" /> Tarif communiqué <span className="legende__pastille barre--gris" /> Sans résultat</p>
            <ActiviteParJour donnees={kpi.par_jour} du={du} au={au} />
          </section>

          <section className="panneau">
            <h2>Heures d’affluence</h2>
            <p className="legende">Tarifs communiqués selon l’heure de l’appel</p>
            <HeuresAffluence donnees={kpi.par_heure} />
          </section>

          <section className="panneau">
            <h2>Répartition par catégorie</h2>
            {kpi.par_categorie.length === 0 ? <p className="aide">Aucune activité sur la période.</p> : (
              <ul className="repartition">
                {kpi.par_categorie.map((c) => (
                  <li key={c.categorie}>
                    <span>{c.categorie}</span>
                    <span className="repartition__barre"><span style={{ width: `${pourcentage(c.nombre, kpi.consultations)}%` }} /></span>
                    <strong>{pourcentage(c.nombre, kpi.consultations)} %</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panneau panneau--large">
            <h2>Actes les plus demandés</h2>
            {kpi.top_actes.length === 0 ? <p className="aide">Aucun tarif communiqué sur la période.</p> : (
              <ol className="classement">
                {kpi.top_actes.map((a) => (
                  <li key={a.id}>
                    <div className="classement__texte">
                      <span className="classement__libelle">{a.libelle}</span>
                      <span className="classement__prix">{fcfa(a.tarif_assure)}{a.tarif_assure !== a.tarif_non_assure && ` / ${fcfa(a.tarif_non_assure)}`}</span>
                    </div>
                    <span className="classement__barre"><span style={{ width: `${(a.nombre / maxTop) * 100}%` }} /></span>
                    <strong className="classement__nombre">{nombre(a.nombre)}</strong>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panneau">
            <h2>Activité par agent</h2>
            {kpi.par_agent.length === 0 ? <p className="aide">Aucune activité sur la période.</p> : (
              <div className="tableau-defilant">
                <table className="tableau">
                  <thead><tr><th>Agent</th><th className="nombre">Tarifs</th><th className="nombre">Sans résultat</th><th>Dernière activité</th></tr></thead>
                  <tbody>
                    {kpi.par_agent.map((a) => (
                      <tr key={a.email}>
                        <td>{a.nom}</td>
                        <td className="nombre">{nombre(a.consultations)}</td>
                        <td className="nombre">{nombre(a.sans_resultat)}</td>
                        <td>{dateHeure(a.derniere_activite)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panneau">
            <h2>Recherches sans résultat</h2>
            <p className="legende">Ce que les patients demandent et que la grille ne contient pas.</p>
            {kpi.termes_sans_resultat.length === 0 ? <p className="aide">Toutes les recherches ont abouti.</p> : (
              <ul className="termes">
                {kpi.termes_sans_resultat.map((t) => (
                  <li key={t.terme}>
                    <span className="termes__mot">« {t.terme} »</span>
                    <span className="termes__nombre">{t.nombre} fois</span>
                    <Link to={`/admin/tarifs?ajouter=${encodeURIComponent(t.terme)}`} className="lien">Ajouter</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

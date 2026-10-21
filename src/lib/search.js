/**
 * Recherche instantanée côté navigateur, tolérante aux accents,
 * aux abréviations courantes et à une faute de frappe par mot.
 */

// Abréviations fréquentes au téléphone → terme présent dans les libellés
const ALIAS = {
  tdm: 'scanner',
  scan: 'scanner',
  rx: 'radiographie',
  radio: 'radiographie',
  echo: 'echographie',
  mammo: 'mammographie',
  consult: 'consultation',
  cs: 'consultation',
  gyneco: 'gynecologie',
  cardio: 'cardiologie',
  pedia: 'pediatrie',
  pedo: 'pediatrique'
}

/** Normalise caractère par caractère (même longueur que la source → surlignage exact). */
export function normaliser(texte) {
  let out = ''
  for (const ch of texte) {
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const c = base[0] || ' '
    out += /[a-z0-9œæ]/.test(c) ? c : ' '
  }
  return out
}

const motsDe = (norm) => {
  const mots = []
  const re = /[a-z0-9œæ]+/g
  let m
  while ((m = re.exec(norm))) mots.push({ mot: m[0], debut: m.index })
  return mots
}

/** Distance d'édition ≤ 1 (substitution, insertion, suppression, inversion). */
function procheDeUn(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (i === a.length && i === b.length) return true
  const ra = a.slice(i + 1), rb = b.slice(i + 1)
  if (ra === rb) return true // substitution
  if (a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)) return true // ins / sup
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2) // inversion
}

export function indexer(actes) {
  return actes.map((a) => {
    const norm = normaliser(a.libelle)
    return { ...a, _norm: norm, _mots: motsDe(norm) }
  })
}

function termesRequete(q) {
  return motsDe(normaliser(q)).map(({ mot }) => ({ brut: mot, cible: ALIAS[mot] || mot }))
}

/** Retourne [{ acte, score, surlignage: [[debut, fin], …] }] trié par pertinence. */
export function rechercher(index, requete, { categorieId = null, limite = 12 } = {}) {
  const termes = termesRequete(requete)
  if (!termes.length) return []
  const resultats = []

  for (const acte of index) {
    if (categorieId && acte.categorie_id !== categorieId) continue
    let score = 0
    const surlignage = []
    let ok = true

    for (const [ti, { brut, cible }] of termes.entries()) {
      let meilleur = 0, zone = null
      for (const { mot, debut } of acte._mots) {
        for (const t of cible === brut ? [brut] : [brut, cible]) {
          let s = 0, long = 0
          if (mot === t) { s = 12; long = t.length }
          else if (mot.startsWith(t)) { s = 9; long = t.length }
          else if (t.length >= 3 && mot.includes(t)) { s = 5; long = t.length }
          else if (t.length >= 4 && procheDeUn(mot.slice(0, t.length), t)) { s = 3; long = t.length }
          else if (t.length >= 4 && procheDeUn(mot, t)) { s = 3; long = mot.length }
          if (s > meilleur) {
            meilleur = s
            const decal = s === 5 ? mot.indexOf(t) : 0
            zone = [debut + decal, debut + decal + Math.min(long, mot.length)]
          }
        }
      }
      if (!meilleur) { ok = false; break }
      // Le premier mot tapé pèse davantage s'il ouvre le libellé
      if (ti === 0 && zone && zone[0] === 0) meilleur += 4
      score += meilleur
      surlignage.push(zone)
    }
    if (!ok) continue
    score -= acte.libelle.length / 60 // à score égal, le libellé le plus court d'abord
    resultats.push({ acte, score, surlignage })
  }

  resultats.sort((a, b) => b.score - a.score || a.acte.libelle.localeCompare(b.acte.libelle, 'fr'))
  return resultats.slice(0, limite)
}

/** Découpe un libellé en segments { texte, marque } d'après les zones à surligner. */
export function segments(libelle, zones = []) {
  const marque = new Array(libelle.length).fill(false)
  for (const z of zones) if (z) for (let i = z[0]; i < z[1] && i < libelle.length; i++) marque[i] = true
  const out = []
  for (let i = 0; i < libelle.length; i++) {
    const last = out[out.length - 1]
    if (last && last.marque === marque[i]) last.texte += libelle[i]
    else out.push({ texte: libelle[i], marque: marque[i] })
  }
  return out
}

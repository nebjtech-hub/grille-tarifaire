/**
 * Exports Excel aux couleurs du Centre Diagnostic.
 * ExcelJS est chargé à la demande pour ne pas alourdir l'écran agent.
 */
const VERT = 'FF41B8AC'
const CIEL = 'FFE6F6FC'
const FORMAT_FCFA = '#,##0" FCFA"'

async function nouveauClasseur() {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Centre Diagnostic — Grille tarifaire'
  wb.created = new Date()
  return wb
}

/**
 * Ajoute une feuille formatée.
 * colonnes : [{ titre, cle, largeur, format: 'fcfa' | 'date' | 'pct' | undefined }]
 */
function ajouterFeuille(wb, nom, titre, colonnes, lignes) {
  const ws = wb.addWorksheet(nom.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] })

  ws.mergeCells(1, 1, 1, Math.max(colonnes.length, 1))
  const t = ws.getCell(1, 1)
  t.value = titre
  t.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF2E2F33' } }
  ws.getRow(1).height = 24

  const entete = ws.getRow(3)
  colonnes.forEach((c, i) => {
    const cell = entete.getCell(i + 1)
    cell.value = c.titre
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERT } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    ws.getColumn(i + 1).width = c.largeur || 18
  })
  entete.height = 22

  lignes.forEach((l, r) => {
    const row = ws.getRow(r + 4)
    colonnes.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      let v = typeof c.cle === 'function' ? c.cle(l) : l[c.cle]
      if (c.format === 'date' && v) v = new Date(v)
      cell.value = v ?? ''
      if (c.format === 'fcfa') cell.numFmt = FORMAT_FCFA
      if (c.format === 'date') cell.numFmt = 'dd/mm/yyyy hh:mm'
      if (c.format === 'pct') cell.numFmt = '0%'
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CIEL } }
    })
  })

  if (lignes.length) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + lignes.length, column: colonnes.length } }
  }
  return ws
}

async function telecharger(wb, nomFichier) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const horodatage = () => new Date().toISOString().slice(0, 10)

export async function exporterGrille(actes) {
  const wb = await nouveauClasseur()
  const parCat = new Map()
  for (const a of actes) {
    const k = a.categorie || 'Sans catégorie'
    if (!parCat.has(k)) parCat.set(k, [])
    parCat.get(k).push(a)
  }
  const cols = [
    { titre: 'Acte', cle: 'libelle', largeur: 60 },
    { titre: 'Tarif assuré', cle: 'tarif_assure', largeur: 18, format: 'fcfa' },
    { titre: 'Tarif non assuré', cle: 'tarif_non_assure', largeur: 18, format: 'fcfa' },
    { titre: 'Statut', cle: (a) => (a.actif ? 'Actif' : 'Retiré'), largeur: 12 }
  ]
  for (const [cat, liste] of parCat) {
    liste.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
    ajouterFeuille(wb, cat, `Grille tarifaire — ${cat}`, cols, liste)
  }
  await telecharger(wb, `grille-tarifaire-CDL-${horodatage()}.xlsx`)
}

export async function exporterTableauDeBord(kpi, libellePeriode) {
  const wb = await nouveauClasseur()
  const total = kpi.consultations + kpi.sans_resultat

  ajouterFeuille(wb, 'Synthèse', `Synthèse — ${libellePeriode}`, [
    { titre: 'Indicateur', cle: 'k', largeur: 40 },
    { titre: 'Valeur', cle: 'v', largeur: 16 }
  ], [
    { k: 'Tarifs communiqués', v: kpi.consultations },
    { k: 'Recherches sans résultat', v: kpi.sans_resultat },
    { k: 'Taux de recherches abouties', v: total ? kpi.consultations / total : 0 },
    { k: 'Agents actifs sur la période', v: kpi.agents_actifs },
    { k: 'Actes différents demandés', v: kpi.actes_distincts }
  ]).getCell('B6').numFmt = '0%'

  ajouterFeuille(wb, 'Actes les plus demandés', `Actes les plus demandés — ${libellePeriode}`, [
    { titre: 'Acte', cle: 'libelle', largeur: 55 },
    { titre: 'Catégorie', cle: 'categorie', largeur: 18 },
    { titre: 'Demandes', cle: 'nombre', largeur: 12 },
    { titre: 'Tarif assuré', cle: 'tarif_assure', format: 'fcfa' },
    { titre: 'Tarif non assuré', cle: 'tarif_non_assure', format: 'fcfa' }
  ], kpi.top_actes)

  ajouterFeuille(wb, 'Activité par agent', `Activité par agent — ${libellePeriode}`, [
    { titre: 'Agent', cle: 'nom', largeur: 28 },
    { titre: 'E-mail', cle: 'email', largeur: 34 },
    { titre: 'Tarifs communiqués', cle: 'consultations' },
    { titre: 'Sans résultat', cle: 'sans_resultat' },
    { titre: 'Dernière activité', cle: 'derniere_activite', format: 'date', largeur: 20 }
  ], kpi.par_agent)

  ajouterFeuille(wb, 'Activité par jour', `Activité par jour — ${libellePeriode}`, [
    { titre: 'Jour', cle: 'jour', largeur: 14 },
    { titre: 'Tarifs communiqués', cle: 'consultations' },
    { titre: 'Sans résultat', cle: 'sans_resultat' }
  ], kpi.par_jour)

  ajouterFeuille(wb, 'Heures d’affluence', `Heures d’affluence — ${libellePeriode}`, [
    { titre: 'Heure', cle: (l) => `${String(l.heure).padStart(2, '0')}h`, largeur: 10 },
    { titre: 'Tarifs communiqués', cle: 'nombre' }
  ], kpi.par_heure)

  ajouterFeuille(wb, 'Recherches sans résultat', `Recherches sans résultat — ${libellePeriode}`, [
    { titre: 'Terme recherché', cle: 'terme', largeur: 40 },
    { titre: 'Occurrences', cle: 'nombre' },
    { titre: 'Dernière fois', cle: 'dernier', format: 'date', largeur: 20 }
  ], kpi.termes_sans_resultat)

  await telecharger(wb, `tableau-de-bord-CDL-${horodatage()}.xlsx`)
}

export async function exporterJournal(lignes, libellePeriode) {
  const wb = await nouveauClasseur()
  ajouterFeuille(wb, 'Journal', `Journal des recherches — ${libellePeriode}`, [
    { titre: 'Date et heure', cle: 'created_at', format: 'date', largeur: 18 },
    { titre: 'Agent', cle: (l) => l.profils?.nom, largeur: 24 },
    { titre: 'Saisie de l’agent', cle: 'terme', largeur: 26 },
    { titre: 'Résultat', cle: (l) => (l.resultat ? 'Tarif communiqué' : 'Aucun résultat'), largeur: 18 },
    { titre: 'Acte', cle: (l) => l.actes?.libelle, largeur: 50 },
    { titre: 'Catégorie', cle: (l) => l.actes?.categories?.nom, largeur: 16 },
    { titre: 'Tarif assuré', cle: (l) => l.actes?.tarif_assure, format: 'fcfa' },
    { titre: 'Tarif non assuré', cle: (l) => l.actes?.tarif_non_assure, format: 'fcfa' }
  ], lignes)
  await telecharger(wb, `journal-recherches-CDL-${horodatage()}.xlsx`)
}

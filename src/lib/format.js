const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** 25000 → « 25 000 » (espace fine insécable standard fr-FR remplacée par une espace insécable). */
export const montant = (n) => nf.format(n ?? 0).replace(/\u202f/g, '\u00a0')
export const fcfa = (n) => `${montant(n)}\u00a0FCFA`
export const nombre = (n) => nf.format(n ?? 0).replace(/\u202f/g, '\u00a0')

export const dateHeure = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Libreville', dateStyle: 'short', timeStyle: 'short' }) : ''

export const pourcentage = (part, total) => (total ? Math.round((part / total) * 100) : 0)

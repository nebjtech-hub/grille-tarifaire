import { useEffect, useRef } from 'react'

/** Fenêtre modale accessible basée sur <dialog>. */
export default function Dialogue({ ouvert, onFermer, titre, children, large = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (ouvert && !d.open) d.showModal()
    if (!ouvert && d.open) d.close()
  }, [ouvert])
  return (
    <dialog
      ref={ref}
      className={`dialogue${large ? ' dialogue--large' : ''}`}
      onCancel={(e) => { e.preventDefault(); onFermer() }}
      onClick={(e) => { if (e.target === ref.current) onFermer() }}
      aria-labelledby="dialogue-titre"
    >
      <div className="dialogue__corps">
        <div className="dialogue__haut">
          <h2 id="dialogue-titre">{titre}</h2>
          <button type="button" className="bouton-icone" onClick={onFermer} aria-label="Fermer">×</button>
        </div>
        {ouvert && children}
      </div>
    </dialog>
  )
}

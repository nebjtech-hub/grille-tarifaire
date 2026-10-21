import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Connexion from './pages/Connexion'
import Recherche from './pages/Recherche'
import TableauDeBord from './pages/admin/TableauDeBord'
import Agents from './pages/admin/Agents'
import Tarifs from './pages/admin/Tarifs'
import EnTete from './components/EnTete'

function Chargement() {
  return <div className="ecran-chargement" role="status"><img src="/logo.png" alt="Centre Diagnostic" /></div>
}

function Protegee({ admin = false, children }) {
  const { session, profil, chargement, estAdmin } = useAuth()
  if (chargement || (session && !profil)) return <Chargement />
  if (!session) return <Navigate to="/connexion" replace />
  if (admin && !estAdmin) return <Navigate to="/" replace />
  return (
    <>
      <EnTete />
      <main className="contenu">{children}</main>
    </>
  )
}

export default function App() {
  const { session, profil, chargement } = useAuth()
  return (
    <Routes>
      <Route path="/connexion" element={
        chargement ? <Chargement /> : session && profil ? <Navigate to="/" replace /> : <Connexion />
      } />
      <Route path="/" element={<Protegee><Recherche /></Protegee>} />
      <Route path="/admin" element={<Protegee admin><TableauDeBord /></Protegee>} />
      <Route path="/admin/agents" element={<Protegee admin><Agents /></Protegee>} />
      <Route path="/admin/tarifs" element={<Protegee admin><Tarifs /></Protegee>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

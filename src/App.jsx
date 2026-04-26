import { Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import Desktop from './pages/Desktop'
import FolderView from './pages/FolderView'
import UserSelector from './components/UserSelector'

function AppRoutes() {
  const { activeUser, loading } = useUser()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400 text-lg">Laster...</div>
      </div>
    )
  }

  if (!activeUser) {
    return <UserSelector />
  }

  return (
    <Routes>
      <Route path="/" element={<Desktop />} />
      <Route path="/mappe/:folderId" element={<FolderView />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppRoutes />
    </UserProvider>
  )
}

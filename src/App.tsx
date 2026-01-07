import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Toaster } from '@/components/ui/toaster'
import { Home } from '@/pages/Home'
import { ConnectionForm } from '@/pages/ConnectionForm'
import { Clone } from '@/pages/Clone'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'
import { useColorTheme } from '@/hooks/use-color-theme'

function App() {
  // Initialize color theme on app load
  useColorTheme()

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/connection/new" element={<ConnectionForm />} />
          <Route path="/connection/:id/edit" element={<ConnectionForm />} />
          <Route path="/clone" element={<Clone />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
      <Toaster />
    </BrowserRouter>
  )
}

export default App

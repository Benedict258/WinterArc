import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import TodayView from './pages/TodayView'
import WeekView from './pages/WeekView'
import ThreadsView from './pages/ThreadsView'
import ThreadDetailView from './pages/ThreadDetailView'
import BacklogView from './pages/BacklogView'
import WishlistView from './pages/WishlistView'
import GoalsView from './pages/GoalsView'
import SettingsView from './pages/SettingsView'
import { Toaster } from './components/ui/toaster'
import { AuthProvider } from './context/AuthContext'
import PasscodeGate from './components/PasscodeGate'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <AuthProvider>
          <PasscodeGate>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<TodayView />} />
                <Route path="/week" element={<WeekView />} />
                <Route path="/threads" element={<ThreadsView />} />
                <Route path="/threads/:id" element={<ThreadDetailView />} />
                <Route path="/backlog" element={<BacklogView />} />
                <Route path="/wishlist" element={<WishlistView />} />
                <Route path="/goals" element={<GoalsView />} />
                <Route path="/settings" element={<SettingsView />} />
              </Routes>
              <Toaster />
            </BrowserRouter>
          </PasscodeGate>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App

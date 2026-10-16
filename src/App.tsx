import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from './lib/queryClient'
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
import DropView from './pages/DropView'
import { Toaster } from './components/ui/toaster'
import { AuthProvider } from './context/AuthContext'
import DialogHost from './components/DialogHost'
import SyncStatus from './components/SyncStatus'
import AuthGate from './components/AuthGate'
import AppearanceApplier from './components/AppearanceApplier'
import ModuleRoute from './components/ModuleRoute'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { PrivacyPage, TermsPage, DeleteAccountPage } from './pages/LegalPages'
import AdminPage from './pages/AdminPage'
import AssistantPage from './pages/AssistantPage'
import ImportPage from './pages/ImportPage'
import PartnersPage from './pages/PartnersPage'
import TeamThreadPage from './pages/TeamThreadPage'
import BillingPage from './pages/BillingPage'
import FocusPage from './pages/FocusPage'
import RoutinesPage from './pages/RoutinesPage'
import HabitsPage from './pages/HabitsPage'
import FitnessPage from './pages/FitnessPage'
import NutritionPage from './pages/NutritionPage'
import OAuthAuthorizePage from './pages/OAuthAuthorizePage'
import FocusRuntime from './components/FocusRuntime'

const queryClient = createQueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Reachable while signed out: links from emails */}
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/delete-account" element={<DeleteAccountPage />} />
              <Route
                path="/*"
                element={
                  <AuthGate>
                    <Routes>
                      <Route path="/" element={<TodayView />} />
                      <Route path="/week" element={<WeekView />} />
                      <Route path="/threads" element={<ThreadsView />} />
                      <Route path="/threads/:id" element={<ThreadDetailView />} />
                      <Route path="/teams/:id" element={<TeamThreadPage />} />
                      <Route path="/backlog" element={<BacklogView />} />
                      <Route path="/wishlist" element={<ModuleRoute module="wishlist"><WishlistView /></ModuleRoute>} />
                      <Route path="/goals" element={<ModuleRoute module="goals"><GoalsView /></ModuleRoute>} />
                      <Route path="/drop" element={<ModuleRoute module="drop"><DropView /></ModuleRoute>} />
                      <Route path="/settings" element={<SettingsView />} />
                      <Route path="/assistant" element={<ModuleRoute module="ai"><AssistantPage /></ModuleRoute>} />
                      <Route path="/focus" element={<ModuleRoute module="focus"><FocusPage /></ModuleRoute>} />
                      <Route path="/routines" element={<ModuleRoute module="routines"><RoutinesPage /></ModuleRoute>} />
                      <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
                      <Route path="/nutrition" element={<ModuleRoute module="nutrition"><NutritionPage /></ModuleRoute>} />
                      <Route path="/fitness" element={<ModuleRoute module="fitness"><FitnessPage /></ModuleRoute>} />
                      <Route path="/habits" element={<ModuleRoute module="habits"><HabitsPage /></ModuleRoute>} />
                      <Route path="/partners" element={<ModuleRoute module="partners"><PartnersPage /></ModuleRoute>} />
                      <Route path="/billing" element={<BillingPage />} />
                      <Route path="/import" element={<ImportPage />} />
                      <Route path="/admin" element={<AdminPage />} />
                    </Routes>
                    <AppearanceApplier />
                    <FocusRuntime />
                    <DialogHost />
                    <SyncStatus />
                  </AuthGate>
                }
              />
            </Routes>
            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App

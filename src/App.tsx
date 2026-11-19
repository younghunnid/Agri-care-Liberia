import {BrowserRouter, Route, Routes} from 'react-router-dom';
import {AppProvider} from './context/AppContext';
import {Layout} from './components/Layout';
import {ProtectedRoute} from './components/ProtectedRoute';

// Public & Prototype Pages
import {HomePage} from './pages/public/HomePage';
import {CropProblemsPage} from './pages/public/CropProblemsPage';
import {FarmCalculatorPage} from './pages/public/FarmCalculatorPage';
import {LearnPage} from './pages/public/LearnPage';
import {LessonPage} from './pages/public/LessonPage';
import {CassavaDemoPage} from './pages/public/CassavaDemoPage';
import {AdvisorPage} from './pages/public/AdvisorPage';
import {GuidesLibraryPage} from './pages/public/GuidesLibraryPage';
import {GuideDetailPage} from './pages/public/GuideDetailPage';
import {PestsDiseasesPage} from './pages/public/PestsDiseasesPage';
import {OfflineLibraryPage} from './pages/public/OfflineLibraryPage';
import {OfflineReaderPage} from './pages/public/OfflineReaderPage';
import {OfflineDownloadsPage} from './pages/public/OfflineDownloadsPage';
import {ExpertSupportPage} from './pages/public/ExpertSupportPage';
import {LanguageLabPage} from './pages/public/LanguageLabPage';
import {PhoneSimulatorPage} from './pages/public/PhoneSimulatorPage';
import {MarketplacePage} from './pages/public/MarketplacePage';
import {DemoFarmerDashboardPage} from './pages/public/DemoFarmerDashboardPage';
import {PrototypeManagementPage} from './pages/public/PrototypeManagementPage';
import {ComingSoonPage} from './pages/public/ComingSoonPage';
import {DemoModePage} from './pages/public/DemoModePage';
import {WeatherPage} from './pages/public/WeatherPage';
import {SoilAdvisoryPage} from './pages/public/SoilAdvisoryPage';
import {CropsLibraryPage} from './pages/public/CropsLibraryPage';
import {LivestockPage} from './pages/public/LivestockPage';
import {MinistryDashboardPage} from './pages/public/MinistryDashboardPage';
import {AboutPage} from './pages/public/AboutPage';
import {ContactFeedbackPage} from './pages/public/ContactFeedbackPage';
import {LoginPage} from './pages/public/LoginPage';
import {RegisterPage} from './pages/public/RegisterPage';

// Authenticated Farmer Pages
import {FarmerDashboardPage} from './pages/farmer/FarmerDashboardPage';
import {SavedAdvicePage} from './pages/farmer/SavedAdvicePage';
import {MyQuestionsPage} from './pages/farmer/MyQuestionsPage';
import {ExpertRequestsPage} from './pages/farmer/ExpertRequestsPage';
import {ProfilePreferencesPage} from './pages/farmer/ProfilePreferencesPage';

// Expert Pages
import {ExpertDashboardPage} from './pages/expert/ExpertDashboardPage';
import {AssignedQuestionsPage} from './pages/expert/AssignedQuestionsPage';
import {AnswerQuestionPage} from './pages/expert/AnswerQuestionPage';
import {ExpertProfilePage} from './pages/expert/ExpertProfilePage';

// Admin Pages
import {AdminOverviewPage} from './pages/admin/AdminOverviewPage';
import {FarmerManagementPage} from './pages/admin/FarmerManagementPage';
import {ExpertManagementPage} from './pages/admin/ExpertManagementPage';
import {CropGuideManagementPage} from './pages/admin/CropGuideManagementPage';
import {AdvisoryContentReviewPage} from './pages/admin/AdvisoryContentReviewPage';
import {QuestionManagementPage} from './pages/admin/QuestionManagementPage';
import {ReportsAuditLogsPage} from './pages/admin/ReportsAuditLogsPage';
import {PlatformSettingsPage} from './pages/admin/PlatformSettingsPage';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            {/* Public & Hackathon Prototype Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/advisor" element={<AdvisorPage />} />
            <Route path="/guides" element={<GuidesLibraryPage />} />
            <Route path="/knowledge" element={<GuidesLibraryPage />} />
            <Route path="/guides/:id" element={<GuideDetailPage />} />
            <Route path="/crops" element={<CropsLibraryPage />} />
            <Route path="/crops/:slug" element={<CropsLibraryPage />} />
            <Route path="/livestock" element={<LivestockPage />} />
            <Route path="/livestock/:slug" element={<LivestockPage />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route path="/soil" element={<SoilAdvisoryPage />} />
            <Route path="/pests" element={<PestsDiseasesPage />} />
            <Route path="/ministry" element={<MinistryDashboardPage />} />
            <Route path="/food-security" element={<MinistryDashboardPage />} />
            <Route path="/offline" element={<OfflineLibraryPage />} />
            <Route path="/offline/read/:id" element={<OfflineReaderPage />} />
            <Route path="/downloads" element={<OfflineDownloadsPage />} />
            <Route path="/experts" element={<ExpertSupportPage />} />
            <Route path="/language-lab" element={<LanguageLabPage />} />
            <Route path="/phone-simulator" element={<PhoneSimulatorPage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
            <Route path="/dashboard" element={<DemoFarmerDashboardPage />} />
            <Route path="/management" element={<PrototypeManagementPage />} />
            <Route path="/coming-soon" element={<ComingSoonPage />} />
            <Route path="/demo" element={<DemoModePage />} />
            <Route path="/demo/cassava" element={<CassavaDemoPage />} />
            <Route path="/advice/crop-problems" element={<CropProblemsPage />} />
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/learn/:id" element={<LessonPage />} />
            <Route path="/tools/calculator" element={<FarmCalculatorPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactFeedbackPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Authenticated Farmer Routes */}
            <Route path="/farmer" element={<ProtectedRoute><FarmerDashboardPage /></ProtectedRoute>} />
            <Route path="/farmer/saved" element={<ProtectedRoute><SavedAdvicePage /></ProtectedRoute>} />
            <Route path="/farmer/questions" element={<ProtectedRoute><MyQuestionsPage /></ProtectedRoute>} />
            <Route path="/farmer/expert-requests" element={<ProtectedRoute><ExpertRequestsPage /></ProtectedRoute>} />
            <Route path="/farmer/profile" element={<ProtectedRoute><ProfilePreferencesPage /></ProtectedRoute>} />

            {/* Expert Routes */}
            <Route path="/expert" element={<ProtectedRoute requiredRoles={['expert', 'admin']}><ExpertDashboardPage /></ProtectedRoute>} />
            <Route path="/expert/questions" element={<ProtectedRoute requiredRoles={['expert', 'admin']}><AssignedQuestionsPage /></ProtectedRoute>} />
            <Route path="/expert/questions/:id" element={<ProtectedRoute requiredRoles={['expert', 'admin']}><AnswerQuestionPage /></ProtectedRoute>} />
            <Route path="/expert/profile" element={<ProtectedRoute requiredRoles={['expert', 'admin']}><ExpertProfilePage /></ProtectedRoute>} />

            {/* Administrator Routes */}
            <Route path="/admin" element={<ProtectedRoute requiredRoles={['admin']}><AdminOverviewPage /></ProtectedRoute>} />
            <Route path="/admin/farmers" element={<ProtectedRoute requiredRoles={['admin']}><FarmerManagementPage /></ProtectedRoute>} />
            <Route path="/admin/experts" element={<ProtectedRoute requiredRoles={['admin']}><ExpertManagementPage /></ProtectedRoute>} />
            <Route path="/admin/guides" element={<ProtectedRoute requiredRoles={['admin']}><CropGuideManagementPage /></ProtectedRoute>} />
            <Route path="/admin/reviews" element={<ProtectedRoute requiredRoles={['admin']}><AdvisoryContentReviewPage /></ProtectedRoute>} />
            <Route path="/admin/questions" element={<ProtectedRoute requiredRoles={['admin']}><QuestionManagementPage /></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute requiredRoles={['admin']}><ReportsAuditLogsPage /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute requiredRoles={['admin']}><PlatformSettingsPage /></ProtectedRoute>} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}

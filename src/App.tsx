import {lazy} from 'react';
import {RouteContent} from './components/PageBoundary';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import {AppProvider} from './context/AppContext';
import {Layout} from './components/Layout';
import {ProtectedRoute} from './components/ProtectedRoute';
import {HomePage} from './pages/public/HomePage';
import {FarmerTodayPage} from './pages/public/FarmerTodayPage';
import {GuidancePage} from './pages/public/GuidancePage';
const UssdDemoPage = lazy(() => import('./pages/public/UssdDemoPage').then((m) => ({default: m.UssdDemoPage})));

const UssdPosterPage = lazy(() => import('./pages/public/UssdPosterPage').then((m) => ({default: m.UssdPosterPage})));
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage').then((m) => ({default: m.NotFoundPage})));

// Public & Prototype Pages
const CropProblemsPage = lazy(() => import('./pages/public/CropProblemsPage').then((m) => ({default: m.CropProblemsPage})));
const CropCheckPage = lazy(() => import('./pages/public/CropCheckPage').then((m) => ({default: m.CropCheckPage})));
const AdviceCardsPage = lazy(() => import('./pages/public/AdviceCardsPage').then((m) => ({default: m.AdviceCardsPage})));
const AdviceCardPage = lazy(() => import('./pages/public/AdviceCardPage').then((m) => ({default: m.AdviceCardPage})));
const SellHarvestPage = lazy(() => import('./pages/public/SellHarvestPage').then((m) => ({default: m.SellHarvestPage})));
const HarvestMarketPage = lazy(() => import('./pages/public/HarvestMarketPage').then((m) => ({default: m.HarvestMarketPage})));
const FarmToMarketDemoPage = lazy(() => import('./pages/public/FarmToMarketDemoPage').then((m) => ({default: m.FarmToMarketDemoPage})));
const FarmCalculatorPage = lazy(() => import('./pages/public/FarmCalculatorPage').then((m) => ({default: m.FarmCalculatorPage})));
const VerifyCodePage = lazy(() => import('./pages/public/VerifyCodePage').then((m) => ({default: m.VerifyCodePage})));
const PrivacyPage = lazy(() => import('./pages/public/PrivacyPage').then((m) => ({default: m.PrivacyPage})));
const RecoverAccountPage = lazy(() => import('./pages/public/RecoverAccountPage').then((m) => ({default: m.RecoverAccountPage})));
const ForgotPasswordPage = lazy(() => import('./pages/public/ForgotPasswordPage').then((m) => ({default: m.ForgotPasswordPage})));
const DemoSmsInboxPage = lazy(() => import('./pages/public/DemoSmsInboxPage').then((m) => ({default: m.DemoSmsInboxPage})));
const AccountSecurityPage = lazy(() => import('./pages/farmer/AccountSecurityPage').then((m) => ({default: m.AccountSecurityPage})));
const TrustedDevicesPage = lazy(() => import('./pages/farmer/TrustedDevicesPage').then((m) => ({default: m.TrustedDevicesPage})));
const MinistryWorkspacePage = lazy(() => import('./pages/public/MinistryWorkspacePage').then((m) => ({default: m.MinistryWorkspacePage})));
const LearnPage = lazy(() => import('./pages/public/LearnPage').then((m) => ({default: m.LearnPage})));
const LessonPage = lazy(() => import('./pages/public/LessonPage').then((m) => ({default: m.LessonPage})));
const CassavaDemoPage = lazy(() => import('./pages/public/CassavaDemoPage').then((m) => ({default: m.CassavaDemoPage})));
const AdvisorPage = lazy(() => import('./pages/public/AdvisorPage').then((m) => ({default: m.AdvisorPage})));
const GuidesLibraryPage = lazy(() => import('./pages/public/GuidesLibraryPage').then((m) => ({default: m.GuidesLibraryPage})));
const GuideDetailPage = lazy(() => import('./pages/public/GuideDetailPage').then((m) => ({default: m.GuideDetailPage})));
const PestsDiseasesPage = lazy(() => import('./pages/public/PestsDiseasesPage').then((m) => ({default: m.PestsDiseasesPage})));
const OfflineLibraryPage = lazy(() => import('./pages/public/OfflineLibraryPage').then((m) => ({default: m.OfflineLibraryPage})));
const OfflineReaderPage = lazy(() => import('./pages/public/OfflineReaderPage').then((m) => ({default: m.OfflineReaderPage})));
const OfflineDownloadsPage = lazy(() => import('./pages/public/OfflineDownloadsPage').then((m) => ({default: m.OfflineDownloadsPage})));
const ExpertSupportPage = lazy(() => import('./pages/public/ExpertSupportPage').then((m) => ({default: m.ExpertSupportPage})));
const LanguageLabPage = lazy(() => import('./pages/public/LanguageLabPage').then((m) => ({default: m.LanguageLabPage})));
const PhoneSimulatorPage = lazy(() => import('./pages/public/PhoneSimulatorPage').then((m) => ({default: m.PhoneSimulatorPage})));
const MarketplacePage = lazy(() => import('./pages/public/MarketplacePage').then((m) => ({default: m.MarketplacePage})));
const DemoFarmerDashboardPage = lazy(() => import('./pages/public/DemoFarmerDashboardPage').then((m) => ({default: m.DemoFarmerDashboardPage})));
const PrototypeManagementPage = lazy(() => import('./pages/public/PrototypeManagementPage').then((m) => ({default: m.PrototypeManagementPage})));
const ComingSoonPage = lazy(() => import('./pages/public/ComingSoonPage').then((m) => ({default: m.ComingSoonPage})));
const DemoModePage = lazy(() => import('./pages/public/DemoModePage').then((m) => ({default: m.DemoModePage})));
const WeatherPage = lazy(() => import('./pages/public/WeatherPage').then((m) => ({default: m.WeatherPage})));
const SoilAdvisoryPage = lazy(() => import('./pages/public/SoilAdvisoryPage').then((m) => ({default: m.SoilAdvisoryPage})));
const CropsLibraryPage = lazy(() => import('./pages/public/CropsLibraryPage').then((m) => ({default: m.CropsLibraryPage})));
const LivestockPage = lazy(() => import('./pages/public/LivestockPage').then((m) => ({default: m.LivestockPage})));

const AboutPage = lazy(() => import('./pages/public/AboutPage').then((m) => ({default: m.AboutPage})));
const ContactFeedbackPage = lazy(() => import('./pages/public/ContactFeedbackPage').then((m) => ({default: m.ContactFeedbackPage})));
const LoginPage = lazy(() => import('./pages/public/LoginPage').then((m) => ({default: m.LoginPage})));
const RegisterPage = lazy(() => import('./pages/public/RegisterPage').then((m) => ({default: m.RegisterPage})));

// Authenticated Farmer Pages
const FarmerDashboardPage = lazy(() => import('./pages/farmer/FarmerDashboardPage').then((m) => ({default: m.FarmerDashboardPage})));
const MyMarketplacePage = lazy(() => import('./pages/farmer/MyMarketplacePage').then((m) => ({default: m.MyMarketplacePage})));
const SavedAdvicePage = lazy(() => import('./pages/farmer/SavedAdvicePage').then((m) => ({default: m.SavedAdvicePage})));
const MyQuestionsPage = lazy(() => import('./pages/farmer/MyQuestionsPage').then((m) => ({default: m.MyQuestionsPage})));
const ExpertRequestsPage = lazy(() => import('./pages/farmer/ExpertRequestsPage').then((m) => ({default: m.ExpertRequestsPage})));
const ProfilePreferencesPage = lazy(() => import('./pages/farmer/ProfilePreferencesPage').then((m) => ({default: m.ProfilePreferencesPage})));

// Expert Pages
const ExpertDashboardPage = lazy(() => import('./pages/expert/ExpertDashboardPage').then((m) => ({default: m.ExpertDashboardPage})));
const AssignedQuestionsPage = lazy(() => import('./pages/expert/AssignedQuestionsPage').then((m) => ({default: m.AssignedQuestionsPage})));
const AnswerQuestionPage = lazy(() => import('./pages/expert/AnswerQuestionPage').then((m) => ({default: m.AnswerQuestionPage})));
const ExpertProfilePage = lazy(() => import('./pages/expert/ExpertProfilePage').then((m) => ({default: m.ExpertProfilePage})));

// Admin Pages
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage').then((m) => ({default: m.AdminOverviewPage})));
const FarmerManagementPage = lazy(() => import('./pages/admin/FarmerManagementPage').then((m) => ({default: m.FarmerManagementPage})));
const ExpertManagementPage = lazy(() => import('./pages/admin/ExpertManagementPage').then((m) => ({default: m.ExpertManagementPage})));
const CropGuideManagementPage = lazy(() => import('./pages/admin/CropGuideManagementPage').then((m) => ({default: m.CropGuideManagementPage})));
const AdvisoryContentReviewPage = lazy(() => import('./pages/admin/AdvisoryContentReviewPage').then((m) => ({default: m.AdvisoryContentReviewPage})));
const QuestionManagementPage = lazy(() => import('./pages/admin/QuestionManagementPage').then((m) => ({default: m.QuestionManagementPage})));
const ReportsAuditLogsPage = lazy(() => import('./pages/admin/ReportsAuditLogsPage').then((m) => ({default: m.ReportsAuditLogsPage})));
const PlatformSettingsPage = lazy(() => import('./pages/admin/PlatformSettingsPage').then((m) => ({default: m.PlatformSettingsPage})));

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Layout>
          <RouteContent>
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
            <Route path="/ministry" element={<MinistryWorkspacePage />} />
            <Route path="/ministry/*" element={<MinistryWorkspacePage />} />
            <Route path="/food-security" element={<MinistryWorkspacePage />} />
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
            <Route path="/check-my-crop" element={<CropCheckPage />} />
            <Route path="/advice-cards" element={<AdviceCardsPage />} />
            <Route path="/advice-cards/:ref" element={<AdviceCardPage />} />
            <Route path="/today" element={<FarmerTodayPage />} />
            <Route path="/guidance" element={<GuidancePage />} />
            <Route path="/ussd-demo" element={<UssdDemoPage />} />
            <Route path="/ussd-demo/poster" element={<UssdPosterPage />} />
            <Route path="/harvest" element={<HarvestMarketPage />} />
            <Route path="/harvest/sell" element={<SellHarvestPage />} />
            <Route path="/demo/farm-to-market" element={<FarmToMarketDemoPage />} />
            <Route path="/ministry-analytics" element={<MinistryWorkspacePage />} />
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/learn/:id" element={<LessonPage />} />
            <Route path="/tools/calculator" element={<FarmCalculatorPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactFeedbackPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify" element={<VerifyCodePage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/recover-account" element={<RecoverAccountPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ForgotPasswordPage />} />
            <Route path="/demo/sms-inbox" element={<DemoSmsInboxPage />} />

            {/* Authenticated Farmer Routes */}
            <Route path="/farmer" element={<ProtectedRoute><FarmerDashboardPage /></ProtectedRoute>} />
            <Route path="/farmer/market" element={<ProtectedRoute><MyMarketplacePage /></ProtectedRoute>} />
            <Route path="/farmer/saved" element={<ProtectedRoute><SavedAdvicePage /></ProtectedRoute>} />
            <Route path="/farmer/questions" element={<ProtectedRoute><MyQuestionsPage /></ProtectedRoute>} />
            <Route path="/farmer/expert-requests" element={<ProtectedRoute><ExpertRequestsPage /></ProtectedRoute>} />
            <Route path="/farmer/profile" element={<ProtectedRoute><ProfilePreferencesPage /></ProtectedRoute>} />

            <Route path="/account/security" element={<ProtectedRoute><AccountSecurityPage /></ProtectedRoute>} />
            <Route path="/account/devices" element={<ProtectedRoute><TrustedDevicesPage /></ProtectedRoute>} />

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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </RouteContent>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}

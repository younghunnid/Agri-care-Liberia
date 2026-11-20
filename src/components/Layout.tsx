import {isMinistryPath} from '../lib/ministryWorkspace';
import {PwaUpdatePrompt} from './PwaUpdatePrompt';
import {SyncBanner} from './SyncStatus';
import {DemoEnvironmentBanner} from './DemoEnvironmentBanner';
import React, {useEffect, useRef, useState} from 'react';
import {Link, NavLink, useLocation, useNavigate} from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bug,
  CloudRain,
  Download,
  Fish,
  Gauge,
  Globe,
  Home,
  Info,
  Languages,
  Layers,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  PhoneCall,
  Presentation,
  ShieldCheck,
  Sparkles,
  Sprout,
  Store,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {useApp} from '../context/AppContext';
import {LANGUAGE_OPTIONS, type LanguageCode} from '../lib/i18n';
import {PWAInstallButton} from './PWAInstallButton';
import {ListenModeBar} from './ListenModeBar';

function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export const Layout: React.FC<{children: React.ReactNode}> = ({children}) => {
  const {
    user,
    language,
    setLanguage,
    isOnline,
    lowBandwidth,
    toggleLowBandwidth,
    listenMode,
    toggleListenMode,
    logout,
    tr,
  } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setMenuOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = focusable(); const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawerRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = previousOverflow; previousFocus?.focus({preventScroll: true}); };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({top: 0, behavior: 'instant'});
  }, [location.pathname]);

  const isExpert = Boolean(user?.roles.includes('expert'));
  const isAdmin = Boolean(user?.roles.includes('admin'));

  const handleLogout = async () => {
    await logout();
    setMenuOpen(false);
    navigate('/');
  };

  const navLinkClass = ({isActive}: {isActive: boolean}) =>
    `text-sm font-medium whitespace-nowrap shrink-0 py-2 px-1 border-b-2 transition-colors ${
      isActive
        ? 'border-[#16803C] text-[#16803C] font-semibold'
        : 'border-transparent text-[#183B2B]/80 hover:text-[#183B2B] hover:border-[#16803C]/40'
    }`;

  const mobileTabClass = (active: boolean) =>
    `flex flex-col items-center justify-center min-h-[52px] text-sm font-medium transition-colors ${
      active ? 'text-[#16803C] font-semibold' : 'text-[#183B2B]/70 hover:text-[#183B2B]'
    }`;

  const isHome = location.pathname === '/';
  const isPhoneDemo = location.pathname === '/ussd-demo';
  const narrow = useNarrowScreen();

  if (isMinistryPath(location.pathname)) return <div className="min-h-dvh bg-[#F5F7F6] text-[#183B2B]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:rounded-xl focus:bg-[#16803C] focus:px-4 focus:py-3 focus:text-white">Skip to main content</a>
    <DemoEnvironmentBanner /><SyncBanner /><PwaUpdatePrompt />
    <main id="main-content" tabIndex={-1} className="min-w-0"><ListenModeBar />{children}</main>
  </div>;

  return (
    <div className="min-h-screen min-h-dvh flex flex-col bg-[#F3F8F0] text-[#183B2B]">
      <div className="contents" inert={menuOpen || undefined}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-[#16803C] focus:px-4 focus:py-3 focus:text-white focus:font-semibold"
      >
        Skip to main content
      </a>
      <DemoEnvironmentBanner />

      {/* Clean 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#183B2B]/10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2 text-base sm:text-lg font-display font-bold tracking-tight text-[#183B2B] whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <span className="w-8 h-8 rounded-xl bg-[#16803C] text-white flex items-center justify-center shrink-0">
              <Sprout className="w-5 h-5" aria-hidden="true" />
            </span>
            <span>{tr('brandName')}</span>
          </Link>

          {/* Zone 2: 5 concise single-line desktop links */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-6">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/advisor" className={navLinkClass}>
              Advisor
            </NavLink>
            <NavLink to="/guides" className={navLinkClass}>
              Knowledge
            </NavLink>
            <NavLink to="/harvest" className={navLinkClass}>
              Find harvest
            </NavLink>
            <NavLink to="/demo" className={navLinkClass}>
              Demo Mode
            </NavLink>
          </nav>

          {/* Zone 3: Primary action + Menu drawer */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to={user ? (isAdmin ? '/admin' : isExpert ? '/expert' : '/farmer') : '/today'}
              className="hidden sm:inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630] transition-colors whitespace-nowrap shrink-0"
            >
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
              <span>{user ? (isAdmin ? 'Admin' : isExpert ? 'Expert' : 'Dashboard') : 'Farmer Hub'}</span>
            </Link>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu and accessibility tools"
              aria-expanded={menuOpen}
              aria-controls="platform-menu"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-[#183B2B]/15 bg-white text-[#183B2B] hover:bg-[#DDEFE0] transition-colors"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Compact utility strip: one row on phones (icon buttons, 44 px targets); labels appear from sm up. */}
      <div className={`${isPhoneDemo ? 'hidden sm:block' : ''} bg-white/80 border-b border-[#183B2B]/10`}>
        <div className="max-w-7xl mx-auto px-2 sm:px-6 py-1.5 flex flex-wrap items-center gap-1 sm:gap-2">
          {!isHome && (
            <>
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Go back"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl bg-[#F3F8F0] border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#DDEFE0] shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                <span className="hidden sm:inline">Back</span>
              </button>
              <Link
                to="/"
                aria-label="Home"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl bg-[#F3F8F0] border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#DDEFE0] shrink-0"
              >
                <Home className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </>
          )}

          {/* Connectivity: a dot when online (quiet), a clear label when offline (important). */}
          <span role="status" className="inline-flex items-center gap-1 text-sm font-medium px-0.5 sm:px-1 min-w-0">
            {isOnline ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-[#16803C]" aria-hidden="true" />
                <span className="text-[#183B2B]/80">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-amber-700" aria-hidden="true" />
                <span className="text-amber-800 font-bold">Offline</span>
              </>
            )}
          </span>

          <div className="ml-auto flex items-center gap-1 sm:gap-2 min-w-0">
            {/* Smart Listen Mode Toggle */}
            <button
              type="button"
              onClick={toggleListenMode}
              aria-pressed={listenMode}
              aria-label={listenMode ? 'Smart Listen Mode is on' : 'Smart Listen Mode is off'}
              title="Smart Listen Mode"
              className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap ${
                listenMode
                  ? 'bg-[#16803C] border-[#16803C] text-white'
                  : 'bg-[#F3F8F0] border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
              }`}
            >
              {listenMode ? (
                <Volume2 className="w-5 h-5" aria-hidden="true" />
              ) : (
                <VolumeX className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{listenMode ? 'Listen Mode: On' : 'Listen Mode'}</span>
            </button>

            {/* Low-Bandwidth Toggle */}
            <button
              type="button"
              onClick={toggleLowBandwidth}
              aria-pressed={lowBandwidth}
              aria-label={lowBandwidth ? 'Low-Data Mode is on' : 'Low-Data Mode is off'}
              title="Low-Data Mode"
              className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap ${
                lowBandwidth
                  ? 'bg-[#F5B942] border-[#F5B942] text-[#183B2B]'
                  : 'bg-[#F3F8F0] border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
              }`}
            >
              <Gauge className="w-5 h-5" aria-hidden="true" />
              <span className="hidden sm:inline">{lowBandwidth ? 'Low-Data: On' : 'Low-Data'}</span>
            </button>

            {/* Language Selector (short codes on phones so it stays narrow) */}
            <label htmlFor="utility-language-select" className="sr-only">
              Select language
            </label>
            <select
              id="utility-language-select"
              value={language}
              onChange={(e) => void setLanguage(e.target.value as LanguageCode)}
              aria-label="Language selector"
              className="min-h-[44px] max-w-[4.5rem] sm:max-w-none rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0] px-2 sm:px-2.5 text-sm font-semibold text-[#183B2B] cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {narrow ? opt.shortCode : `${opt.shortCode} · ${opt.name}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Explicit Offline Banner */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-[#F5B942] text-[#183B2B] px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 text-center"
        >
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Offline Mode — Downloaded guides and Smart Listen text reading remain available. Live AI requires internet.
          </span>
        </div>
      )}

      <SyncBanner />
      <PwaUpdatePrompt />

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className={`flex-1 min-w-0 ${isPhoneDemo ? 'pb-6' : 'pb-28 md:pb-12'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
          <ListenModeBar />
        </div>
        {children}
      </main>

      {/* Desktop & Tablet Footer */}
      <footer className="hidden md:block border-t border-[#183B2B]/10 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2.5 font-display font-bold text-lg text-[#183B2B]">
              <span className="w-8 h-8 rounded-xl bg-[#16803C] text-white flex items-center justify-center">
                <Sprout className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>Agriccare Liberia</span>
            </div>
            <p className="text-sm text-[#183B2B]/75 max-w-md leading-relaxed">
              Team 8 Inclusive Agricultural e-Advisory Platform (Liberia Agricultural Innovation Hackathon, November 20–22, 2026). Independent prototype separated from personal AgriConnect systems.
            </p>
            <div className="pt-1">
              <PWAInstallButton compact />
            </div>
          </div>

          <div>
            <h2 className="font-display font-semibold text-sm text-[#183B2B] mb-3">Advisory &amp; Farming Modules</h2>
            <ul className="space-y-2 text-sm text-[#183B2B]/80">
              <li><Link to="/crops" className="hover:text-[#16803C]">Crops Library (9 Crops)</Link></li>
              <li><Link to="/livestock" className="hover:text-[#16803C]">Livestock &amp; Fish Farming</Link></li>
              <li><Link to="/weather" className="hover:text-[#16803C]">County Weather Info (Sample)</Link></li>
              <li><Link to="/soil" className="hover:text-[#16803C]">Soil &amp; Fertilizer Advisory</Link></li>
              <li><Link to="/pests" className="hover:text-[#16803C]">Pests &amp; Diseases Support</Link></li>
              <li><Link to="/advisor" className="hover:text-[#16803C]">AI Agricultural Advisor</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="font-display font-semibold text-sm text-[#183B2B] mb-3">Access, Market &amp; Ministry</h2>
            <ul className="space-y-2 text-sm text-[#183B2B]/80">
              <li><Link to="/marketplace" className="hover:text-[#16803C]">Agricultural Marketplace</Link></li>
              <li><Link to="/ministry" className="hover:text-[#16803C]">Ministry Food Security View</Link></li>
              <li><Link to="/language-lab" className="hover:text-[#16803C]">Local Language Lab</Link></li>
              <li><Link to="/phone-simulator" className="hover:text-[#16803C]">Simulated Phone Service</Link></li>
              <li><Link to="/demo" className="hover:text-[#16803C]">Hackathon Demo Mode</Link></li>
              <li><Link to="/coming-soon" className="hover:text-[#16803C]">Post-Hackathon Roadmap</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-[#183B2B]/10 py-4 px-6 text-center text-xs text-[#183B2B]/65">
          Team 8 Hackathon Prototype · Educational guidance only · Demo listings, simulated calls, and experimental language labs are clearly labeled.
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (5 thumb-friendly targets) */}
      <nav
        aria-label="Mobile navigation"
        className={`${isPhoneDemo ? 'hidden' : 'md:hidden'} fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#183B2B]/10 pb-safe`}
      >
        <div className="grid grid-cols-5 h-[4.25rem] items-center">
          <Link to="/today" aria-current={location.pathname === '/today' ? 'page' : undefined} className={mobileTabClass(location.pathname.startsWith('/today'))} data-testid="tab-today">
            <Home className="w-5 h-5 mb-0.5" aria-hidden="true" />
            <span>Today</span>
          </Link>
          <Link to="/advisor" aria-current={location.pathname.startsWith('/advisor') ? 'page' : undefined} className={mobileTabClass(location.pathname.startsWith('/advisor'))}>
            <Mic className="w-5 h-5 mb-0.5" aria-hidden="true" />
            <span>Advisor</span>
          </Link>
          <Link
            to="/guides"
            aria-current={location.pathname.startsWith('/guides') || location.pathname.startsWith('/pests') ? 'page' : undefined}
            className={mobileTabClass(
              location.pathname.startsWith('/guides') || location.pathname.startsWith('/pests')
            )}
          >
            <BookOpen className="w-5 h-5 mb-0.5" aria-hidden="true" />
            <span>Advice</span>
          </Link>
          <Link to="/harvest" aria-current={location.pathname.startsWith('/harvest') ? 'page' : undefined} className={mobileTabClass(location.pathname.startsWith('/harvest') || location.pathname.startsWith('/marketplace'))}>
            <Store className="w-5 h-5 mb-0.5" aria-hidden="true" />
            <span>Market</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={mobileTabClass(menuOpen)}
            aria-label="Open full platform menu"
            aria-expanded={menuOpen}
            aria-controls="platform-menu"
          >
            <Menu className="w-5 h-5 mb-0.5" aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>
      </div>

      {/* Accessible Slide-Over Drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Platform menu"
          id="platform-menu"
          onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}
        >
          <div ref={drawerRef} className="w-full max-w-sm bg-white h-full overflow-y-auto overscroll-contain p-5 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-[#183B2B]/10 pb-4">
                <div className="flex items-center gap-2 font-display font-bold text-[#183B2B]">
                  <Sprout className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                  <span>Agriccare Menu</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#F3F8F0]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grouped navigation: the eight problem-statement modules keep their numbers and names. */}
              <nav aria-label="All pages" className="space-y-4">
                {[
                  {
                    title: 'Start here',
                    items: [
                      {to: '/today', label: 'Farmers: my farm today', icon: Home},
                      {to: '/harvest', label: 'Buyers: find harvest', icon: Store},
                      {to: '/harvest/sell', label: 'Farmers: sell my harvest', icon: Sprout},
                      {to: '/expert', label: 'Experts: workspace (sign in)', icon: UserCheck},
                      {to: '/ministry', label: 'Ministry: aggregate workspace', icon: BarChart3},
                      {to: '/demo/farm-to-market', label: 'Presenter walkthrough', icon: Presentation},
                    ],
                  },
                  {
                    title: 'Guidance & basic-phone demo',
                    items: [
                      {to: '/check-my-crop', label: 'Check my crop (simulated)', icon: Sprout},
                      {to: '/guidance', label: 'Planting, harvest & storage', icon: BookOpen},
                      {to: '/ussd-demo', label: 'Basic phone: USSD simulator', icon: PhoneCall},
                    ],
                  },
                  {
                    title: 'Learn',
                    items: [
                      {to: '/crops', label: '7. Crops Library (9 Crops)', icon: Sprout},
                      {to: '/livestock', label: '8. Livestock & Fish Farming', icon: Fish},
                      {to: '/pests', label: '3. Pests & Diseases Library', icon: Bug},
                      {to: '/soil', label: '6. Soil & Fertilizer Advisory', icon: Layers},
                      {to: '/guides', label: '16-Topic Knowledge Center', icon: BookOpen},
                      {to: '/weather', label: '2. Weather Info (Sample)', icon: CloudRain},
                    ],
                  },
                  {
                    title: 'Ask & Sell',
                    items: [
                      {to: '/advisor', label: 'AI Agricultural Advisor', icon: Mic},
                      {to: '/experts', label: 'Ask an Agricultural Expert', icon: Users},
                      {to: '/marketplace', label: '1. Agricultural Marketplace', icon: Store},
                    ],
                  },
                  {
                    title: 'Saved on this phone',
                    items: [
                      {to: '/offline', label: 'Offline Saved Library', icon: Download},
                      {to: '/downloads', label: 'My Offline Downloads', icon: Download},
                    ],
                  },
                  {
                    title: 'Programme & demo views',
                    items: [
                      {to: '/demo', label: 'Hackathon Demo Mode (4 Journeys)', icon: Presentation},
                      {to: '/ministry', label: '5. Ministry workspace (aggregate demo)', icon: BarChart3},
                      {to: '/language-lab', label: '4. Local Language Lab', icon: Languages},
                      {to: '/phone-simulator', label: '4b. Simulated Phone Service', icon: PhoneCall},
                      {to: '/dashboard', label: 'Farmer Dashboard (Demo)', icon: LayoutDashboard},
                      {to: '/management', label: 'Prototype Admin & Review', icon: ShieldCheck},
                    ],
                  },
                  {
                    title: 'About',
                    items: [
                      {to: '/coming-soon', label: 'Coming Soon Innovations', icon: Sparkles},
                      {to: '/about', label: 'About Team 8 Platform', icon: Info},
                      {to: '/contact', label: 'Contact & Feedback', icon: MessageSquare},
                    ],
                  },
                ].map((group) => (
                  <div key={group.title} className="space-y-1">
                    <h3 className="px-1 pb-1 text-sm font-bold uppercase tracking-wide text-[#16803C]">{group.title}</h3>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMenuOpen(false)}
                          aria-current={location.pathname === item.to ? 'page' : undefined}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[48px] text-base font-medium text-[#183B2B] hover:bg-[#F3F8F0] ${
                            location.pathname === item.to ? 'bg-[#DDEFE0]' : ''
                          }`}
                        >
                          <Icon className="w-5 h-5 text-[#16803C] shrink-0" aria-hidden="true" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>

              {/* Accessibility Quick Switches */}
              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Smart Listen Mode</span>
                  <button
                    type="button"
                    onClick={toggleListenMode}
                    aria-label="Smart Listen Mode"
                    aria-pressed={listenMode}
                    className={`min-h-[44px] px-3 rounded-xl text-xs font-bold ${
                      listenMode ? 'bg-[#16803C] text-white' : 'bg-white border border-[#183B2B]/15 text-[#183B2B]'
                    }`}
                  >
                    {listenMode ? 'Enabled' : 'Turn On'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Low-Bandwidth Mode</span>
                  <button
                    type="button"
                    onClick={toggleLowBandwidth}
                    aria-label="Low-Bandwidth Mode"
                    aria-pressed={lowBandwidth}
                    className={`min-h-[44px] px-3 rounded-xl text-xs font-bold ${
                      lowBandwidth ? 'bg-[#F5B942] text-[#183B2B]' : 'bg-white border border-[#183B2B]/15 text-[#183B2B]'
                    }`}
                  >
                    {lowBandwidth ? 'On' : 'Off'}
                  </button>
                </div>
                <PWAInstallButton />
              </div>

              {/* Language Switcher */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#183B2B]/70">
                  <Globe className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                  <span>Language Preference</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => void setLanguage(opt.code)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border min-h-[44px] transition-colors ${
                        language === opt.code
                          ? 'bg-[#DDEFE0] border-[#16803C] text-[#183B2B] font-semibold'
                          : 'bg-white border-[#183B2B]/15 text-[#183B2B]/85 hover:bg-[#F3F8F0]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          {opt.shortCode} · {opt.name}
                        </span>
                        <span className="text-xs text-[#183B2B]/65">
                          {opt.status === 'active'
                            ? 'Active'
                            : opt.status === 'preview'
                            ? 'Prototype'
                            : 'Soon'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Account & Role Links */}
              <div className="space-y-1 border-t border-[#183B2B]/10 pt-4">
                {user ? (
                  <>
                    <div className="px-3 pb-2">
                      <p className="text-sm font-bold text-[#183B2B]">{user.displayName}</p>
                      <p className="text-xs text-[#183B2B]/70">
                        {user.county} County · {user.roles.join(', ')}
                      </p>
                    </div>
                    <Link
                      to="/farmer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px] text-sm font-medium hover:bg-[#F3F8F0]"
                    >
                      <LayoutDashboard className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                      <span>Farmer Account</span>
                    </Link>
                    <Link
                      to="/account/security"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px] text-sm font-medium hover:bg-[#F3F8F0]"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                      <span>Account Security</span>
                    </Link>
                    {isExpert && (
                      <Link
                        to="/expert"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px] text-sm font-medium hover:bg-[#F3F8F0]"
                      >
                        <UserCheck className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                        <span>Expert Workspace</span>
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px] text-sm font-medium hover:bg-[#F3F8F0]"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                        <span>Administrator Console</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl min-h-[44px] text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" />
                      <span>Sign Out</span>
                    </button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630]"
                    >
                      <LogIn className="w-4 h-4" aria-hidden="true" />
                      <span>Sign In</span>
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMenuOpen(false)}
                      className="min-h-[44px] flex items-center justify-center rounded-xl border border-[#16803C] text-[#16803C] text-sm font-semibold hover:bg-[#DDEFE0]"
                    >
                      Register
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, {useEffect} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {ArrowLeft} from 'lucide-react';
import {BrandLogo} from '../../components/BrandLogo';
import {UssdPhone} from '../../components/ussd/UssdPhone';
import {DEFAULT_TIMEOUT_S} from '../../lib/ussd/engine';
import {useEnvironment} from '../../lib/useEnvironment';

/**
 * The QR-code destination (/ussd): ONLY the Agricare Liberia mark, the phone simulator and a button back to the website. It is rendered by App's Shell
 * WITHOUT the website layout (no header, menu, footer, banners or install prompts) and without explanatory sections or links into the site.
 * Everything the simulator does (dialing, voice, speed, registration, marketplace) is the same component as on /ussd-demo.
 */
export const UssdOnlyPage: React.FC = () => {
  const [params] = useSearchParams(); const env = useEnvironment();
  const t = Number(params.get('timeout')); const timeout = Number.isInteger(t) && t >= 5 && t <= 300 ? t : DEFAULT_TIMEOUT_S;
  useEffect(() => { const before = document.title; document.title = 'USSD simulator | Agricare Liberia'; return () => { document.title = before; }; }, []);
  return (
    <div className="min-h-[100dvh] bg-[#F3F8F0] text-[#183B2B] flex flex-col items-center" data-testid="ussd-only-page">
      <header className="w-full max-w-[440px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 flex items-center gap-3">
        <BrandLogo variant="mark" decorative className="h-8" />
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight">Agricare Liberia</h1>
          <p className="text-xs font-semibold text-[#183B2B]/75" data-testid="ussd-only-label">Phone simulation · no mobile network{env?.demoEnvironment ? ' · demo data only' : ''}</p>
        </div>
      </header>
      <main className="w-full max-w-[440px] flex-1 px-2 pb-3">
        <UssdPhone compact timeoutSeconds={timeout} />
      </main>
      <footer className="w-full max-w-[440px] px-4 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link to="/" data-testid="ussd-back-to-site" className="mx-auto inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-[#183B2B]/25 bg-white px-4 text-sm font-bold text-[#183B2B] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16803C]/40">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to website
        </Link>
      </footer>
    </div>
  );
};

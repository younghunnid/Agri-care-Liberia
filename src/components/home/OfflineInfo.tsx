import React from 'react';
import {Link} from 'react-router-dom';
import {Download, WifiOff} from 'lucide-react';
import {getOfflineGuides} from '../../lib/offlineStorage';
import {PWAInstallButton} from '../PWAInstallButton';
import {StatusLabel} from '../StatusLabel';

/** One compact, accurate statement of what works without a connection. Nothing here claims the whole site works offline. */
export const OfflineInfo: React.FC = () => {
  const count = getOfflineGuides().length;
  return (
    <section aria-labelledby="home-offline-heading" className="mx-auto max-w-7xl px-4 sm:px-6" data-testid="home-offline">
      <div className="grid gap-5 rounded-2xl border border-[#16803C]/20 bg-[#EAF7EC] p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-[#0F5C2A]"><WifiOff className="h-5 w-5" aria-hidden /> Offline access</p>
          <h2 id="home-offline-heading" className="font-display text-2xl font-extrabold text-[#183B2B]">What works with and without internet</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/offline" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#16803C] px-5 text-sm font-semibold text-white hover:bg-[#116630]"><Download className="h-4 w-4" aria-hidden /> Offline Library ({count})</Link>
            <PWAInstallButton />
          </div>
        </div>
        <ul className="space-y-2 text-sm leading-relaxed text-[#183B2B]/90">
          <li><strong>Essential guidance</strong> works offline once it has been downloaded or saved on your phone.</li>
          <li><strong>Harvest drafts</strong> can be saved on your phone and sent when you are back online.</li>
          <li><strong>The USSD demo</strong> is a simulator in your browser. It is not a live Orange or MTN shortcode.</li>
          <li><strong>Marketplace messages and replies</strong> need a connection.</li>
          <li className="flex flex-wrap gap-2 pt-1"><StatusLabel kind="simulated" text="Hackathon demonstration" /><StatusLabel kind="draft" text="Advice awaiting expert review" /></li>
        </ul>
      </div>
    </section>
  );
};

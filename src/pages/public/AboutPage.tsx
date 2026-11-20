import React from 'react';
import {Link} from 'react-router-dom';
import {Globe, Shield, Sprout, WifiOff} from 'lucide-react';
import {LANGUAGE_OPTIONS} from '../../lib/i18n';

export const AboutPage: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-10 space-y-4">
        <p className="text-xs font-semibold text-[#16803C]">Team 8 · Phase 1 Hackathon Foundation</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#183B2B]">
          Inclusive Agricultural e-Advisory Platform
        </h1>
        <p className="text-base text-[#183B2B]/85 leading-relaxed max-w-3xl">
          <strong>Agriccare Liberia</strong> is built by Team 8 to solve a practical challenge across Liberia’s 15 counties: helping smallholder farmers get timely, clear, and trustworthy agricultural guidance—even on low-connectivity farms or across local language preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2.5">
          <WifiOff className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold">Offline-Ready Guides</h2>
          <p className="text-sm text-[#183B2B]/80 leading-relaxed">
            Published crop guides can be downloaded in advance and read without mobile data. We clearly state what works offline and what requires internet.
          </p>
        </div>
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2.5">
          <Shield className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold">Honest Advisory Guardrails</h2>
          <p className="text-sm text-[#183B2B]/80 leading-relaxed">
            Sample demonstration guides are labeled transparently until reviewed by qualified agronomists. AI advice states uncertainty and avoids fabricated citations.
          </p>
        </div>
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2.5">
          <Sprout className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
          <h2 className="font-display text-lg font-bold">Strictly Advisory Focus</h2>
          <p className="text-sm text-[#183B2B]/80 leading-relaxed">
            This platform is completely isolated and dedicated solely to farming knowledge, AI guidance, and expert support—with zero marketplace, payment, or inventory clutter.
          </p>
        </div>
      </div>

      <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2 text-[#16803C] font-semibold text-sm">
          <Globe className="w-5 h-5" aria-hidden="true" />
          <span>Local Language Foundation</span>
        </div>
        <h2 className="font-display text-2xl font-bold text-[#183B2B]">Language Support &amp; Review Policy</h2>
        <p className="text-sm text-[#183B2B]/80 leading-relaxed max-w-3xl">
          We never invent unreviewed translations. Only reviewed strings appear in Liberian English preview mode, while unreviewed guides and upcoming languages fall back safely to Standard English.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <div key={lang.code} className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
              <div className="flex items-center justify-between text-sm font-bold text-[#183B2B]">
                <span>
                  {lang.shortCode} · {lang.name}
                </span>
                <span className="text-xs font-semibold text-[#16803C]">
                  {lang.status === 'active'
                    ? 'Active'
                    : lang.status === 'preview'
                    ? 'Reviewed Preview'
                    : 'Coming Soon'}
                </span>
              </div>
              <p className="text-xs text-[#183B2B]/75">{lang.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/guides"
          className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630]"
        >
          Explore Crop Guides
        </Link>
        <Link
          to="/contact"
          className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl border border-[#183B2B]/20 text-sm font-semibold hover:bg-white"
        >
          Contact Team 8
        </Link>
      </div>
    </div>
  );
};

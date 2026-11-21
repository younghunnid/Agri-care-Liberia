import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, BookOpen, MessageSquare, Smartphone} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {HERO_IMAGE} from '../../data/homeHero';
import {BrandLogo} from '../BrandLogo';

/**
 * Full-width hero.
 *  - Desktop and tablet (md and up): the photograph fills the section behind a dark-green gradient that is strongest under the text.
 *  - Phones: the whole photograph is shown at the top (same ratio, never stretched) and fades into solid green, so the headline sits on a plain,
 *    high-contrast background instead of on a busy picture.
 *  - Low-Data Mode skips the photograph and keeps the green background.
 */
export const HeroSection: React.FC = () => {
  const {lowBandwidth} = useApp();
  return (
    <section aria-labelledby="home-hero-heading" className="relative isolate overflow-hidden bg-[#0B3D1E] text-white" data-testid="home-hero">
      {!lowBandwidth && (
        <>
          <img
            src={HERO_IMAGE.src}
            srcSet={HERO_IMAGE.srcSet}
            sizes={HERO_IMAGE.sizes}
            alt={HERO_IMAGE.alt}
            width={HERO_IMAGE.width}
            height={HERO_IMAGE.height}
            fetchPriority="high"
            decoding="async"
            className="absolute inset-x-0 top-0 -z-20 h-[58vw] w-full max-h-[430px] object-cover object-center md:inset-0 md:h-full md:max-h-none md:object-[60%_35%]"
          />
          <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[58vw] max-h-[430px] bg-gradient-to-b from-[#0B3D1E]/20 via-transparent to-[#0B3D1E] md:hidden" />
          <div aria-hidden className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-[#0B3D1E]/95 via-[#0B3D1E]/80 to-[#0B3D1E]/10 md:block" />
        </>
      )}
      <div className={`mx-auto max-w-7xl px-4 pb-14 sm:px-6 md:pb-20 md:pt-14 lg:pb-24 lg:pt-16 ${lowBandwidth ? 'pt-10' : 'pt-[min(52vw,390px)]'}`}>
        <div className="max-w-xl space-y-5 motion-safe:animate-[agri-fade-up_0.6s_ease-out_both] lg:max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-2 pr-3 text-sm font-bold text-[#183B2B]">
            <BrandLogo className="h-6" decorative /> Agricare Liberia
          </p>
          <h1 id="home-hero-heading" className="max-w-2xl font-display text-4xl font-extrabold leading-[1.1] text-balance sm:text-5xl lg:text-6xl">
            Practical Farming Help, <span className="text-[#A8E86B]">Online or Offline</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/90 sm:text-lg">
            Get simple, practical advice, step-by-step guides, and market support for everyday farming in Liberia.
          </p>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
            <Link to="/advisor" className="group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#22A04B] px-6 text-base font-bold text-white shadow-lg hover:bg-[#1B8A3F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <MessageSquare className="h-5 w-5" aria-hidden /> Get Farming Advice <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link to="/guides" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-white/80 bg-white/10 px-6 text-base font-bold text-white backdrop-blur-sm hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <BookOpen className="h-5 w-5" aria-hidden /> Explore Knowledge &amp; Guides
            </Link>
            <Link to="/ussd-demo" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#F5B942] px-6 text-base font-bold text-[#183B2B] hover:bg-[#f7c55f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <Smartphone className="h-5 w-5" aria-hidden /> Try USSD
            </Link>
          </div>
          <p className="text-sm text-white/80">The USSD option is a browser simulation of a basic-phone menu. It is not a live telecom service.</p>
        </div>
      </div>
    </section>
  );
};

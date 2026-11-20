import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, BookOpen, MessageSquare, Smartphone, Sprout} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {HERO_IMAGE} from '../../data/homeHero';

/** Full-width hero. Low-Data Mode skips the photograph and keeps the gradient, so the page stays light on slow connections. */
export const HeroSection: React.FC = () => {
  const {lowBandwidth} = useApp();
  return (
    <section aria-labelledby="home-hero-heading" className="relative isolate overflow-hidden bg-[#0B3D1E] text-white" data-testid="home-hero">
      {!lowBandwidth && (
        <img
          src={HERO_IMAGE.src}
          srcSet={HERO_IMAGE.srcSet}
          sizes={HERO_IMAGE.sizes}
          alt={HERO_IMAGE.alt}
          width={1280}
          height={715}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          style={{objectPosition: HERO_IMAGE.position}}
        />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0B3D1E]/95 via-[#0B3D1E]/75 to-[#0B3D1E]/25 max-md:from-[#0B3D1E]/90 max-md:via-[#0B3D1E]/80 max-md:to-[#0B3D1E]/60" />
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 md:pb-20 md:pt-14 lg:pb-24 lg:pt-16">
        <div className="max-w-3xl space-y-5 motion-safe:animate-[agri-fade-up_0.6s_ease-out_both]">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur-sm">
            <Sprout className="h-4 w-4 text-[#A8E86B]" aria-hidden /> Agriccare Liberia
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

import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, BookOpen} from 'lucide-react';

export const KnowledgeCta: React.FC = () => (
  <section aria-labelledby="home-cta-heading" className="mx-auto max-w-7xl px-4 sm:px-6">
    <div className="flex flex-col items-start gap-5 rounded-3xl bg-gradient-to-r from-[#0B3D1E] to-[#1B7A3A] p-6 text-white sm:p-8 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-4">
        <BookOpen className="mt-1 hidden h-10 w-10 shrink-0 text-white/90 sm:block" aria-hidden />
        <div className="space-y-2">
          <h2 id="home-cta-heading" className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">Get Full Crop &amp; Plant Guidance in <span className="text-[#A8E86B]">Farming Knowledge &amp; Guides</span></h2>
          <p className="max-w-xl text-sm text-white/85">Step-by-step planting, crop care, pest and disease, and harvesting guides for the main crops in Liberia.</p>
        </div>
      </div>
      <Link to="/guides" className="group inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl bg-[#A8E86B] px-6 text-sm font-bold text-[#0B3D1E] hover:bg-[#b9f07f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        Explore Knowledge &amp; Guides <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
      </Link>
    </div>
  </section>
);

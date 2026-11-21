import React from 'react';
import {Link} from 'react-router-dom';
import {Clock, Sparkles} from 'lucide-react';
import {COMING_SOON_FEATURES} from '../../data/comingSoonFeatures';
import {SpeakButton} from '../../components/SpeakButton';

const GROUPS: Array<
  'Weather & Field Tech' | 'Voice & Local Languages' | 'Market & Logistics' | 'Learning & Records'
> = ['Voice & Local Languages', 'Weather & Field Tech', 'Market & Logistics', 'Learning & Records'];

export const ComingSoonPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          <span>Post-Hackathon Product Roadmap · Transparent Status</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
          Coming Soon Agricultural Innovations
        </h1>
        <p className="text-sm sm:text-base text-white/85 max-w-3xl leading-relaxed">
          Every feature below is honestly labeled <strong>Coming Soon</strong>. Team 8 does not simulate rainfall alerts by SMS or voice, livestock prescriptions, verified daily market prices, or automated Bassa/Mano speech AI without real partnerships.
        </p>
      </div>

      {GROUPS.map((group) => {
        const items = COMING_SOON_FEATURES.filter((f) => f.category === group);
        return (
          <section key={group} className="space-y-4">
            <h2 className="font-display text-xl font-bold text-[#183B2B]">{group}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((feat) => (
                <article
                  key={feat.id}
                  className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 sm:p-6 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Coming Soon</span>
                      </span>
                      <SpeakButton
                        compact
                        id={`cs-${feat.id}`}
                        label={feat.title}
                        text={`${feat.title}. Coming soon. Why it helps farmers: ${feat.farmerValue}. Post hackathon plan: ${feat.postHackathonPlan}`}
                      />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#183B2B]">{feat.title}</h3>
                    <p className="text-sm text-[#183B2B]/85 leading-relaxed">
                      <strong>Farmer Value:</strong> {feat.farmerValue}
                    </p>
                  </div>
                  <p className="text-xs text-[#183B2B]/70 pt-3 border-t border-[#183B2B]/10">
                    <strong>Post-Hackathon Plan:</strong> {feat.postHackathonPlan}
                  </p>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      <div className="rounded-3xl bg-[#DDEFE0] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[#183B2B]">
            Explore What Already Works Today
          </h2>
          <p className="text-sm text-[#183B2B]/80">
            Jump into our guided judge demo or try the working AI Advisor, Knowledge Center, and Marketplace.
          </p>
        </div>
        <Link
          to="/demo"
          className="min-h-[44px] inline-flex items-center px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630]"
        >
          Open Hackathon Demo Mode
        </Link>
      </div>
    </div>
  );
};

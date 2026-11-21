import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {AdviceCardView} from '../../components/advice/AdviceCardView';
import {StatusLabel} from '../../components/StatusLabel';
import {adviceClient} from '../../lib/triageApp';
import type {CardFullView, CardSource} from '../../lib/adviceCardsClient';

/** One advice card. Opens from the server, from the copy saved on this phone, or from the demonstration copy built into the app. */
export const AdviceCardPage: React.FC = () => {
  const {ref = ''} = useParams();
  const [state, setState] = useState<{card: CardFullView; source: CardSource; savedAt?: string} | 'loading' | 'missing'>('loading');
  useEffect(() => {
    let live = true;
    setState('loading');
    void adviceClient.getCard(ref).then((r) => { if (live) setState(r ? {card: r.data, source: r.source, savedAt: r.savedAt} : 'missing'); });
    return () => { live = false; };
  }, [ref]);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4" data-testid="advice-card-page">
      <Link to="/advice-cards" className="inline-flex items-center min-h-[44px] font-bold text-[#0F5C2A] underline">Back to advice cards</Link>
      <div className="flex flex-wrap gap-2"><StatusLabel kind="draft" /><StatusLabel kind="simulated" text="Demonstration content" /></div>
      {state === 'loading' && <p className="text-base text-[#183B2B]/80" role="status">Loading the advice card...</p>}
      {state === 'missing' && <p className="text-base font-bold text-[#183B2B]" role="alert">There is no advice card with the reference "{ref}".</p>}
      {typeof state === 'object' && <AdviceCardView card={state.card} source={state.source} savedAt={state.savedAt} headingLevel={1} />}
    </div>
  );
};

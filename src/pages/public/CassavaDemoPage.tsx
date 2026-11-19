import React from 'react';
import {Link} from 'react-router-dom';
import {StatusLabel} from '../../components/StatusLabel';
import type {StatusKind} from '../../lib/statusLabels';

interface Step {n: number; text: string; to?: string; kinds: StatusKind[]; note: string}

/** Presenter's script for the Bong County cassava farmer demonstration. Each step says honestly what is real and what is simulated. */
export const DEMO_STEPS: Step[] = [
  {n: 1, text: 'Open Agri-Advisory Liberia on a phone', to: '/', kinds: ['working'], note: 'Home shows the four groups.'},
  {n: 2, text: 'Select cassava (county: Bong)', to: '/advice/crop-problems?demo=1', kinds: ['working'], note: 'Rice, pepper, plantain and vegetables are shown as future.'},
  {n: 3, text: 'Report yellowing leaves (yellow-green, patchy, curled)', to: '/advice/crop-problems?demo=1', kinds: ['working'], note: 'The demo link pre-ticks this sign; the presenter can tick others.'},
  {n: 4, text: 'Read possible causes and first-response advice', to: '/advice/crop-problems?demo=1', kinds: ['working', 'draft'], note: 'Draft advice. NOT reviewed by an agricultural expert and NOT a diagnosis.'},
  {n: 5, text: 'Save the advice for offline reading', to: '/advice/crop-problems?demo=1', kinds: ['working'], note: 'Stored in the phone\'s IndexedDB.'},
  {n: 6, text: 'Turn off the internet and open the saved advice', to: '/advice/crop-problems', kinds: ['working'], note: 'Saved list is at the bottom of the same page. Needs the app installed or opened once online.'},
  {n: 7, text: 'Draft a question for an expert (still offline)', to: '/experts', kinds: ['working'], note: 'Use the "Ask an agricultural expert" button; the form is pre-filled.'},
  {n: 8, text: 'Reconnect: the question is sent', to: '/experts?tab=dashboard', kinds: ['working'], note: 'Existing offline queue and sync. Under "Your requests" the status reads Waiting for an expert.'},
  {n: 9, text: 'An expert answers in the demonstration dashboard', to: '/experts?tab=dashboard', kinds: ['simulated'], note: 'The reply is typed by the presenter. Status changes to Answered and the reply is labelled "Simulated demo reply". It is not verified advice from a real agronomist.'},
  {n: 10, text: 'Open the related cassava lesson and take its quiz', to: '/learn/cassava-basics', kinds: ['working', 'draft'], note: 'Short lesson, 4-question quiz with scores and explanations. Progress is saved offline. Team 8 draft content.'},
  {n: 11, text: 'Open the farm cost and profit calculator', to: '/tools/calculator', kinds: ['working'], note: 'Example: costs L$5,000, sales L$8,000, estimated profit L$3,000.'},
];

export const CassavaDemoPage: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5" data-testid="cassava-demo-page">
    <header className="space-y-2">
      <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Demo: a cassava farmer in Bong County</h1>
      <p className="text-base text-[#183B2B]/80">Follow the eleven steps. The labels say what is working, simulated, draft or future. Use the synthetic demo farmer, never a real farmer's data.</p>
      <div className="flex flex-wrap gap-2 text-xs">{(['working', 'simulated', 'draft', 'future'] as StatusKind[]).map((k) => <StatusLabel key={k} kind={k} />)}</div>
    </header>
    <ol className="space-y-3">
      {DEMO_STEPS.map((s) => (
        <li key={s.n} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2">
          <p className="text-base font-extrabold text-[#183B2B]"><span className="text-[#16803C]">Step {s.n}.</span> {s.text}</p>
          <div className="flex flex-wrap gap-1.5">{s.kinds.map((k) => <StatusLabel key={k} kind={k} />)}</div>
          <p className="text-sm text-[#183B2B]/75">{s.note}</p>
          {s.to && <Link to={s.to} className="inline-flex items-center min-h-[44px] rounded-xl bg-[#16803C] text-white text-sm font-bold px-4">Open this step</Link>}
        </li>
      ))}
    </ol>
    <section className="rounded-2xl bg-[#F3F8F0] border border-[#16803C]/25 p-4 space-y-1 text-sm text-[#183B2B]/85">
      <p className="font-bold">Say this at the end</p>
      <p><strong>Working:</strong> crop problem guide, saving offline, offline questions and sending, calculator.</p>
      <p><strong>Simulated:</strong> expert replies, weather, sample market listings.</p>
      <p><strong>Draft:</strong> all agricultural advice is Team 8 draft until an expert reviews it.</p>
      <p><strong>Future:</strong> other crops, emergency guidance, community, support directory, local languages, SMS and USSD.</p>
    </section>
  </div>
);

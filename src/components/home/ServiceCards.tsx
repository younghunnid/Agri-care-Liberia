import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, BookOpen, MessageSquare, Smartphone, Sprout, Store} from 'lucide-react';

type Icon = React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>;
const SERVICES: {to: string; title: string; text: string; icon: Icon; tile: string; card: string; testId?: string}[] = [
  {to: '/today', title: 'My Farm Today', text: 'Choose your county and crops to see planting and storage reminders.', icon: Sprout, tile: 'bg-[#16A34A] text-white', card: 'bg-[#EAF7EC]', testId: 'home-today'},
  {to: '/advisor', title: 'Ask Agricultural Advisor', text: 'Ask a farming question. Bundled text guidance works offline.', icon: MessageSquare, tile: 'bg-[#0F9D8A] text-white', card: 'bg-[#E6F6F3]'},
  {to: '/guides', title: 'Farming Knowledge & Guides', text: 'Full crop and plant guidance from planting to harvesting.', icon: BookOpen, tile: 'bg-[#F08A1C] text-white', card: 'bg-[#FFF3E2]'},
  {to: '/harvest', title: 'Find Harvest / Marketplace', text: 'Browse harvest by crop and county. Questions and replies need a connection; no payments.', icon: Store, tile: 'bg-[#2F7FD8] text-white', card: 'bg-[#E8F1FC]'},
  {to: '/ussd-demo', title: 'Basic Phone / USSD Demo', text: 'Try a menu-based phone experience in your browser. Not a live telecom service.', icon: Smartphone, tile: 'bg-[#7A4FD0] text-white', card: 'bg-[#F1EAFC]'},
];

export const ServiceCards: React.FC = () => (
  <section aria-labelledby="home-services-heading" className="relative z-10 mx-auto -mt-10 max-w-7xl px-4 sm:px-6 md:-mt-12">
    <h2 id="home-services-heading" className="sr-only">Essential services</h2>
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {SERVICES.map(({to, title, text, icon: Icon, tile, card, testId}, i) => (
        <li key={to} className={i === SERVICES.length - 1 ? 'sm:col-span-2 lg:col-span-1' : undefined}>
          <Link to={to} {...(testId ? {'data-testid': testId} : {})} className={`group flex h-full min-h-[148px] flex-col gap-3 rounded-2xl border border-[#183B2B]/10 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16803C] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${card}`}>
            <span className="flex items-center gap-3">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`}><Icon className="h-6 w-6" aria-hidden /></span>
              <span className="font-display text-base font-extrabold leading-snug text-[#183B2B]">{title}</span>
            </span>
            <span className="flex flex-1 items-end justify-between gap-2">
              <span className="text-sm leading-snug text-[#183B2B]/80">{text}</span>
              <ArrowRight className="h-5 w-5 shrink-0 text-[#183B2B] transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
);

import React from 'react';
import {Link} from 'react-router-dom';
import {DemoQr} from '../../components/ussd/DemoQr';
import {BrandLogo} from '../../components/BrandLogo';

export const UssdPosterPage: React.FC = () => (
  <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
    <div className="flex flex-wrap gap-3 print:hidden"><button type="button" onClick={() => window.print()} className="agri-button">Print poster</button><Link to="/ussd-demo" className="agri-button-secondary">Back to the simulator</Link></div>
    <article data-qr-poster className="bg-white rounded-3xl p-5 sm:p-8 space-y-5 text-center">
      <BrandLogo className="mx-auto h-24" />
      <p className="text-lg font-bold text-[#0F5C2A]">Team 8 · Agricare Liberia</p>
      <h1 className="font-display text-3xl font-extrabold">Farming guidance and a basic-phone experience</h1>
      <DemoQr poster />
      <p className="text-base">Read planting, pest, harvest and storage guidance. Try clearly labelled synthetic produce listings and inquiries when enabled by the presenter.</p>
      <p className="font-bold text-base">Demonstration only. No mobile network connection. English menus; other languages planned.</p>
      <p className="text-sm">Advice is demonstration content awaiting qualified agricultural review. First visit needs internet; cached guidance works offline.</p>
    </article>
  </div>
);

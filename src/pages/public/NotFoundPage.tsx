import React from 'react';
import {Link} from 'react-router-dom';
import {BrandLogo} from '../../components/BrandLogo';

export const NotFoundPage: React.FC = () => (
  <section className="max-w-xl mx-auto px-4 py-10 space-y-4" data-testid="not-found">
    <p className="flex items-center gap-2 text-sm font-bold text-[#0F5C2A]"><BrandLogo className="h-8" decorative /> Agricare Liberia</p>
    <h1 className="font-display text-3xl font-extrabold">We could not find that page</h1>
    <p className="text-base">The link may be old or incomplete. Choose a starting point to continue.</p>
    <nav aria-label="Find your way" className="flex flex-wrap gap-3">
      <Link to="/" className="agri-button">Home</Link>
      <Link to="/today" className="agri-button-secondary">My farm today</Link>
      <Link to="/harvest" className="agri-button-secondary">Find harvest</Link>
    </nav>
  </section>
);

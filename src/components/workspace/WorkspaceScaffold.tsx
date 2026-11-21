import React, {useEffect, useRef, useState} from 'react';
import {Link, NavLink, useLocation} from 'react-router-dom';
import {ArrowLeft, Menu, X} from 'lucide-react';
import {BrandLogo} from '../BrandLogo';

export interface WorkspaceItem {to: string; label: string; end?: boolean; icon?: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>}
export interface WorkspaceScaffoldProps {title: string; subtitle?: string; navItems: WorkspaceItem[]; actions?: React.ReactNode; children: React.ReactNode}

/** Route-aware workspace chrome. Other role layouts opt in; their current layout stays unchanged. */
export function WorkspaceScaffold({title, subtitle, navItems, actions, children}: WorkspaceScaffoldProps) {
  const [open, setOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const {pathname, search} = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)');
    const close = () => { if (mq.matches) setOpen(false); };
    mq.addEventListener('change', close); return () => mq.removeEventListener('change', close);
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...drawer.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? []].filter(e => e.getClientRects().length);
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {e.preventDefault(); setOpen(false);}
      if (e.key !== 'Tab') return;
      const all = controls(), first = all[0], last = all.at(-1);
      if (e.shiftKey && (document.activeElement === first || !drawer.current?.contains(document.activeElement))) {e.preventDefault();last?.focus();}
      else if (!e.shiftKey && document.activeElement === last) {e.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown', key);
    return () => {document.removeEventListener('keydown', key);document.body.style.overflow = overflow;previous?.focus({preventScroll: true});};
  }, [open]);
  const navigation = () => <>
    <Link to="/" className="flex min-h-[64px] items-center gap-3 border-b border-emerald-100 px-5 font-display text-base font-extrabold text-[#183B2B]"><BrandLogo className="h-10 shrink-0" decorative /><span>Agricare<span className="block text-xs font-medium text-[#52665B]">Liberia · Team 8</span></span></Link>
    <div className="px-5 pt-6 pb-3 text-xs font-bold uppercase tracking-wider text-[#52665B]">Ministry workspace</div>
    <nav aria-label="Ministry workspace" className="space-y-1 px-3 pb-4">{navItems.map(({icon: Icon, label, to, end}) => <NavLink key={to} to={{pathname:to, search}} end={end} onClick={() => setOpen(false)} className={({isActive}) => `flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? 'bg-[#16803C] text-white shadow-sm' : 'text-[#40554A] hover:bg-emerald-50 hover:text-[#0F5C2A]'}`}>
      {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}<span>{label}</span>
    </NavLink>)}</nav>
    <div className="mx-4 mt-auto rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-[#40554A]">Aggregate demonstration<br />No official statistics or farmer records.</div>
    <Link to="/today" className="m-3 flex min-h-[48px] items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[#0F5C2A]"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to farmer tools</Link>
  </>;
  return <div className="min-h-dvh bg-[#F5F7F6] text-[#183B2B]" data-testid="workspace-scaffold">
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]" inert={open || undefined}>
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-[#183B2B]/10 bg-white lg:flex">{navigation()}</aside>
      <div className="min-w-0">
        <header className="border-b border-[#183B2B]/10 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setOpen(true)} aria-label="Open Ministry navigation" aria-expanded={open} aria-controls="workspace-drawer" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#183B2B]/20 lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button><div className="min-w-0"><p className="text-xs font-semibold text-[#52665B]">Ministry / Agricultural insights</p><h1 className="font-display text-xl font-extrabold sm:text-2xl">{title}</h1></div></div>
            {actions && <div className="w-full lg:w-auto">
              <button type="button" className="agri-button-secondary lg:hidden" aria-expanded={controlsOpen} aria-controls="workspace-display-controls" onClick={() => setControlsOpen(!controlsOpen)}>Language & display controls</button>
              <div id="workspace-display-controls" className={`${controlsOpen ? 'flex' : 'hidden'} mt-2 flex-wrap items-center gap-2 lg:mt-0 lg:flex`}>{actions}</div>
            </div>}
          </div>
          {subtitle && <p className="mt-2 max-w-3xl text-sm text-[#52665B]">{subtitle}</p>}
        </header>
        <div className="mx-auto min-w-0 max-w-[1600px] space-y-5 px-4 py-5 sm:px-6 lg:py-6">{children}</div>
      </div>
    </div>
    {open && <div className="fixed inset-0 z-[70] bg-black/40 lg:hidden" onClick={() => setOpen(false)}><div id="workspace-drawer" ref={drawer} role="dialog" aria-modal="true" aria-label="Ministry navigation" onClick={e => e.stopPropagation()} className="flex h-full w-[min(288px,calc(100vw-32px))] flex-col overflow-y-auto bg-white shadow-xl"><button type="button" onClick={() => setOpen(false)} className="m-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#183B2B]/20" aria-label="Close Ministry navigation"><X className="h-5 w-5" aria-hidden /> Close</button>{navigation()}</div></div>}
  </div>;
}

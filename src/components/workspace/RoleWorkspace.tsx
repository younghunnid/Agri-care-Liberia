import React, {useEffect, useId, useState} from 'react';
import {Link, NavLink, useLocation} from 'react-router-dom';
import {
  BarChart3, BookOpen, Bookmark, ClipboardList, FileCheck2, Gauge, Handshake, Inbox, Leaf, LayoutDashboard, LifeBuoy, Lock, Menu, MessageSquare,
  Presentation, ScrollText, Settings, ShieldCheck, Smartphone, Sprout, Store, UserCog, UserRound, Users, WifiOff, X,
} from 'lucide-react';
import {useApp} from '../../context/AppContext';

type Icon = React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>;
export interface RoleNavItem {to: string; label: string; end?: boolean}
interface LinkGroup {heading: string; links: {to: string; label: string; icon: Icon}[]}
export type WorkspaceRole = 'farmer' | 'expert' | 'admin';

/** Role of the workspace a route belongs to, from the URL only. Authorization stays on the server and in ProtectedRoute. */
export function workspaceRoleFor(pathname: string): WorkspaceRole {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (pathname === '/expert' || pathname.startsWith('/expert/')) return 'expert';
  return 'farmer';
}

const ROLE_LABEL: Record<WorkspaceRole, string> = {farmer: 'Farmer workspace', expert: 'Expert workspace', admin: 'Administrator console'};

const NAV_ICONS: Record<string, Icon> = {
  '/farmer': LayoutDashboard, '/farmer/market': Store, '/farmer/saved': Bookmark, '/farmer/questions': MessageSquare, '/farmer/expert-requests': LifeBuoy, '/farmer/profile': UserRound,
  '/expert': LayoutDashboard, '/expert/questions': Inbox, '/expert/profile': UserRound,
  '/admin': Gauge, '/admin/farmers': Users, '/admin/experts': UserCog, '/admin/guides': Leaf, '/admin/reviews': FileCheck2, '/admin/questions': ClipboardList, '/admin/reports': ScrollText, '/admin/settings': Settings,
};

const LINK_GROUPS: Record<WorkspaceRole, LinkGroup[]> = {
  farmer: [
    {heading: 'Marketplace', links: [{to: '/harvest/sell', label: 'Sell a harvest', icon: Handshake}, {to: '/marketplace', label: 'Browse marketplace', icon: Store}]},
    {heading: 'Field tools', links: [{to: '/today', label: 'Today', icon: Sprout}, {to: '/check-my-crop', label: 'Check my crop', icon: Leaf}, {to: '/offline', label: 'Offline library', icon: WifiOff}, {to: '/ussd-demo', label: 'Basic-phone demo', icon: Smartphone}]},
    {heading: 'Account', links: [{to: '/account/security', label: 'Security', icon: Lock}, {to: '/account/devices', label: 'Trusted devices', icon: ShieldCheck}]},
  ],
  expert: [{heading: 'Reference', links: [{to: '/guides', label: 'Guides library', icon: BookOpen}, {to: '/advice-cards', label: 'Advice cards', icon: FileCheck2}]}, {heading: 'Account', links: [{to: '/account/security', label: 'Security', icon: Lock}]}],
  admin: [
    {heading: 'Demonstration', links: [{to: '/management', label: 'Prototype management', icon: Store}, {to: '/demo', label: 'Presenter mode', icon: Presentation}, {to: '/ministry', label: 'Ministry workspace', icon: BarChart3}]},
    {heading: 'Account', links: [{to: '/account/security', label: 'Security', icon: Lock}]},
  ],
};

/**
 * Sidebar + compact header for signed-in role workspaces. It renders inside the normal app chrome (account menu, offline banner, sign-out)
 * and only changes navigation layout; it does not grant or hide anything the server enforces.
 */
export const RoleWorkspace: React.FC<{kicker?: string; title: string; subtitle?: string; navItems: RoleNavItem[]; actions?: React.ReactNode; children: React.ReactNode}> = ({kicker, title, subtitle, navItems, actions, children}) => {
  const {pathname} = useLocation();
  const {user} = useApp();
  const role = workspaceRoleFor(pathname);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const itemClass = (active: boolean) => `flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-[#16803C] text-white shadow-sm' : 'text-[#40554A] hover:bg-emerald-50 hover:text-[#0F5C2A]'}`;
  const nav = (
    <nav aria-label={`${ROLE_LABEL[role]} navigation`} className="space-y-5">
      <ul className="space-y-1">
        {navItems.map((item) => { const Icon = NAV_ICONS[item.to]; return (
          <li key={item.to}><NavLink to={item.to} end={item.end} className={({isActive}) => itemClass(isActive)}>{Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}<span>{item.label}</span></NavLink></li>
        ); })}
      </ul>
      {LINK_GROUPS[role].map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-[#52665B]">{group.heading}</p>
          <ul className="space-y-1">{group.links.map(({to, label, icon: Icon}) => <li key={to}><Link to={to} className={itemClass(false)}><Icon className="h-5 w-5 shrink-0" aria-hidden /><span>{label}</span></Link></li>)}</ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6" data-testid="role-workspace" data-role={role}>
      <aside className="hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-[#183B2B]/10 bg-white p-3">
          <p className="px-3 pb-3 pt-1 text-xs font-bold uppercase tracking-wider text-[#52665B]">{ROLE_LABEL[role]}</p>
          {nav}
        </div>
      </aside>
      <div className="min-w-0 space-y-5">
        <header className="rounded-2xl border border-[#183B2B]/10 bg-white px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#52665B]">{ROLE_LABEL[role]} <span aria-hidden>/</span> {title}</p>
              <h1 className="font-display text-xl font-extrabold text-[#183B2B] sm:text-2xl">{title}</h1>
              {kicker && <p className="mt-0.5 text-xs font-semibold text-[#16803C]">{kicker}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {user && <span className="rounded-full bg-[#EDF5EF] px-3 py-1 text-xs font-semibold text-[#24543A]">{user.displayName}</span>}
              {actions}
              <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#183B2B]/20 px-3 text-sm font-semibold lg:hidden" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
                {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}<span>Workspace menu</span>
              </button>
            </div>
          </div>
          {subtitle && <p className="mt-2 max-w-3xl text-sm text-[#52665B]">{subtitle}</p>}
          <div id={menuId} hidden={!open} className="mt-3 border-t border-[#183B2B]/10 pt-3 lg:hidden">{open && nav}</div>
        </header>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
};

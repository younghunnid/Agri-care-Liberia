import React from 'react';
import {WorkspaceScaffold} from './workspace/WorkspaceScaffold';
import {RoleWorkspace} from './workspace/RoleWorkspace';
import {NavLink} from 'react-router-dom';

export interface WorkspaceNavItem {
  to: string;
  label: string;
  end?: boolean;
}

export const WorkspaceShell: React.FC<{
  kicker: string;
  title: string;
  subtitle?: string;
  navItems: WorkspaceNavItem[];
  children: React.ReactNode;
  layout?: 'role' | 'tabs' | 'sidebar';
}> = ({kicker, title, subtitle, navItems, children, layout = 'role'}) => {
  if (layout === 'role') return <RoleWorkspace kicker={kicker} title={title} subtitle={subtitle} navItems={navItems}>{children}</RoleWorkspace>;
  if (layout === 'sidebar') return <WorkspaceScaffold title={title} subtitle={subtitle} navItems={navItems}>{children}</WorkspaceScaffold>;
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#16803C]">{kicker}</p>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B]">{title}</h1>
        {subtitle && <p className="text-sm text-[#183B2B]/75">{subtitle}</p>}
      </div>

      <nav aria-label={`${title} navigation`} className="flex flex-wrap gap-2 border-b border-[#183B2B]/10 pb-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({isActive}) =>
              `min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-[#16803C] text-white'
                  : 'bg-white border border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div>{children}</div>
    </div>
  );
};

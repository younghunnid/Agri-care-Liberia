import React from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../../lib/api';
import {useResource} from '../../lib/useResource';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {MetricCard, PanelState, PublishedDataTable, SectionCard} from '../../components/workspace/DashboardBits';

export const ADMIN_NAV = [
  {to: '/admin', label: 'Overview', end: true},
  {to: '/admin/farmers', label: 'Farmers'},
  {to: '/admin/experts', label: 'Experts'},
  {to: '/admin/guides', label: 'Crop Guides'},
  {to: '/admin/reviews', label: 'Content Review'},
  {to: '/admin/questions', label: 'Questions'},
  {to: '/admin/reports', label: 'Reports & Audit Logs'},
  {to: '/admin/settings', label: 'Settings'},
];

interface AdminOverviewData {
  metrics: {farmers: number; experts: number; guidesPublished: number; guidesPending: number; questionsOpen: number; feedbackNew: number};
  recentAudits: Array<{id: number; actor_role: string; actor_name: string | null; action: string; target_type: string; target_id: string; created_at: string}>;
}

export const AdminOverviewPage: React.FC = () => {
  const {data, loading, error, reload} = useResource(() => apiFetch<AdminOverviewData>('/admin/overview'), []);
  const m = data?.metrics;
  const initial = loading && !data;
  const cards: {label: string; value?: number; note: string; to: string}[] = [
    {label: 'Farmers', value: m?.farmers, note: 'Accounts with the farmer role.', to: '/admin/farmers'},
    {label: 'Experts', value: m?.experts, note: 'Expert profiles.', to: '/admin/experts'},
    {label: 'Published guides', value: m?.guidesPublished, note: 'Approved and published.', to: '/admin/guides'},
    {label: 'Pending review', value: m?.guidesPending, note: 'Guides waiting for a review decision.', to: '/admin/reviews'},
    {label: 'Open questions', value: m?.questionsOpen, note: 'Submitted, assigned or awaiting clarification.', to: '/admin/questions'},
    {label: 'New feedback', value: m?.feedbackNew, note: 'Not yet triaged.', to: '/admin/reports'},
  ];

  return (
    <WorkspaceShell
      kicker="Administrator console · role protected on the server"
      title="Admin Overview"
      subtitle="Platform activity, content publication queues, and the security audit trail."
      navItems={ADMIN_NAV}
    >
      {error && <PanelState kind="error" title="Platform overview could not be loaded" onRetry={reload}>{error}</PanelState>}

      <section aria-label="Platform summary" className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#16803C]">
            <MetricCard label={c.label} loading={initial} value={c.value} source="Platform database" note={c.note} />
          </Link>
        ))}
      </section>

      <SectionCard title="Recent audit activity" description="The latest recorded administrative and security actions. Open Reports & Audit Logs for the full trail." actions={<Link to="/admin/reports" className="text-sm font-semibold text-[#16803C] hover:underline">Full audit log</Link>}>
        {initial ? <PanelState kind="loading" title="Loading audit activity…" />
          : !data ? <PanelState kind="unavailable" title="Audit activity unavailable">It could not be loaded. Nothing is shown rather than a made-up empty list.</PanelState>
          : data.recentAudits.length === 0 ? <PanelState kind="empty" title="No audit events recorded yet" />
          : <PublishedDataTable
              caption="Recent audit events"
              rows={data.recentAudits}
              columns={[
                {key: 'time', label: 'Time', value: (a) => a.created_at},
                {key: 'actor', label: 'Actor', value: (a) => a.actor_name || a.actor_role},
                {key: 'action', label: 'Action', value: (a) => a.action},
                {key: 'target', label: 'Target', value: (a) => `${a.target_type} #${a.target_id}`},
              ]}
            />}
      </SectionCard>

      <SectionCard title="Prototype and demonstration tools" description="Voice clips, marketplace moderation and presenter tools live in the prototype console.">
        <div className="flex flex-wrap gap-2">
          <Link to="/management" className="inline-flex min-h-[44px] items-center rounded-xl bg-[#16803C] px-4 text-sm font-bold text-white">Prototype management console</Link>
          <Link to="/demo" className="inline-flex min-h-[44px] items-center rounded-xl bg-[#DDEFE0] px-4 text-sm font-bold">Presenter mode</Link>
        </div>
      </SectionCard>
    </WorkspaceShell>
  );
};

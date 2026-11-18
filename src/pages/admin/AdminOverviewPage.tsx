import React, {useEffect, useState} from 'react';
import {apiFetch} from '../../lib/api';
import {WorkspaceShell} from '../../components/WorkspaceShell';

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
  metrics: {
    farmers: number;
    experts: number;
    guidesPublished: number;
    guidesPending: number;
    questionsOpen: number;
    feedbackNew: number;
  };
  recentAudits: Array<{
    id: number;
    actor_role: string;
    actor_name: string | null;
    action: string;
    target_type: string;
    target_id: string;
    created_at: string;
  }>;
}

export const AdminOverviewPage: React.FC = () => {
  const [data, setData] = useState<AdminOverviewData | null>(null);

  useEffect(() => {
    apiFetch<AdminOverviewData>('/admin/overview')
      .then(setData)
      .catch(() => undefined);
  }, []);

  const m = data?.metrics;

  return (
    <WorkspaceShell
      kicker="Administrator Console · RBAC Protected"
      title="Admin Overview"
      subtitle="Platform activity, content publication queues, and security audit trail."
      navItems={ADMIN_NAV}
    >
      <div className="space-y-6">
        <div className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/20 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-[#183B2B]">
            Need to review Bassa/Mano voice clips, marketplace moderation, or judge demo analytics?
          </p>
          <a
            href="/management"
            className="min-h-[44px] inline-flex items-center px-4 py-1.5 rounded-xl bg-[#16803C] text-white text-xs font-bold"
          >
            Open Prototype Management Console
          </a>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[
            {label: 'Farmers', val: m?.farmers ?? '—'},
            {label: 'Experts', val: m?.experts ?? '—'},
            {label: 'Published Guides', val: m?.guidesPublished ?? '—'},
            {label: 'Pending Review', val: m?.guidesPending ?? '—'},
            {label: 'Open Questions', val: m?.questionsOpen ?? '—'},
            {label: 'New Feedback', val: m?.feedbackNew ?? '—'},
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-1">
              <p className="text-xs text-[#183B2B]/65">{stat.label}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums text-[#183B2B]">{stat.val}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-3">
          <h2 className="font-display text-lg font-bold">Recent Audit Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#183B2B]/10 text-xs text-[#183B2B]/65">
                <tr>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#183B2B]/10">
                {(data?.recentAudits || []).map((a) => (
                  <tr key={a.id}>
                    <td className="py-2.5 pr-4 text-xs font-mono tabular-nums">{a.created_at}</td>
                    <td className="py-2.5 pr-4">{a.actor_name || a.actor_role}</td>
                    <td className="py-2.5 pr-4 font-semibold">{a.action}</td>
                    <td className="py-2.5 text-xs text-[#183B2B]/75">
                      {a.target_type} #{a.target_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
};

import React from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {useResource} from '../../lib/useResource';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {MetricCard, PanelState, SectionCard} from '../../components/workspace/DashboardBits';

export const EXPERT_NAV = [
  {to: '/expert', label: 'Expert Overview', end: true},
  {to: '/expert/questions', label: 'Assigned Questions'},
  {to: '/expert/profile', label: 'Expert Profile'},
];

interface ExpertQuestion {
  id: number;
  status: string;
  title: string;
  county: string;
  crop_name: string | null;
  updated_at?: string;
}

const isDone = (status: string) => status === 'Answered' || status === 'Closed';

export const ExpertDashboardPage: React.FC = () => {
  const {user} = useApp();
  const {data, loading, error, reload} = useResource(() => apiFetch<{questions: ExpertQuestion[]}>('/expert/questions').then((r) => r.questions), []);
  const questions = data ?? [];
  const waiting = questions.filter((q) => !isDone(q.status));
  const byStatus = questions.reduce<Record<string, number>>((acc, q) => ({...acc, [q.status]: (acc[q.status] ?? 0) + 1}), {});
  const initial = loading && !data;

  return (
    <WorkspaceShell
      kicker={`Expert account · ${user?.expertSpecialty || 'Agronomy'}`}
      title={`Expert Workspace — ${user?.displayName}`}
      subtitle="Review assigned farmer questions and issue clear, low-risk agricultural guidance. Farmer contact details are not shown here."
      navItems={EXPERT_NAV}
    >
      {error && <PanelState kind="error" title="Your assigned questions could not be loaded" onRetry={reload}>{error}</PanelState>}

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Awaiting your response" loading={initial} value={data ? waiting.length : undefined} source="Questions assigned to you" note="Not yet answered or closed." />
        <MetricCard label="Answered consultations" loading={initial} value={data ? questions.length - waiting.length : undefined} source="Questions assigned to you" note="Answered or closed." />
        <MetricCard label="Total assigned cases" loading={initial} value={data ? questions.length : undefined} source="Questions assigned to you" note="Only cases assigned to your account are counted." />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard title="Needs a response" description="Oldest activity is not guessed; the list follows the order the server returns." actions={<Link to="/expert/questions" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[#16803C] hover:underline">Open full queue</Link>}>
          {initial ? <PanelState kind="loading" title="Loading assigned questions…" />
            : error && !data ? <PanelState kind="unavailable" title="Questions unavailable">Use “Try again” above once you are online.</PanelState>
            : waiting.length === 0 ? <PanelState kind="empty" title="Nothing is waiting for you">No farmer questions are currently assigned to you that still need an answer.</PanelState>
            : <ul className="divide-y divide-[#183B2B]/10">{waiting.slice(0, 6).map((q) => (
                <li key={q.id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0"><p className="text-xs text-[#52665B]">{q.status} · {q.crop_name || 'General'} · {q.county} County</p><p className="truncate text-sm font-semibold">{q.title}</p></div>
                  <Link to={`/expert/questions/${q.id}`} className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-[#DDEFE0] px-4 text-xs font-semibold hover:bg-[#16803C] hover:text-white">Review &amp; answer</Link>
                </li>))}</ul>}
        </SectionCard>

        <SectionCard title="Cases by status">
          {initial ? <PanelState kind="loading" title="Loading…" />
            : questions.length === 0 ? <PanelState kind="empty" title="No cases yet">Statuses appear here once questions are assigned to you.</PanelState>
            : <table className="w-full text-sm"><caption className="sr-only">Assigned cases by status</caption><thead className="text-left text-xs text-[#52665B]"><tr><th scope="col" className="py-1">Status</th><th scope="col" className="py-1 text-right">Cases</th></tr></thead>
                <tbody>{Object.entries(byStatus).map(([status, n]) => <tr key={status} className="border-t border-[#183B2B]/10"><th scope="row" className="py-2 text-left font-semibold">{status}</th><td className="py-2 text-right tabular-nums">{n}</td></tr>)}</tbody></table>}
        </SectionCard>
      </div>
    </WorkspaceShell>
  );
};

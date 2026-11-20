import React from 'react';
import {Link} from 'react-router-dom';
import {Bookmark, BookOpen, MessageSquare, Mic, Store, Users, WifiOff} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {apiFetch} from '../../lib/api';
import {hasListingKey} from '../../lib/listingKeys';
import {getOfflineGuides} from '../../lib/offlineStorage';
import {getDemoOwnerToken, getDemoSavedAdvice, getRecentlyViewedGuides} from '../../lib/demoStorage';
import {useResource} from '../../lib/useResource';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {MetricCard, PanelState, SectionCard} from '../../components/workspace/DashboardBits';

export const FARMER_NAV = [
  {to: '/farmer', label: 'Overview', end: true},
  {to: '/farmer/market', label: 'My Marketplace'},
  {to: '/farmer/saved', label: 'Saved Advice'},
  {to: '/farmer/questions', label: 'My Questions'},
  {to: '/farmer/expert-requests', label: 'Expert Requests'},
  {to: '/farmer/profile', label: 'Profile & Language'},
];

interface FarmerQuestionRow {id: number; status: string; title: string; crop_name: string | null; county: string; expert_name: string | null; updated_at: string}
interface Summary {saved: number; questions: FarmerQuestionRow[]; listings: number; inquiries: number}

export const FarmerDashboardPage: React.FC = () => {
  const {user, language, isOnline} = useApp();
  const ownerToken = getDemoOwnerToken();
  const offlineCount = getOfflineGuides().length;
  const localSavedCount = getDemoSavedAdvice().length;
  const recentGuides = getRecentlyViewedGuides();

  const summary = useResource<Summary>(async () => {
    const [s, q, l, i] = await Promise.all([
      apiFetch<{saved: unknown[]}>('/farmer/saved'),
      apiFetch<{questions: FarmerQuestionRow[]}>('/farmer/questions'),
      apiFetch<{listings: {id: number; can_manage?: boolean}[]}>('/marketplace/listings'),
      apiFetch<{inquiries: unknown[]}>('/marketplace/inquiries'),
    ]);
    return {saved: s.saved.length, questions: q.questions, listings: l.listings.filter((x) => x.can_manage || hasListingKey(x.id)).length, inquiries: i.inquiries.length};
  }, [ownerToken], isOnline);

  const d = summary.data;
  const loading = isOnline && summary.loading && !d;
  const open = d ? d.questions.filter((q) => q.status !== 'Answered' && q.status !== 'Closed').length : null;

  return (
    <WorkspaceShell
      kicker={`${user?.county || 'Liberia'} County · Language: ${language.toUpperCase()}`}
      title={`Welcome, ${user?.displayName}`}
      subtitle="Your saved advice, expert questions, marketplace activity and offline downloads in one place."
      navItems={FARMER_NAV}
    >
      {!isOnline && <PanelState kind="offline" title="You are offline">Counts that need the server are hidden instead of shown as zero. Saved advice and offline guides on this phone still work.</PanelState>}
      {summary.error && isOnline && <PanelState kind="error" title="Some account counts could not be loaded" onRetry={summary.reload}>{summary.error}</PanelState>}

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Saved advice" loading={loading} value={d ? d.saved + localSavedCount : isOnline ? undefined : localSavedCount} source="Your account and this phone" note="Advice saved to your account plus items saved on this device." />
        <MetricCard label="Open expert questions" loading={loading} value={open} source="Your account" note="Questions still waiting for an answer or more information." />
        <MetricCard label="My listings" loading={loading} value={d?.listings} source="Your account" note={d ? `${d.inquiries} buyer inquiries on file.` : 'Listings you manage.'} />
        <MetricCard label="Offline guides" value={offlineCount} source="This phone" note={`${recentGuides.length} recently viewed guides.`} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard title="Recent expert questions" description="Your latest questions and where they stand." actions={<Link to="/farmer/questions" className="text-sm font-semibold text-[#16803C] hover:underline">View all</Link>}>
          {loading ? <PanelState kind="loading" title="Loading your questions…" />
            : !isOnline ? <PanelState kind="offline" title="Questions need a connection">Reconnect to see the status of your questions.</PanelState>
            : !d || d.questions.length === 0 ? <PanelState kind="empty" title="No questions yet"><Link className="font-semibold text-[#16803C] underline" to="/farmer/expert-requests">Ask an expert</Link> when you need advice for your farm.</PanelState>
            : <ul className="divide-y divide-[#183B2B]/10">{d.questions.slice(0, 5).map((q) => (
                <li key={q.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="text-xs text-[#52665B]">{q.status} · {q.crop_name || 'General'} · {q.county}</p><p className="truncate text-sm font-semibold">{q.title}</p><p className="text-xs text-[#52665B]">{q.expert_name ? `Expert: ${q.expert_name}` : 'Awaiting expert assignment'}</p></div>
                  <Link to="/farmer/questions" className="inline-flex min-h-[44px] shrink-0 items-center text-sm font-semibold text-[#16803C] hover:underline">Open</Link>
                </li>))}</ul>}
        </SectionCard>

        <SectionCard title="Quick actions">
          <div className="grid gap-2">
            <Link to="/advisor" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#16803C] px-4 text-sm font-semibold text-white"><Mic className="h-4 w-4" aria-hidden /> Ask the AI advisor</Link>
            <Link to="/farmer/expert-requests" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#DDEFE0] px-4 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-[#16803C]" aria-hidden /> Ask an expert</Link>
            <Link to="/harvest/sell" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#DDEFE0] px-4 text-sm font-semibold"><Store className="h-4 w-4 text-[#16803C]" aria-hidden /> Sell a harvest</Link>
            <Link to="/farmer/saved" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#DDEFE0] px-4 text-sm font-semibold"><Bookmark className="h-4 w-4 text-[#16803C]" aria-hidden /> Saved advice</Link>
            <Link to="/offline" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#DDEFE0] px-4 text-sm font-semibold"><WifiOff className="h-4 w-4 text-[#16803C]" aria-hidden /> Offline library</Link>
          </div>
        </SectionCard>
      </div>

      {recentGuides.length > 0 && (
        <SectionCard title="Recently viewed crop guides">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {recentGuides.slice(0, 4).map((g) => (
              <Link key={g.slug} to={`/guides/${g.slug}`} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#F3F8F0] p-3 text-sm font-semibold hover:bg-[#DDEFE0]"><BookOpen className="h-4 w-4 shrink-0 text-[#16803C]" aria-hidden />{g.title} <span className="text-xs font-normal text-[#52665B]">· {g.category}</span></Link>
            ))}
          </div>
        </SectionCard>
      )}
      <p className="flex items-center gap-2 text-xs text-[#52665B]"><Users className="h-4 w-4" aria-hidden /> Counts come only from your own account and this device.</p>
    </WorkspaceShell>
  );
};

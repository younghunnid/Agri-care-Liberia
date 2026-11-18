import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Bookmark, BookOpen, MessageSquare, Mic, Store, Users, WifiOff} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {apiFetch} from '../../lib/api';
import {hasListingKey} from '../../lib/listingKeys';
import {getOfflineGuides} from '../../lib/offlineStorage';
import {
  getDemoOwnerToken,
  getDemoSavedAdvice,
  getRecentlyViewedGuides,
} from '../../lib/demoStorage';
import {WorkspaceShell} from '../../components/WorkspaceShell';

export const FARMER_NAV = [
  {to: '/farmer', label: 'Overview', end: true},
  {to: '/farmer/saved', label: 'Saved Advice'},
  {to: '/farmer/questions', label: 'My Questions'},
  {to: '/farmer/expert-requests', label: 'Expert Requests'},
  {to: '/farmer/profile', label: 'Profile & Language'},
];

export const FarmerDashboardPage: React.FC = () => {
  const {user, language, isOnline} = useApp();
  const [savedCount, setSavedCount] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  const [listingCount, setListingCount] = useState(0);
  const [inquiryCount, setInquiryCount] = useState(0);
  const offlineCount = getOfflineGuides().length;
  const localSavedCount = getDemoSavedAdvice().length;
  const recentGuides = getRecentlyViewedGuides();
  const ownerToken = getDemoOwnerToken();

  useEffect(() => {
    if (!isOnline) return;
    Promise.all([
      apiFetch<{saved: unknown[]}>('/farmer/saved'),
      apiFetch<{questions: unknown[]}>('/farmer/questions'),
      apiFetch<{listings: {id: number; can_manage?: boolean}[]}>('/marketplace/listings'),
      apiFetch<{inquiries: unknown[]}>('/marketplace/inquiries'),
    ])
      .then(([s, q, l, i]) => {
        setSavedCount(s.saved.length);
        setQuestionCount(q.questions.length);
        setListingCount(l.listings.filter((x) => x.can_manage || hasListingKey(x.id)).length);
        setInquiryCount(i.inquiries.length);
      })
      .catch(() => undefined);
  }, [isOnline, ownerToken]);

  return (
    <WorkspaceShell
      kicker={`${user?.county || 'Liberia'} County · Language: ${language.toUpperCase()}`}
      title={`Welcome, ${user?.displayName}`}
      subtitle="Manage your saved advice, expert questions, marketplace listings, buyer inquiries, offline downloads, and recently viewed guides."
      navItems={FARMER_NAV}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Link to="/farmer/saved" className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 hover:border-[#16803C] transition-colors space-y-2">
            <Bookmark className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{savedCount + localSavedCount}</p>
            <p className="text-xs font-semibold text-[#183B2B]">Saved Advice</p>
          </Link>

          <Link to="/farmer/questions" className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 hover:border-[#16803C] transition-colors space-y-2">
            <Users className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{questionCount}</p>
            <p className="text-xs font-semibold text-[#183B2B]">Expert Consultations</p>
          </Link>

          <Link to="/marketplace" className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 hover:border-[#16803C] transition-colors space-y-2">
            <Store className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{listingCount}</p>
            <p className="text-xs font-semibold text-[#183B2B]">My Listings ({inquiryCount} inquiries)</p>
          </Link>

          <Link to="/offline" className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 hover:border-[#16803C] transition-colors space-y-2">
            <WifiOff className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{offlineCount}</p>
            <p className="text-xs font-semibold text-[#183B2B]">Offline Guides</p>
          </Link>

          <Link to="/guides" className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 hover:border-[#16803C] transition-colors space-y-2">
            <BookOpen className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{recentGuides.length}</p>
            <p className="text-xs font-semibold text-[#183B2B]">Recently Viewed</p>
          </Link>
        </div>

        {recentGuides.length > 0 && (
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-[#183B2B]">Recently Viewed Crop Guides</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {recentGuides.slice(0, 4).map((g) => (
                <Link key={g.slug} to={`/guides/${g.slug}`} className="rounded-xl bg-[#F3F8F0] p-3 text-sm font-semibold text-[#183B2B] hover:bg-[#DDEFE0]">
                  {g.title} <span className="text-xs font-normal text-[#183B2B]/65">· {g.category}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-3xl bg-[#DDEFE0] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-[#183B2B]">Need quick advice today?</h2>
            <p className="text-sm text-[#183B2B]/80">
              Ask the AI Farming Advisor by voice or text, or send a detailed case to an agricultural expert.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/advisor" className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold">
              <Mic className="w-4 h-4" aria-hidden="true" />
              <span>Ask AI</span>
            </Link>
            <Link to="/farmer/expert-requests" className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white text-[#183B2B] text-sm font-semibold">
              <MessageSquare className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
              <span>Ask Expert</span>
            </Link>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
};

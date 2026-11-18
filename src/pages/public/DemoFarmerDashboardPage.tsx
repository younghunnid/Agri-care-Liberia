import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {Link} from 'react-router-dom';
import {
  Bookmark,
  BookOpen,
  Clock,
  Globe,
  MessageSquare,
  Store,
  Trash2,
  Users,
  WifiOff,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {getOfflineGuides} from '../../lib/offlineStorage';
import {hasListingKey, requesterHeaders} from '../../lib/listingKeys';
import {countByStatus} from '../../lib/offlineInventory';
import {getListingRecords, getQuestionRecords, getSyncVersion, subscribeSync} from '../../lib/offlineDrafts';
import {
  type DemoSavedAdvice,
  type RecentGuideItem,
  getDemoOwnerToken,
  getDemoSavedAdvice,
  getRecentlyViewedGuides,
  removeDemoAdvice,
} from '../../lib/demoStorage';
import {LANGUAGE_OPTIONS, type LanguageCode} from '../../lib/i18n';

interface ListingSummary {
  id: number;
  can_manage?: boolean;
  product_name: string;
  price_lrd: number;
  unit: string;
  quantity: string;
  county: string;
}

interface InquirySummary {
  id: number;
  product_name: string;
  buyer_name: string;
  message: string;
  status: string;
}

interface ExpertReqSummary {
  id: number;
  title: string;
  category: string;
  status: string;
  expert_reply: string;
  is_mine?: boolean;
}

export const DemoFarmerDashboardPage: React.FC = () => {
  const {user, language, setLanguage, isOnline} = useApp();
  const [savedAdvice, setSavedAdvice] = useState<DemoSavedAdvice[]>(() => getDemoSavedAdvice());
  const [recentGuides] = useState<RecentGuideItem[]>(() => getRecentlyViewedGuides());
  const [offlineCount] = useState(() => getOfflineGuides().length);
  const [myListings, setMyListings] = useState<ListingSummary[]>([]);
  const [myInquiries, setMyInquiries] = useState<InquirySummary[]>([]);
  const [myRequests, setMyRequests] = useState<ExpertReqSummary[]>([]);
  // 'ok' = the numbers below came from the server just now; otherwise they must not be shown as zeros.
  const [serverStatus, setServerStatus] = useState<'never' | 'ok' | 'error'>('never');
  useSyncExternalStore(subscribeSync, getSyncVersion, getSyncVersion);
  const localListings = countByStatus(getListingRecords());
  const localQuestions = countByStatus(getQuestionRecords());
  const unsentLocal = localListings.draft + localListings.pending + localListings.failed + localQuestions.draft + localQuestions.pending + localQuestions.failed;

  const ownerToken = getDemoOwnerToken();

  useEffect(() => {
    if (!isOnline) return;
    Promise.all([
      apiFetch<{listings: ListingSummary[]}>('/marketplace/listings'),
      apiFetch<{inquiries: InquirySummary[]}>(`/marketplace/inquiries`),
      apiFetch<{requests: ExpertReqSummary[]}>('/expert-requests/demo', {headers: requesterHeaders()}),
    ])
      .then(([lRes, iRes, eRes]) => {
        // The server returns every public listing; "mine" are the ones whose ownership key this phone holds.
        setMyListings(lRes.listings.filter((l) => l.can_manage || hasListingKey(l.id)));
        setServerStatus('ok');
        setMyInquiries(iRes.inquiries.slice(0, 6));
        setMyRequests(eRes.requests.filter((r) => r.is_mine).slice(0, 6));
      })
      .catch(() => setServerStatus('error'));
  }, [isOnline, ownerToken]);

  const serverVal = (n: number): string | number => (serverStatus === 'ok' ? n : '—');

  const handleRemoveSaved = (id: string) => {
    setSavedAdvice(removeDemoAdvice(id));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#16803C]">
            {user ? `Signed-in Farmer: ${user.displayName}` : 'Demo Farmer Hub · Device Session'}
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
            Farmer Dashboard
          </h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 max-w-2xl">
            View your saved advice, farm questions, marketplace produce listings, buyer inquiries, selected language, and recently viewed guides in one place.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user ? (
            <Link
              to="/farmer"
              className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold"
            >
              Open Full Account Console
            </Link>
          ) : (
            <Link
              to="/login"
              className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl border border-[#16803C] text-[#16803C] text-sm font-semibold hover:bg-[#DDEFE0]"
            >
              Sign In for Cross-Device Sync
            </Link>
          )}
        </div>
      </div>

      {/* Quick Metric Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          {label: 'Saved Advice', val: savedAdvice.length, icon: Bookmark, to: '/guides'},
          {label: 'Expert Questions (server)', val: serverVal(myRequests.length), icon: Users, to: '/experts'},
          {label: 'Published Listings (server)', val: serverVal(myListings.length), icon: Store, to: '/marketplace'},
          {label: 'Buyer Inquiries (server)', val: serverVal(myInquiries.length), icon: MessageSquare, to: '/marketplace'},
          {label: 'Unsent on this phone', val: unsentLocal, icon: Bookmark, to: '/downloads'},
          {label: 'Offline Guides', val: offlineCount, icon: WifiOff, to: '/offline'},
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              to={card.to}
              className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 hover:border-[#16803C] transition-colors space-y-1.5"
            >
              <Icon className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <p className="font-display text-2xl font-extrabold tabular-nums text-[#183B2B]">{card.val}</p>
              <p className="text-xs font-semibold text-[#183B2B]/75">{card.label}</p>
            </Link>
          );
        })}
      </div>

      {/* Local vs server: what exists only on this phone, and what the server confirmed */}
      <section aria-labelledby="dash-local" className="rounded-3xl bg-white border-2 border-[#16803C]/30 p-6 space-y-3">
        <h2 id="dash-local" className="font-display text-lg font-bold text-[#183B2B]">Saved on This Phone vs Published Online</h2>
        {!isOnline && (
          <p role="status" className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-base font-semibold text-amber-900">
            You are offline. Numbers marked "(server)" cannot be loaded now, so they show "—", not zero.
          </p>
        )}
        {isOnline && serverStatus === 'error' && (
          <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-base font-semibold text-red-800">
            Could not load your online data. The "(server)" numbers show "—" until it loads.
          </p>
        )}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-base">
          <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
            <dt className="font-bold">Marketplace listings from this phone</dt>
            <dd>
              Draft {localListings.draft} · Pending Sync {localListings.pending} · Sync Failed {localListings.failed} · Published {localListings.published}
            </dd>
            <dd className="text-sm text-[#183B2B]/75">Draft, Pending and Failed exist only on this phone. Published means the server confirmed it.</dd>
          </div>
          <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
            <dt className="font-bold">Expert questions from this phone</dt>
            <dd>
              Draft {localQuestions.draft} · Pending Sync {localQuestions.pending} · Sync Failed {localQuestions.failed} · Sent {localQuestions.published}
            </dd>
            <dd className="text-sm text-[#183B2B]/75">Only "Sent" questions can be seen by an expert.</dd>
          </div>
        </dl>
        <Link to="/downloads" className="inline-flex items-center min-h-[48px] px-5 rounded-2xl border-2 border-[#16803C] text-[#16803C] text-base font-bold">
          Manage items saved on this phone
        </Link>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saved Advice */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Saved Advice ({savedAdvice.length})</span>
            </h2>
            <Link to="/guides" className="text-xs font-semibold text-[#16803C] hover:underline">
              Browse Knowledge
            </Link>
          </div>
          {savedAdvice.length === 0 ? (
            <p className="text-sm text-[#183B2B]/70">
              No saved advice on this device yet. Tap <strong>Save</strong> on any Knowledge Center article or AI Advisor reply.
            </p>
          ) : (
            <div className="space-y-2.5">
              {savedAdvice.map((item) => (
                <div key={item.id} className="rounded-2xl bg-[#F3F8F0] p-3.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#16803C] font-semibold">{item.category}</p>
                    <p className="text-sm font-bold text-[#183B2B]">{item.title}</p>
                    <p className="text-xs text-[#183B2B]/75 mt-0.5 line-clamp-2">{item.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSaved(item.id)}
                    aria-label={`Remove ${item.title}`}
                    className="min-h-[44px] min-w-[40px] flex items-center justify-center rounded-xl text-red-700 hover:bg-red-50 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My Expert Questions */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>My Expert Questions</span>
            </h2>
            <Link to="/experts" className="text-xs font-semibold text-[#16803C] hover:underline">
              Ask Expert
            </Link>
          </div>
          {myRequests.length === 0 ? (
            <p className="text-sm text-[#183B2B]/70">No expert requests submitted yet.</p>
          ) : (
            <div className="space-y-2.5">
              {myRequests.map((req) => (
                <div key={req.id} className="rounded-2xl bg-[#F3F8F0] p-3.5 space-y-1">
                  <p className="text-xs font-semibold text-[#16803C]">
                    Status: {req.status} · {req.category}
                  </p>
                  <p className="text-sm font-bold text-[#183B2B]">{req.title}</p>
                  {req.expert_reply && (
                    <p className="text-xs text-[#183B2B]/80">Reply: {req.expert_reply}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My Marketplace Listings (Direct Call Enabled) */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <Store className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Published Online: My Listings (Direct Calling)</span>
            </h2>
            <Link to="/marketplace" className="text-xs font-semibold text-[#16803C] hover:underline">
              Open Marketplace
            </Link>
          </div>
          {myListings.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-bold text-[#183B2B]/70">Published by this phone (server-confirmed):</p>
              {myListings.map((l) => (
                <div key={l.id} className="rounded-xl bg-[#DDEFE0]/70 p-3 flex items-center justify-between text-sm">
                  <span className="font-semibold">{l.product_name} ({l.quantity} {l.unit})</span>
                  <span className="font-bold text-[#16803C]">LRD {l.price_lrd.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : serverStatus !== 'ok' ? (
            <p className="text-sm text-[#183B2B]/80">
              {!isOnline
                ? 'Your published listings cannot be loaded while offline. This is not the same as having none. Listings saved on this phone are summarised above.'
                : serverStatus === 'error'
                ? 'Could not load your published listings from the server. Try again later.'
                : 'Loading your published listings…'}
            </p>
          ) : (
            <p className="text-sm text-[#183B2B]/70">
              No listings posted from this device yet. Farmers post listings with an optional consented phone number so buyers call directly without written messages.
            </p>
          )}
          {myInquiries.length > 0 && (
            <div className="space-y-2 border-t border-[#183B2B]/10 pt-3">
              <p className="text-xs font-bold text-[#183B2B]/65">Historical Inquiry Records (Optional Archive):</p>
              {myInquiries.slice(0, 2).map((inq) => (
                <div key={inq.id} className="rounded-2xl bg-[#F3F8F0] p-3 space-y-0.5 text-xs text-[#183B2B]/75">
                  <p className="font-semibold text-[#183B2B]">{inq.product_name} · {inq.buyer_name}</p>
                  <p>{inq.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Language & Recently Viewed Guides */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-5">
          <div className="space-y-2.5">
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Selected Language</span>
            </h2>
            <select
              aria-label="Selected farmer language"
              value={language}
              onChange={(e) => void setLanguage(e.target.value as LanguageCode)}
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm font-semibold"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.name} ({opt.shortCode}) — {opt.note}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5 border-t border-[#183B2B]/10 pt-4">
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Recently Viewed Guides ({recentGuides.length})</span>
            </h2>
            {recentGuides.length === 0 ? (
              <p className="text-sm text-[#183B2B]/70">
                Open any guide in the Knowledge Center and it will appear here for quick access.
              </p>
            ) : (
              <div className="space-y-2">
                {recentGuides.map((g) => (
                  <Link
                    key={g.slug}
                    to={`/guides/${g.slug}`}
                    className="flex items-center justify-between rounded-xl bg-[#F3F8F0] p-3 hover:bg-[#DDEFE0]"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-[#183B2B]">
                      <BookOpen className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                      <span>{g.title}</span>
                    </span>
                    <span className="text-xs text-[#183B2B]/65">{g.category}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

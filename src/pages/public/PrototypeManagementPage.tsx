import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Languages,
  MessageSquare,
  ShieldCheck,
  Store,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {KNOWLEDGE_CATEGORIES} from '../../data/knowledgeCenter';

interface SummaryData {
  actualData: {
    registeredFarmers: number;
    formalAdvisoryQuestions: number;
    publishedCropGuides: number;
  };
  demoAndExperimentalData: {
    marketplaceListings: number;
    marketplaceInquiries: number;
    localLanguageRecordings: number;
    simulatedExpertRequests: number;
  };
}

interface RecordingRow {
  id: number;
  language_code: string;
  topic_label: string;
  question_text: string;
  speaker_name: string;
  review_status: 'reviewed' | 'pending_review' | 'needs_rerecording';
}

interface MarketplaceRow {
  id: number;
  product_name: string;
  seller_name: string;
  county: string;
  price_lrd: number;
  moderation_status: string;
}

interface ExpertReqRow {
  id: number;
  farmer_name: string;
  county: string;
  title: string;
  status: string;
  expert_reply: string;
}

export const PrototypeManagementPage: React.FC = () => {
  const {user, isOnline} = useApp();
  const [tab, setTab] = useState<'analytics' | 'content' | 'experts' | 'audio' | 'marketplace'>('analytics');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [listings, setListings] = useState<MarketplaceRow[]>([]);
  const [expertReqs, setExpertReqs] = useState<ExpertReqRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!isOnline) return;
    try {
      const [sRes, rRes, lRes, eRes] = await Promise.all([
        apiFetch<SummaryData>('/prototype/management-summary'),
        apiFetch<{recordings: RecordingRow[]}>('/language-lab/recordings'),
        apiFetch<{listings: MarketplaceRow[]}>('/marketplace/listings?admin=1'),
        apiFetch<{requests: ExpertReqRow[]}>('/expert-requests/demo'),
      ]);
      setSummary(sRes);
      setRecordings(rRes.recordings);
      setListings(lRes.listings);
      setExpertReqs(eRes.requests);
    } catch {
      // ignore offline
    }
  }, [isOnline]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const canReview = Boolean(user?.roles.some((r) => r === 'expert' || r === 'admin'));

  const handleRecordingStatus = async (id: number, reviewStatus: RecordingRow['review_status']) => {
    if (!canReview) {
      setNotice('Sign in as an approved expert or administrator to review language recordings.');
      return;
    }
    try {
      await apiFetch(`/language-lab/recordings/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({reviewStatus}),
      });
      setNotice(`Recording #${id} updated to ${reviewStatus}.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not update the review status.');
    }
    await loadAll();
  };

  const handleListingModeration = async (id: number, moderationStatus: string) => {
    if (!user?.roles.includes('admin')) {
      setNotice('Sign in as Admin (admin@agriadvisory.lr) to audit-log marketplace moderation, or preview status below.');
      return;
    }
    await apiFetch(`/admin/marketplace/${id}/moderate`, {
      method: 'POST',
      body: JSON.stringify({moderationStatus}),
    });
    setNotice(`Marketplace listing #${id} moderated to ${moderationStatus}.`);
    await loadAll();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>Team 8 Prototype Review &amp; Management Console</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
            Admin &amp; Expert Management Prototype
          </h1>
          <p className="text-sm text-white/85 max-w-2xl">
            Inspect actual SQLite database records separately from simulated hackathon demonstration data, review Bassa/Mano voice status, and moderate marketplace listings.
          </p>
        </div>

        {user?.roles.includes('admin') ? (
          <Link
            to="/admin"
            className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-[#F5B942] text-[#183B2B] text-sm font-bold shrink-0"
          >
            Open RBAC Admin Console
          </Link>
        ) : (
          <Link
            to="/login"
            className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 shrink-0"
          >
            Admin Sign-In (RBAC)
          </Link>
        )}
      </div>

      {/* Explicit Actual vs Simulated Separation Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-white border border-[#16803C]/30 p-6 space-y-3">
          <p className="text-xs font-extrabold text-[#16803C] uppercase tracking-wide">
            Actual SQLite Database Records (Core Platform)
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#F3F8F0] p-3.5">
              <p className="font-display text-2xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.actualData.publishedCropGuides ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Published Guides</p>
            </div>
            <div className="rounded-2xl bg-[#F3F8F0] p-3.5">
              <p className="font-display text-2xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.actualData.registeredFarmers ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Registered Farmers</p>
            </div>
            <div className="rounded-2xl bg-[#F3F8F0] p-3.5">
              <p className="font-display text-2xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.actualData.formalAdvisoryQuestions ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Formal Questions</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#F5B942] p-6 space-y-3">
          <p className="text-xs font-extrabold text-amber-800 uppercase tracking-wide">
            Sample / Simulated Hackathon Prototype Data
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-[#F5B942]/15 p-3">
              <p className="font-display text-xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.demoAndExperimentalData.marketplaceListings ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Demo Listings</p>
            </div>
            <div className="rounded-2xl bg-[#F5B942]/15 p-3">
              <p className="font-display text-xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.demoAndExperimentalData.marketplaceInquiries ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Demo Inquiries</p>
            </div>
            <div className="rounded-2xl bg-[#F5B942]/15 p-3">
              <p className="font-display text-xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.demoAndExperimentalData.localLanguageRecordings ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Voice Clips</p>
            </div>
            <div className="rounded-2xl bg-[#F5B942]/15 p-3">
              <p className="font-display text-xl font-extrabold tabular-nums text-[#183B2B]">
                {summary?.demoAndExperimentalData.simulatedExpertRequests ?? '—'}
              </p>
              <p className="text-xs text-[#183B2B]/75">Sim Expert Cases</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          {id: 'analytics', label: 'Demo Analytics', icon: BarChart3},
          {id: 'content', label: `Knowledge Topics (${KNOWLEDGE_CATEGORIES.length})`, icon: BookOpen},
          {id: 'experts', label: `Expert Requests (${expertReqs.length})`, icon: MessageSquare},
          {id: 'audio', label: `Bassa/Mano Audio (${recordings.length})`, icon: Languages},
          {id: 'marketplace', label: `Marketplace Moderation (${listings.length})`, icon: Store},
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold ${
                tab === item.id
                  ? 'bg-[#16803C] text-white'
                  : 'bg-white border border-[#183B2B]/15 text-[#183B2B]'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div role="status" className="rounded-2xl bg-[#DDEFE0] p-3.5 text-sm font-semibold text-[#183B2B]">
          {notice}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-[#183B2B]">Hackathon Demonstration Overview</h2>
          <p className="text-sm text-[#183B2B]/80 leading-relaxed">
            This dashboard separates verified database rows from demonstration sample records so hackathon judges see real persistence without confusion. Simulated call menus and sample buyer inquiries do not claim live telecom or commercial volume.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link to="/demo" className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold">
              Open Guided Judge Scenarios
            </Link>
            <Link to="/experts?tab=dashboard" className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-[#F3F8F0] text-[#183B2B] text-sm font-semibold">
              Reply in Simulated Expert Queue
            </Link>
          </div>
        </div>
      )}

      {tab === 'content' && (
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-[#183B2B]">
            16-Category Advisory Coverage &amp; Verification Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <div key={c.id} className="rounded-2xl bg-[#F3F8F0] p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#16803C]">Category {c.number}</p>
                  <p className="text-sm font-bold text-[#183B2B]">{c.name}</p>
                  <p className="text-xs text-[#183B2B]/70">{c.articles.length} sample guide(s) · Text &amp; Smart Listen active</p>
                </div>
                <Link to={`/guides?topic=${c.id}`} className="text-xs font-semibold text-[#16803C] hover:underline shrink-0">
                  Preview
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'experts' && (
        <div className="space-y-3">
          {expertReqs.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#16803C]">
                  {r.status} · {r.farmer_name} ({r.county})
                </p>
                <p className="text-sm font-bold text-[#183B2B]">{r.title}</p>
                {r.expert_reply && <p className="text-xs text-[#183B2B]/75 mt-1">Reply: {r.expert_reply}</p>}
              </div>
              <Link to="/experts?tab=dashboard" className="min-h-[44px] inline-flex items-center px-3.5 py-1.5 rounded-xl bg-[#DDEFE0] text-xs font-bold text-[#183B2B] shrink-0">
                Manage Reply
              </Link>
            </div>
          ))}
        </div>
      )}

      {tab === 'audio' && (
        <div className="space-y-3">
          {recordings.map((rec) => (
            <div key={rec.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#16803C]">
                  {rec.language_code.toUpperCase()} · {rec.topic_label} · Speaker: {rec.speaker_name}
                </p>
                <p className="text-sm font-bold text-[#183B2B]">{rec.question_text}</p>
              </div>
              <select
                aria-label={`Review status for ${rec.question_text}`}
                disabled={!canReview}
                title={canReview ? undefined : 'Only signed-in reviewers can change this'}
                value={rec.review_status}
                onChange={(e) => void handleRecordingStatus(rec.id, e.target.value as RecordingRow['review_status'])}
                className="min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-xs font-semibold"
              >
                <option value="reviewed">Reviewed</option>
                <option value="pending_review">Pending Review</option>
                <option value="needs_rerecording">Needs Re-recording</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {tab === 'marketplace' && (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#16803C]">
                  Status: {l.moderation_status} · {l.county} · LRD {l.price_lrd.toLocaleString()}
                </p>
                <p className="text-sm font-bold text-[#183B2B]">
                  {l.product_name} ({l.seller_name})
                </p>
              </div>
              <div className="flex gap-2">
                {['approved', 'flagged', 'hidden'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => void handleListingModeration(l.id, st)}
                    className={`min-h-[44px] px-3 py-1 rounded-xl text-xs font-semibold border ${
                      l.moderation_status === st
                        ? 'bg-[#16803C] border-[#16803C] text-white'
                        : 'bg-[#F3F8F0] border-[#183B2B]/15 text-[#183B2B]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

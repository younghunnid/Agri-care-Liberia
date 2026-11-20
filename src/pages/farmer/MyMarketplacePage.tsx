import React, {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {hasListingKey} from '../../lib/listingKeys';
import {getDemoOwnerToken} from '../../lib/demoStorage';
import {useResource} from '../../lib/useResource';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {dashboardField, MetricCard, PanelState, PublishedDataTable, SectionCard} from '../../components/workspace/DashboardBits';
import {FARMER_NAV} from './FarmerDashboardPage';

interface Listing {id: number; can_manage?: boolean; product_name: string; quantity: string; unit: string; price_lrd: number; county: string; availability_status?: string; moderation_status: string; view_count?: number; inquiry_count?: number; created_at: string}
/** Allow-listed inquiry fields from the server. Phone numbers are deliberately not read or shown on this page. */
interface Inquiry {id: number; listing_id: number; product_name: string; buyer_name: string; buyer_county: string; status: string; created_at: string}
interface MarketData {listings: Listing[]; inquiries: Inquiry[]}

const AVAILABILITY = ['all', 'Available', 'Limited Stock', 'Sold Out'];

/** Seller and buyer view of the existing marketplace. Listing edits, inquiries and offline queues stay in the Marketplace itself. */
export const MyMarketplacePage: React.FC = () => {
  const {isOnline} = useApp();
  const ownerToken = getDemoOwnerToken();
  const [availability, setAvailability] = useState('all');
  const [search, setSearch] = useState('');

  const market = useResource<MarketData>(async () => {
    const [l, i] = await Promise.all([
      apiFetch<{listings: Listing[]}>('/marketplace/listings'),
      apiFetch<{inquiries: Inquiry[]}>('/marketplace/inquiries'),
    ]);
    return {listings: l.listings.filter((x) => x.can_manage || hasListingKey(x.id)), inquiries: i.inquiries};
  }, [ownerToken], isOnline);

  const data = market.data;
  const loading = isOnline && market.loading && !data;
  const mineIds = useMemo(() => new Set((data?.listings ?? []).map((l) => l.id)), [data]);
  const received = (data?.inquiries ?? []).filter((i) => mineIds.has(i.listing_id));
  const sent = (data?.inquiries ?? []).filter((i) => !mineIds.has(i.listing_id));
  const needle = search.trim().toLowerCase();
  const visible = (data?.listings ?? []).filter((l) => (availability === 'all' || l.availability_status === availability) && (!needle || `${l.product_name} ${l.county}`.toLowerCase().includes(needle)));
  const available = (data?.listings ?? []).filter((l) => l.availability_status === 'Available').length;
  const awaitingModeration = (data?.listings ?? []).filter((l) => l.moderation_status !== 'approved').length;
  const newInquiries = received.filter((i) => i.status.toLowerCase() === 'new').length;

  return (
    <WorkspaceShell kicker="Seller and buyer activity" title="My Marketplace" subtitle="Listings you manage, inquiries you received as a seller, and inquiries you sent as a buyer." navItems={FARMER_NAV}>
      {!isOnline && <PanelState kind="offline" title="You are offline">Marketplace figures need a connection and are not shown as zero. Open the <Link to="/marketplace" className="font-semibold text-[#16803C] underline">Marketplace</Link> to see listings queued on this phone.</PanelState>}
      {market.error && isOnline && <PanelState kind="error" title="Marketplace activity could not be loaded" onRetry={market.reload}>{market.error}</PanelState>}

      <section aria-label="Marketplace summary" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="My listings" loading={loading} value={data?.listings.length} source="Your account or this device" note={data ? `${available} available now.` : 'Listings you can manage.'} />
        <MetricCard label="Inquiries received" loading={loading} value={data ? received.length : undefined} source="Marketplace" note={data ? `${newInquiries} marked new.` : 'On your listings.'} />
        <MetricCard label="Inquiries sent" loading={loading} value={data ? sent.length : undefined} source="Marketplace" note="Inquiries you sent as a buyer." />
        <MetricCard label="Awaiting moderation" loading={loading} value={data ? awaitingModeration : undefined} source="Marketplace" note="Listings not yet approved for public view." />
      </section>

      <SectionCard title="My listings" description="Filter your own listings. Open the Marketplace to edit, mark sold out or reply to buyers." actions={<Link to="/harvest/sell" className="inline-flex min-h-[44px] items-center rounded-xl bg-[#16803C] px-4 text-sm font-semibold text-white">Sell a harvest</Link>}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Availability
            <select className={`${dashboardField} mt-1`} value={availability} onChange={(e) => setAvailability(e.target.value)}>{AVAILABILITY.map((a) => <option key={a} value={a}>{a === 'all' ? 'All listings' : a}</option>)}</select></label>
          <label className="text-sm font-semibold">Search product or county
            <input className={`${dashboardField} mt-1`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        </div>
        {loading ? <PanelState kind="loading" title="Loading your listings…" />
          : !isOnline ? <PanelState kind="offline" title="Listings need a connection" />
          : !data ? <PanelState kind="unavailable" title="Listings unavailable">They could not be loaded.</PanelState>
          : data.listings.length === 0 ? <PanelState kind="empty" title="You have no listings yet">List a harvest to see it here. Nothing is shown for listings you do not manage.</PanelState>
          : visible.length === 0 ? <PanelState kind="empty" title="No listing matches these filters">Change the availability or clear the search.</PanelState>
          : <PublishedDataTable caption="My marketplace listings" rows={visible} columns={[
              {key: 'product', label: 'Product', value: (l) => l.product_name},
              {key: 'qty', label: 'Quantity', value: (l) => `${l.quantity} ${l.unit}`},
              {key: 'price', label: 'Price (LRD)', numeric: true, value: (l) => l.price_lrd},
              {key: 'county', label: 'County', value: (l) => l.county},
              {key: 'avail', label: 'Availability', value: (l) => l.availability_status ?? 'Not set'},
              {key: 'mod', label: 'Moderation', value: (l) => l.moderation_status},
              {key: 'inq', label: 'Inquiries', numeric: true, value: (l) => l.inquiry_count ?? 0},
            ]} />}
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <InquiryTable title="Inquiries I received" empty="No buyer has sent an inquiry on your listings yet." loading={loading} online={isOnline} data={data ? received : null} who="Buyer" />
        <InquiryTable title="Inquiries I sent" empty="You have not sent an inquiry as a buyer." loading={loading} online={isOnline} data={data ? sent : null} who="Seller listing" />
      </div>
      <p className="text-xs text-[#52665B]">Buyer and seller phone numbers are never shown on this page. Contact only happens through the consent controls in the Marketplace.</p>
    </WorkspaceShell>
  );
};

function InquiryTable({title, empty, loading, online, data, who}: {title: string; empty: string; loading: boolean; online: boolean; data: Inquiry[] | null; who: string}) {
  return (
    <SectionCard title={title}>
      {loading ? <PanelState kind="loading" title="Loading…" />
        : !online ? <PanelState kind="offline" title="Needs a connection" />
        : !data ? <PanelState kind="unavailable" title="Unavailable" />
        : data.length === 0 ? <PanelState kind="empty" title={empty} />
        : <PublishedDataTable caption={title} rows={data} columns={[
            {key: 'product', label: 'Product', value: (i) => i.product_name},
            {key: 'who', label: who === 'Buyer' ? 'Buyer' : 'Listing', value: (i) => (who === 'Buyer' ? `${i.buyer_name}${i.buyer_county ? `, ${i.buyer_county}` : ''}` : `#${i.listing_id}`)},
            {key: 'status', label: 'Status', value: (i) => i.status},
            {key: 'date', label: 'Received', value: (i) => i.created_at},
          ]} />}
    </SectionCard>
  );
}

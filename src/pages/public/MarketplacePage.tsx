import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  Filter,
  MapPin,
  Package,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Store,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {generateOwnerKey, hasListingKey, ownerHeaders, removeListingKey, saveListingKey} from '../../lib/listingKeys';
import {compressPhoto} from '../../lib/imageCompress';
import {LIBERIA_COUNTIES, MARKETPLACE_CATEGORIES, MARKETPLACE_UNITS} from '../../../server/constants';
import {
  DraftError,
  queueRecord,
  saveListingDraft,
  validateListing,
  type ListingData,
  type ListingRecord,
} from '../../lib/offlineDrafts';
import {syncSoon} from '../../lib/syncEngine';
import {LocalListingsPanel} from '../../components/LocalRecordsPanels';
import {normalizeLiberianPhone} from '../../lib/phone';

export interface MarketplaceListing {
  id: number;
  /** True only for an administrator or the signed-in seller. Anonymous owners are recognised by a key kept on their own device. */
  can_manage?: boolean;
  seller_name: string;
  farm_name?: string;
  category: string;
  product_name: string;
  quantity: string;
  unit: string;
  price_lrd: number;
  county: string;
  town: string;
  description: string;
  image_url: string;
  availability_status?: 'Available' | 'Limited Stock' | 'Sold Out' | string;
  seller_phone?: string;
  phone_consent?: number;
  phone_verified?: number;
  is_fictional_seller?: number;
  view_count?: number;
  is_demo_listing: number;
  moderation_status: string;
  created_at: string;
}

const PRESET_IMAGES = [
  {label: 'Rice / Crops', url: '/src/assets/images/crop_rice_1794924195882.jpg'},
  {label: 'Cassava Harvest', url: '/src/assets/images/crop_cassava_1794924193991.jpg'},
  {label: 'Pepper & Okra', url: '/src/assets/images/crop_pepper_okra_1794924192995.jpg'},
  {label: 'Poultry / Eggs', url: '/src/assets/images/liberia_poultry_farm_1794996421585.jpg'},
  {label: 'Tilapia / Fish', url: '/src/assets/images/liberia_aquaculture_pond_1794996421723.jpg'},
  {label: 'Livestock / Goats', url: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg'},
  {label: 'Seeds / Inputs / Tools', url: '/src/assets/images/liberia_agri_market_1794996422856.jpg'},
];

const AVAILABILITY_BADGE_CLASS: Record<string, string> = {
  Available: 'bg-[#DDEFE0] text-[#16803C] border-[#16803C]/20',
  'Limited Stock': 'bg-amber-100 text-amber-900 border-amber-300',
  'Sold Out': 'bg-red-100 text-red-800 border-red-200',
};

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return 'Recent';
  const parsed = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('T') ? '' : 'Z'));
  if (Number.isNaN(parsed.getTime())) return dateStr.slice(0, 10);
  return parsed.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

function getCallState(item: MarketplaceListing) {
  const phoneCheck = normalizeLiberianPhone(item.seller_phone);
  const hasConsentedRealPhone =
    item.is_fictional_seller === 0 && item.phone_consent === 1 && phoneCheck.valid;
  const isDemoSimulatedCall =
    item.is_fictional_seller !== 0 && item.phone_consent === 1;

  return {
    phoneCheck,
    hasConsentedRealPhone,
    isDemoSimulatedCall,
    isUnavailable: !hasConsentedRealPhone && !isDemoSimulatedCall,
  };
}

export const MarketplacePage: React.FC = () => {
  const {user, isOnline, lowBandwidth} = useApp();
  const [viewMode, setViewMode] = useState<'browse' | 'sell'>('browse');
  const [roleFilter, setRoleFilter] = useState<'all' | 'farmer' | 'supplier' | 'mine'>('all');

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [categories, setCategories] = useState<string[]>([...MARKETPLACE_CATEGORIES]);
  const [units, setUnits] = useState<string[]>([...MARKETPLACE_UNITS]);
  const [counties, setCounties] = useState<string[]>([...LIBERIA_COUNTIES]);
  const [availabilityOptions, setAvailabilityOptions] = useState<string[]>([
    'Available',
    'Limited Stock',
    'Sold Out',
  ]);

  // Filters
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [countyFilter, setCountyFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [availFilter, setAvailFilter] = useState('');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Why the list may be empty: never fetched (offline), a failed request, or a real answer from the server.
  const [loadStatus, setLoadStatus] = useState<'never' | 'ok' | 'error'>('never');
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  // Modals: Product Details & Call Farmer Action
  const [detailsListing, setDetailsListing] = useState<MarketplaceListing | null>(null);
  const [callListing, setCallListing] = useState<MarketplaceListing | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const detailsCloseRef = useRef<HTMLButtonElement | null>(null);
  const callCloseRef = useRef<HTMLButtonElement | null>(null);

  // Farmer / Supplier listing creation & editing form
  const [sellerType, setSellerType] = useState<'farmer' | 'supplier'>('farmer');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [sellerName, setSellerName] = useState(user?.displayName || '');
  const [farmName, setFarmName] = useState('');
  const [category, setCategory] = useState('Rice and grains');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('15');
  const [unit, setUnit] = useState('50kg bag');
  const [priceLrd, setPriceLrd] = useState('7500');
  const [availabilityStatus, setAvailabilityStatus] = useState<'Available' | 'Limited Stock' | 'Sold Out'>('Available');
  const [county, setCounty] = useState(user?.county || 'Bong');
  const [town, setTown] = useState('');
  const [description, setDescription] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [phoneConsent, setPhoneConsent] = useState(false);
  const [imageUrl, setImageUrl] = useState(PRESET_IMAGES[0].url);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  const isMineItem = (item: MarketplaceListing) => Boolean(item.can_manage) || hasListingKey(item.id);

  const loadMarketplace = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (catFilter) qs.set('category', catFilter);
      if (countyFilter) qs.set('county', countyFilter);
      if (availFilter) qs.set('availability', availFilter);
      if (maxPriceFilter && Number(maxPriceFilter) > 0) qs.set('maxPrice', maxPriceFilter);
      if (search.trim()) qs.set('q', search.trim());

      const listRes = await apiFetch<{
        listings: MarketplaceListing[];
        categories: string[];
        units: string[];
        counties: string[];
        availabilityOptions?: string[];
      }>(`/marketplace/listings?${qs.toString()}`);
      setListings(listRes.listings);
      setLoadStatus('ok');
      setLoadedAt(new Date().toISOString());
      setCategories(listRes.categories);
      setUnits(listRes.units);
      setCounties(listRes.counties);
      if (listRes.availabilityOptions?.length) {
        setAvailabilityOptions(listRes.availabilityOptions);
      }
    } catch {
      // A failed request is NOT the same as "no products": keep what was loaded and say so.
      setLoadStatus('error');
    } finally {
      setLoading(false);
    }
  }, [isOnline, catFilter, countyFilter, availFilter, maxPriceFilter, search]);

  useEffect(() => {
    void loadMarketplace();
  }, [loadMarketplace]);

  // Accessible modal body scroll lock, Escape handling, and focus management
  useEffect(() => {
    const anyModalOpen = Boolean(detailsListing || callListing);
    if (!anyModalOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (callListing) {
      callCloseRef.current?.focus();
    } else if (detailsListing) {
      detailsCloseRef.current?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (callListing) {
          setCallListing(null);
          setCopiedPhone(false);
        } else if (detailsListing) {
          setDetailsListing(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailsListing, callListing]);

  const isSupplierItem = (item: MarketplaceListing) =>
    item.seller_name.toLowerCase().includes('supplier') ||
    item.category === 'Seeds and seedlings' ||
    item.category === 'Agricultural supplies';

  const displayedListings = listings.filter((item) => {
    if (roleFilter === 'mine') return isMineItem(item);
    if (roleFilter === 'supplier') return isSupplierItem(item);
    if (roleFilter === 'farmer') return !isSupplierItem(item);
    return true;
  });

  const activeFilterCount = [countyFilter, catFilter, maxPriceFilter, availFilter].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch('');
    setCountyFilter('');
    setCatFilter('');
    setMaxPriceFilter('');
    setAvailFilter('');
    setRoleFilter('all');
  };

  const handleOpenDetails = async (item: MarketplaceListing) => {
    setDetailsListing(item);
    if (!isOnline) return;
    try {
      const res = await apiFetch<{view_count: number}>(`/marketplace/listings/${item.id}/view`, {
        method: 'POST',
      });
      setListings((prev) =>
        prev.map((l) => (l.id === item.id ? {...l, view_count: res.view_count} : l))
      );
      setDetailsListing((prev) => (prev && prev.id === item.id ? {...prev, view_count: res.view_count} : prev));
    } catch {
      // non-fatal
    }
  };

  const handleOpenCall = (item: MarketplaceListing) => {
    setCopiedPhone(false);
    setCallListing(item);
  };

  const handleCopyPhone = async (phoneText: string) => {
    try {
      await navigator.clipboard.writeText(phoneText);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2500);
    } catch {
      // ignore clipboard permission errors
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Shrunk to roughly 100 KB so it saves quickly and uses little mobile data.
      const compressed = await compressPhoto(file);
      setImageUrl(compressed.dataUrl);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Could not load selected image.');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setEditingLocalId(null);
    setFarmName('');
    setProductName('');
    setTown('');
    setDescription('');
    setSellerPhone('');
    setPhoneConsent(false);
    setAvailabilityStatus('Available');
    setPostError(null);
  };

  const handleStartEdit = (item: MarketplaceListing) => {
    setEditingId(item.id);
    setSellerType(isSupplierItem(item) ? 'supplier' : 'farmer');
    setSellerName(item.seller_name);
    setFarmName(item.farm_name || '');
    setCategory(item.category);
    setProductName(item.product_name);
    setQuantity(item.quantity);
    setUnit(item.unit);
    setPriceLrd(String(item.price_lrd));
    setAvailabilityStatus(
      (item.availability_status as 'Available' | 'Limited Stock' | 'Sold Out') || 'Available'
    );
    setCounty(item.county);
    setTown(item.town);
    setDescription(item.description);
    setSellerPhone(item.seller_phone || '');
    setPhoneConsent(item.phone_consent === 1);
    setImageUrl(item.image_url);
    setPostError(null);
    setViewMode('sell');
  };

  const handleQuickAvailability = async (
    item: MarketplaceListing,
    nextAvail: 'Available' | 'Limited Stock' | 'Sold Out'
  ) => {
    try {
      await apiFetch(`/marketplace/listings/${item.id}`, {
        method: 'PATCH',
        headers: ownerHeaders(item.id),
        body: JSON.stringify({
          availabilityStatus: nextAvail,
        }),
      });
      await loadMarketplace();
    } catch {
      // ignore
    }
  };

  const currentListingData = (): ListingData => ({
    sellerType,
    sellerName: sellerName || 'Liberia Farmer',
    farmName,
    category,
    productName,
    quantity,
    unit,
    priceLrd,
    county,
    town,
    availabilityStatus,
    description,
    photoDataUrl: imageUrl,
    sellerPhone,
    phoneConsent,
  });

  /** Saves the form on this phone (IndexedDB). `queue` also marks it Pending Sync. */
  const handleSaveOnPhone = async (queue: boolean) => {
    setPostError(null);
    setPostSuccess(null);
    const data = currentListingData();
    const problem = validateListing(data);
    if (problem) {
      setPostError(problem);
      return;
    }
    setPosting(true);
    try {
      const rec = await saveListingDraft(data, editingLocalId ?? undefined);
      if (queue) {
        await queueRecord('listing', rec.localId);
        syncSoon();
      }
      setPostSuccess(
        queue
          ? 'Saved on this phone. It will be sent when you are online and will show as Published only after the server confirms it.'
          : 'Draft saved on this phone. It is not on the marketplace.'
      );
      resetForm();
      setViewMode('browse');
    } catch (err) {
      setPostError(
        err instanceof DraftError
          ? err.message
          : 'Could not save on this phone. Free some storage and try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  const handleEditLocal = (rec: ListingRecord) => {
    const d = rec.data;
    setEditingId(null);
    setEditingLocalId(rec.localId);
    setSellerType(d.sellerType);
    setSellerName(d.sellerName);
    setFarmName(d.farmName);
    setCategory(d.category);
    setProductName(d.productName);
    setQuantity(d.quantity);
    setUnit(d.unit);
    setPriceLrd(d.priceLrd);
    setAvailabilityStatus(d.availabilityStatus);
    setCounty(d.county);
    setTown(d.town);
    setDescription(d.description);
    setSellerPhone(d.sellerPhone);
    setPhoneConsent(d.phoneConsent);
    setImageUrl(d.photoDataUrl || PRESET_IMAGES[0].url);
    setPostError(null);
    setViewMode('sell');
  };

  const handleSaveListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && !isOnline) {
      setPostError('Changing a listing that is already online needs internet. Reconnect, or make a new draft on this phone.');
      return;
    }
    if (!isOnline || editingLocalId) {
      // Offline (or editing something already kept on the phone): never publish directly.
      await handleSaveOnPhone(true);
      return;
    }
    setPostError(null);
    setPostSuccess(null);

    if (sellerPhone.trim()) {
      const phoneCheck = normalizeLiberianPhone(sellerPhone);
      if (!phoneCheck.valid) {
        setPostError(phoneCheck.error || 'Enter a valid Liberian phone number.');
        return;
      }
    }

    setPosting(true);
    const baseSeller = (sellerName || 'Liberia Farmer').trim();
    const formattedSeller =
      sellerType === 'supplier' && !baseSeller.toLowerCase().includes('supplier')
        ? `${baseSeller} (Supplier)`
        : baseSeller;

    try {
      if (editingId) {
        await apiFetch(`/marketplace/listings/${editingId}`, {
          method: 'PATCH',
          headers: ownerHeaders(editingId),
          body: JSON.stringify({
            sellerName: formattedSeller,
            farmName,
            category,
            productName,
            quantity,
            unit,
            priceLrd: Number(priceLrd),
            availabilityStatus,
            county,
            town,
            description,
            sellerPhone: sellerPhone.trim(),
            phoneConsent,
          }),
        });
        setPostSuccess('Listing updated successfully.');
      } else {
        // A fresh secret for this listing: the server keeps only a hash; this device keeps the key to manage it later.
        const newKey = generateOwnerKey();
        const created = await apiFetch<{listing: {id: number}}>('/marketplace/listings', {
          method: 'POST',
          body: JSON.stringify({
            ownerKey: newKey,
            sellerName: formattedSeller,
            farmName,
            category,
            productName,
            quantity,
            unit,
            priceLrd: Number(priceLrd),
            availabilityStatus,
            county,
            town,
            description,
            imageUrl,
            sellerPhone: sellerPhone.trim(),
            phoneConsent,
          }),
        });
        saveListingKey(created.listing.id, newKey);
        setPostSuccess(
          sellerType === 'supplier'
            ? 'Agricultural Supplier listing published to Marketplace!'
            : 'Farmer listing published to Marketplace!'
        );
      }
      resetForm();
      setViewMode('browse');
      await loadMarketplace();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Unable to save listing.');
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteListing = async (id: number) => {
    try {
      await apiFetch(`/marketplace/listings/${id}`, {
        method: 'DELETE',
        headers: ownerHeaders(id),
      });
      removeListingKey(id);
      await loadMarketplace();
    } catch {
      // ignore
    }
  };

  const renderFilterControls = (idPrefix: string) => (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-county`} className="block text-xs font-bold text-[#183B2B] mb-1.5">
          Liberian County (All 15)
        </label>
        <select
          id={`${idPrefix}-county`}
          value={countyFilter}
          onChange={(e) => setCountyFilter(e.target.value)}
          className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0] px-3 text-sm font-medium text-[#183B2B]"
        >
          <option value="">All 15 Counties</option>
          {counties.map((c) => (
            <option key={c} value={c}>
              {c} County
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-cat`} className="block text-xs font-bold text-[#183B2B] mb-1.5">
          Agricultural Category
        </label>
        <select
          id={`${idPrefix}-cat`}
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0] px-3 text-sm font-medium text-[#183B2B]"
        >
          <option value="">All 9 Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-maxprice`} className="block text-xs font-bold text-[#183B2B] mb-1.5">
          Maximum Price (LRD)
        </label>
        <input
          id={`${idPrefix}-maxprice`}
          type="number"
          min={0}
          step={100}
          value={maxPriceFilter}
          onChange={(e) => setMaxPriceFilter(e.target.value)}
          placeholder="e.g., 8000"
          className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0] px-3 text-sm text-[#183B2B]"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            {label: 'Any', val: ''},
            {label: '≤ 2,000', val: '2000'},
            {label: '≤ 5,000', val: '5000'},
            {label: '≤ 10,000', val: '10000'},
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setMaxPriceFilter(preset.val)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                maxPriceFilter === preset.val
                  ? 'bg-[#16803C] border-[#16803C] text-white'
                  : 'bg-white border-[#183B2B]/15 text-[#183B2B]/80 hover:bg-[#DDEFE0]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-avail`} className="block text-xs font-bold text-[#183B2B] mb-1.5">
          Product Availability
        </label>
        <select
          id={`${idPrefix}-avail`}
          value={availFilter}
          onChange={(e) => setAvailFilter(e.target.value)}
          className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0] px-3 text-sm font-medium text-[#183B2B]"
        >
          <option value="">All Availability</option>
          {availabilityOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={clearAllFilters}
        className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 bg-white text-xs sm:text-sm font-bold text-[#183B2B] hover:bg-[#F3F8F0] transition-colors"
      >
        Clear Filters
      </button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#16803C]">
            Module 1 · Direct Farmer &amp; Supplier Marketplace · No Written Messages Required
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
            Agricultural Marketplace
          </h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 max-w-2xl">
            Browse verified-format local produce and agricultural supplies across Liberia’s 15 counties. Inspect full details and call farmers directly—built for accessibility without requiring reading or written replies.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('browse')}
            className={`min-h-[46px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold border transition-colors ${
              viewMode === 'browse'
                ? 'bg-[#183B2B] border-[#183B2B] text-white'
                : 'bg-white border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
            }`}
          >
            <Store className="w-4 h-4" aria-hidden="true" />
            <span>Browse Products ({displayedListings.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setSellerType('farmer');
              setCategory('Rice and grains');
              setViewMode('sell');
            }}
            className="min-h-[46px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#16803C] text-white text-xs sm:text-sm font-bold hover:bg-[#116630]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Post Farmer Listing</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setSellerType('supplier');
              setCategory('Seeds and seedlings');
              setViewMode('sell');
            }}
            className="min-h-[46px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#F5B942] text-[#183B2B] text-xs sm:text-sm font-bold hover:bg-[#f7c55f]"
          >
            <Package className="w-4 h-4" aria-hidden="true" />
            <span>Post Supplier Input</span>
          </button>
        </div>
      </div>

      {postSuccess && (
        <div role="status" className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/30 p-3.5 text-sm font-semibold text-[#183B2B] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
          <span>{postSuccess}</span>
        </div>
      )}

      <LocalListingsPanel onEdit={handleEditLocal} />

      {!isOnline && viewMode === 'browse' && (
        <div className="rounded-2xl bg-[#F5B942]/25 border border-[#F5B942] p-4 text-sm font-medium text-[#183B2B]">
          Live listings need internet. You can still prepare a listing to sell: tap <strong>Sell</strong>, fill the form, and it will be sent when you are
          back online.
        </div>
      )}

      {/* BROWSE VIEW: AGRICONNECT-INSPIRED TWO-COLUMN LAYOUT */}
      {viewMode === 'browse' && (
        <div className="space-y-4">
          {/* Search + Role Pills + Mobile Filter Trigger */}
          <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <label htmlFor="mkt-search" className="sr-only">
                  Search marketplace products
                </label>
                <Search className="w-4 h-4 text-[#183B2B]/50 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="mkt-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rice, cassava, tilapia, eggs, seeds, towns, or farmers..."
                  className="w-full min-h-[46px] rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0]/60 pl-10 pr-4 text-sm"
                />
              </div>

              {/* Mobile collapsible filter drawer trigger */}
              <button
                type="button"
                onClick={() => setMobileFilterOpen(true)}
                className="lg:hidden min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#DDEFE0] text-[#183B2B] text-sm font-bold border border-[#16803C]/25"
              >
                <SlidersHorizontal className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                <span>Filter Products{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[#183B2B]/70 mr-1">View:</span>
              {[
                {id: 'all', label: 'All Products'},
                {id: 'farmer', label: 'Farmer Produce'},
                {id: 'supplier', label: 'Agricultural Supplies'},
                {id: 'mine', label: 'My Listings'},
              ].map((rf) => (
                <button
                  key={rf.id}
                  type="button"
                  onClick={() => setRoleFilter(rf.id as 'all' | 'farmer' | 'supplier' | 'mine')}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    roleFilter === rf.id
                      ? 'bg-[#16803C] border-[#16803C] text-white'
                      : 'bg-white border-[#183B2B]/15 text-[#183B2B] hover:bg-[#F3F8F0]'
                  }`}
                >
                  {rf.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* LEFT SIDEBAR: FILTER PRODUCTS (Desktop) */}
            <aside
              aria-label="Filter Products"
              className="hidden lg:block w-72 shrink-0 rounded-3xl bg-white border border-[#183B2B]/10 p-5 shadow-xs sticky top-20 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-[#183B2B]/10 pb-3">
                <h2 className="font-display font-bold text-base text-[#183B2B] flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                  <span>Filter Products</span>
                </h2>
                {activeFilterCount > 0 && (
                  <span className="text-xs font-bold text-[#16803C]">{activeFilterCount} active</span>
                )}
              </div>
              {renderFilterControls('sidebar')}
            </aside>

            {/* RIGHT CONTENT AREA: PRODUCT GRID */}
            <div className="flex-1 w-full min-w-0">
              {!isOnline && listings.length > 0 && (
                <p role="status" className="mb-3 rounded-2xl bg-amber-50 border border-amber-300 px-4 py-3 text-base font-semibold text-amber-900">
                  Saved Information — Not Live: these listings were loaded earlier{loadedAt ? ` (${new Date(loadedAt).toLocaleTimeString()})` : ''} and may have changed.
                </p>
              )}
              {loadStatus === 'error' && isOnline && listings.length > 0 && (
                <p role="alert" className="mb-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-base font-semibold text-red-800">
                  Could not refresh listings. Showing the last ones loaded.{' '}
                  <button type="button" onClick={() => void loadMarketplace()} className="underline font-bold min-h-[44px]">Try again</button>
                </p>
              )}
              {loading ? (
                <div className="py-14 text-center text-sm text-[#183B2B]/70">Loading marketplace products...</div>
              ) : displayedListings.length === 0 ? (
                <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-8 sm:p-10 text-center space-y-3 shadow-xs" role="status" data-testid="marketplace-empty">
                  {!isOnline ? (
                    <>
                      <p className="font-display font-bold text-lg text-[#183B2B]">Live listings need internet</p>
                      <p className="text-base text-[#183B2B]/80">
                        You are offline, and listings from other farmers are not saved on this phone. Filters are not the problem.
                      </p>
                      <p className="text-base text-[#183B2B]/80">You can still prepare a listing to sell. It is sent when you are back online.</p>
                      <button type="button" onClick={() => setViewMode('sell')} className="min-h-[48px] px-5 py-2 rounded-xl bg-[#16803C] text-white text-base font-bold">
                        Prepare a Listing
                      </button>
                    </>
                  ) : loadStatus === 'error' ? (
                    <>
                      <p className="font-display font-bold text-lg text-[#183B2B]">Could not load listings</p>
                      <p className="text-base text-[#183B2B]/80">The server did not answer. This does not mean there are no products. Check your connection and try again.</p>
                      <button type="button" onClick={() => void loadMarketplace()} className="min-h-[48px] px-5 py-2 rounded-xl bg-[#16803C] text-white text-base font-bold">
                        Try Again
                      </button>
                    </>
                  ) : activeFilterCount > 0 || search.trim() !== '' || roleFilter !== 'all' ? (
                    <>
                      <p className="font-display font-bold text-lg text-[#183B2B]">No products match your filters</p>
                      <p className="text-base text-[#183B2B]/80">Try changing your search, county, category, price, availability or seller type.</p>
                      <button type="button" onClick={clearAllFilters} className="min-h-[48px] px-5 py-2 rounded-xl bg-[#16803C] text-white text-base font-bold">
                        Clear Filters
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="font-display font-bold text-lg text-[#183B2B]">No products are published yet</p>
                      <p className="text-base text-[#183B2B]/80">The marketplace answered, and it has no listings right now. Be the first to post one.</p>
                      <button type="button" onClick={() => setViewMode('sell')} className="min-h-[48px] px-5 py-2 rounded-xl bg-[#16803C] text-white text-base font-bold">
                        Post a Listing
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {displayedListings.map((item) => {
                    const isMine = isMineItem(item);
                    const avail = item.availability_status || 'Available';
                    const availClass = AVAILABILITY_BADGE_CLASS[avail] || AVAILABILITY_BADGE_CLASS.Available;
                    const callState = getCallState(item);

                    return (
                      <article
                        key={item.id}
                        className="rounded-3xl bg-white border border-[#183B2B]/10 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          {/* Product Image + Badges */}
                          <div className="relative bg-[#DDEFE0]">
                            {!lowBandwidth ? (
                              <div className="h-48 overflow-hidden">
                                <SafeImage
                                  src={item.image_url}
                                  alt={item.product_name}
                                  className="w-full h-full object-cover"
                                  fallbackTitle={item.product_name}
                                />
                              </div>
                            ) : (
                              <div className="h-20 flex items-center px-4 text-xs font-semibold text-[#16803C]">
                                Low-Data Mode · Photo Hidden
                              </div>
                            )}

                            <div className="px-4 pt-3 flex flex-wrap items-center justify-between gap-1.5 bg-white">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg bg-[#DDEFE0] text-[#16803C] text-[11px] font-bold">
                                {item.category}
                              </span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${availClass}`}>
                                {avail}
                              </span>
                            </div>
                          </div>

                          <div className="p-4 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#183B2B]/75">
                                <span className="inline-flex items-center gap-1 font-semibold text-[#183B2B]">
                                  <MapPin className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" />
                                  {item.county} County
                                </span>
                                {item.is_fictional_seller !== 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-[#F5B942]/30 text-[#183B2B] text-[10px] font-bold">
                                    Demo Listing
                                  </span>
                                )}
                              </div>
                              <SpeakButton
                                compact
                                id={`mkt-${item.id}`}
                                label={item.product_name}
                                text={`${item.product_name} by ${item.seller_name}. Price ${item.price_lrd} Liberian dollars per ${item.unit}. ${item.quantity} ${item.unit} available in ${item.town}, ${item.county} County.${item.description ? ' ' + item.description : ''}`}
                              />
                            </div>

                            <h2 className="font-display text-lg font-extrabold text-[#183B2B] leading-snug">
                              {item.product_name}
                            </h2>

                            <p className="text-xs font-semibold text-[#183B2B]/75 flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" />
                              <span>{item.farm_name ? `${item.seller_name} · ${item.farm_name}` : item.seller_name}</span>
                            </p>

                            <div className="rounded-2xl bg-[#F3F8F0] px-3.5 py-2.5 flex items-baseline justify-between gap-2">
                              <p className="font-display text-xl font-extrabold text-[#16803C] tabular-nums">
                                LRD {item.price_lrd.toLocaleString()}
                              </p>
                              <span className="text-xs font-semibold text-[#183B2B]/75">per {item.unit}</span>
                            </div>

                            <p className="text-xs font-semibold text-[#183B2B]/80">
                              Available Quantity: <span className="text-[#183B2B]">{item.quantity} {item.unit}</span>
                            </p>
                          </div>
                        </div>

                        {/* Card Primary Actions: Details + Call Farmer */}
                        <div className="px-4 pb-4 pt-2 border-t border-[#183B2B]/10 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => void handleOpenDetails(item)}
                              className="min-h-[46px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#16803C] bg-white text-[#16803C] text-xs sm:text-sm font-bold hover:bg-[#DDEFE0] transition-colors"
                            >
                              <Eye className="w-4 h-4" aria-hidden="true" />
                              <span>Details</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenCall(item)}
                              className={`min-h-[46px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                                callState.isUnavailable
                                  ? 'bg-[#183B2B]/10 text-[#183B2B]/75 hover:bg-[#183B2B]/15'
                                  : 'bg-[#16803C] text-white hover:bg-[#116630]'
                              }`}
                            >
                              {callState.isUnavailable ? (
                                <PhoneOff className="w-4 h-4" aria-hidden="true" />
                              ) : (
                                <Phone className="w-4 h-4" aria-hidden="true" />
                              )}
                              <span>Call Farmer</span>
                            </button>
                          </div>

                          {/* Farmer Self-Management Controls (own listings) */}
                          {isMine && (
                            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#183B2B]/10">
                              <select
                                aria-label={`Availability for ${item.product_name}`}
                                value={avail}
                                onChange={(e) =>
                                  void handleQuickAvailability(
                                    item,
                                    e.target.value as 'Available' | 'Limited Stock' | 'Sold Out'
                                  )
                                }
                                className="min-h-[44px] flex-1 rounded-lg border border-[#183B2B]/15 bg-[#F3F8F0] px-2 text-xs font-semibold text-[#183B2B]"
                              >
                                {availabilityOptions.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                aria-label={`Edit ${item.product_name}`}
                                className="min-h-[44px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-[#183B2B]/15 text-[#183B2B] hover:bg-[#F3F8F0]"
                              >
                                <Edit3 className="w-4 h-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteListing(item.id)}
                                aria-label={`Delete ${item.product_name}`}
                                className="min-h-[44px] min-w-[38px] inline-flex items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT LISTING FORM (WITH PHONE & CONSENT) */}
      {viewMode === 'sell' && (
        <form
          onSubmit={(e) => void handleSaveListing(e)}
          className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-5 max-w-3xl shadow-xs"
        >
          <div className="border-b border-[#183B2B]/10 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold text-[#183B2B]">
                {editingId ? 'Edit Your Marketplace Listing' : editingLocalId ? 'Edit Your Saved Listing' : 'Post a Produce or Supplier Listing'}
              </h2>
              <p className="text-xs text-[#183B2B]/75 mt-1">
                Buyers call farmers directly by phone—no reading or replying to written inquiries required.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setViewMode('browse');
              }}
              className="text-xs font-semibold text-[#183B2B]/70 hover:text-[#183B2B] underline"
            >
              Back to Marketplace
            </button>
          </div>

          {/* Role Toggle */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {id: 'farmer', label: 'Farmer Produce Listing'},
              {id: 'supplier', label: 'Agricultural Supplier Input'},
            ].map((rt) => (
              <button
                key={rt.id}
                type="button"
                onClick={() => {
                  setSellerType(rt.id as 'farmer' | 'supplier');
                  if (rt.id === 'supplier' && !editingId) setCategory('Seeds and seedlings');
                }}
                className={`min-h-[46px] px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold border transition-colors ${
                  sellerType === rt.id
                    ? 'bg-[#16803C] border-[#16803C] text-white'
                    : 'bg-[#F3F8F0] border-[#183B2B]/15 text-[#183B2B]'
                }`}
              >
                {rt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sell-name" className="block text-sm font-semibold mb-1.5">
                {sellerType === 'supplier' ? 'Supplier Contact Name' : 'Farmer Name'}
              </label>
              <input
                id="sell-name"
                type="text"
                required
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                placeholder={sellerType === 'supplier' ? 'e.g., Musa Kromah' : 'e.g., Kebbeh Flomo'}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="sell-farm" className="block text-sm font-semibold mb-1.5">
                Farm or Business Name (Optional)
              </label>
              <input
                id="sell-farm"
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g., Flomo Family Rice Farm"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sell-product" className="block text-sm font-semibold mb-1.5">
                Product Name
              </label>
              <input
                id="sell-product"
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g., Premium Lofa Country Rice"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="sell-cat" className="block text-sm font-semibold mb-1.5">
                Product Category
              </label>
              <select
                id="sell-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="sell-qty" className="block text-sm font-semibold mb-1.5">
                Quantity
              </label>
              <input
                id="sell-qty"
                type="text"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="sell-unit" className="block text-sm font-semibold mb-1.5">
                Measurement Unit
              </label>
              <select
                id="sell-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sell-price" className="block text-sm font-semibold mb-1.5">
                Price (LRD)
              </label>
              <input
                id="sell-price"
                type="number"
                required
                min={10}
                value={priceLrd}
                onChange={(e) => setPriceLrd(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="sell-avail" className="block text-sm font-semibold mb-1.5">
                Availability
              </label>
              <select
                id="sell-avail"
                value={availabilityStatus}
                onChange={(e) =>
                  setAvailabilityStatus(e.target.value as 'Available' | 'Limited Stock' | 'Sold Out')
                }
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {availabilityOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sell-county" className="block text-sm font-semibold mb-1.5">
                County
              </label>
              <select
                id="sell-county"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {counties.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sell-town" className="block text-sm font-semibold mb-1.5">
                Town / Community
              </label>
              <input
                id="sell-town"
                type="text"
                required
                value={town}
                onChange={(e) => setTown(e.target.value)}
                placeholder="e.g., Voinjama, Gbarnga, Kakata"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              />
            </div>
          </div>

          {/* Phone Number + Consent */}
          <div className="rounded-2xl bg-[#F3F8F0] border border-[#16803C]/20 p-4 space-y-3">
            <div>
              <label htmlFor="sell-phone" className="block text-sm font-bold text-[#183B2B] mb-1">
                Farmer / Seller Phone Number (Liberia)
              </label>
              <input
                id="sell-phone"
                type="tel"
                value={sellerPhone}
                onChange={(e) => setSellerPhone(e.target.value)}
                placeholder="e.g., 077 012 3456 or +231 77 012 3456"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 bg-white px-3 text-sm"
              />
              <p className="text-xs text-[#183B2B]/70 mt-1">
                Leave blank if you prefer not to publish a phone number. Valid Liberian numbers are normalized to +231 format.
              </p>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={phoneConsent}
                onChange={(e) => setPhoneConsent(e.target.checked)}
                className="mt-1 w-4 h-4 accent-[#16803C]"
              />
              <span className="text-xs sm:text-sm font-medium text-[#183B2B]">
                I consent to display my phone number publicly on this listing so interested buyers can call me directly. (Phone verification status will remain marked as unverified/self-reported.)
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="sell-desc" className="block text-sm font-semibold mb-1.5">
              Product Description &amp; Quality Notes (Optional)
            </label>
            <textarea
              id="sell-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional: Describe harvest freshness, drying method, and pickup points..."
              className="w-full rounded-2xl border border-[#183B2B]/20 p-3 text-sm"
            />
          </div>

          {!editingId && (
            <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#183B2B]">Product Photo (Upload or Sample Image)</p>
                <label className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-semibold cursor-pointer">
                  <Camera className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                  <span>Upload Photo</span>
                  <input type="file" accept="image/*" onChange={(e) => void handlePhotoUpload(e)} className="sr-only" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_IMAGES.map((img) => (
                  <button
                    key={img.label}
                    type="button"
                    onClick={() => setImageUrl(img.url)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                      imageUrl === img.url
                        ? 'bg-[#16803C] border-[#16803C] text-white'
                        : 'bg-white border-[#183B2B]/15 text-[#183B2B]'
                    }`}
                  >
                    {img.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {postError && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{postError}</span>
            </div>
          )}

          {!isOnline && (
            <p className="rounded-xl bg-[#F5B942]/25 border border-[#F5B942] px-3 py-2 text-xs sm:text-sm font-medium text-[#183B2B]">
              You are offline. Your listing will be saved <strong>on this phone</strong> and sent when the internet returns. It is not
              public until the server confirms it. A phone number is only saved and sent if you tick the consent box.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={posting}
              className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630] disabled:opacity-50"
            >
              {posting
                ? 'Saving Listing...'
                : editingLocalId
                ? isOnline
                  ? 'Save & Send'
                  : 'Save & Sync When Online'
                : !isOnline
                ? 'Save & Sync When Online'
                : editingId
                ? 'Save Changes'
                : 'Publish Listing'}
            </button>
            {!editingId && (
              <button
                type="button"
                disabled={posting}
                onClick={() => void handleSaveOnPhone(false)}
                className="min-h-[48px] px-5 py-3 rounded-2xl border border-[#183B2B]/25 text-[#183B2B] text-sm font-bold bg-white disabled:opacity-50"
              >
                Save Draft on Phone
              </button>
            )}
          </div>
        </form>
      )}

      {/* MOBILE COLLAPSIBLE FILTER DRAWER */}
      {mobileFilterOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-start bg-black/45 backdrop-blur-xs lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filter Products Drawer"
        >
          <div className="w-full max-w-xs bg-white h-full overflow-y-auto p-5 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#183B2B]/10 pb-3">
              <h2 className="font-display font-bold text-lg text-[#183B2B] flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                <span>Filter Products</span>
              </h2>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                aria-label="Close filters"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#F3F8F0]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderFilterControls('drawer')}
            <button
              type="button"
              onClick={() => setMobileFilterOpen(false)}
              className="w-full min-h-[46px] rounded-xl bg-[#16803C] text-white text-sm font-bold"
            >
              Show {displayedListings.length} Products
            </button>
          </div>
        </div>
      )}

      {/* LARGE CENTERED PRODUCT DETAILS MODAL */}
      {detailsListing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="details-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailsListing(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
        >
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-[#183B2B]/10">
            {/* Modal Top Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md px-5 sm:px-7 py-4 border-b border-[#183B2B]/10 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-[#DDEFE0] text-[#16803C] text-xs font-bold">
                  {detailsListing.category}
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#F3F8F0] text-[#183B2B] text-xs font-semibold">
                  <MapPin className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" />
                  {detailsListing.county} County
                </span>
                {detailsListing.is_fictional_seller !== 0 && (
                  <span className="px-2.5 py-1 rounded-xl bg-[#F5B942]/30 text-[#183B2B] text-xs font-bold">
                    Demo Listing
                  </span>
                )}
              </div>

              <button
                ref={detailsCloseRef}
                type="button"
                onClick={() => setDetailsListing(null)}
                aria-label="Close product details"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#183B2B]/10 hover:bg-[#F3F8F0] shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-7 space-y-6">
              {/* Large Image */}
              {!lowBandwidth && (
                <div className="h-56 sm:h-72 rounded-2xl overflow-hidden bg-[#DDEFE0] border border-[#183B2B]/10">
                  <SafeImage
                    src={detailsListing.image_url}
                    alt={detailsListing.product_name}
                    className="w-full h-full object-cover"
                    fallbackTitle={detailsListing.product_name}
                  />
                </div>
              )}

              {/* Title + Highlighted Green Price Section */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 id="details-modal-title" className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B]">
                    {detailsListing.product_name}
                  </h2>
                  <SpeakButton
                    compact
                    id={`modal-speak-${detailsListing.id}`}
                    label={detailsListing.product_name}
                    text={`${detailsListing.product_name}. Price ${detailsListing.price_lrd} Liberian dollars per ${detailsListing.unit}. ${detailsListing.quantity} ${detailsListing.unit} available in ${detailsListing.town}, ${detailsListing.county} County. Seller: ${detailsListing.seller_name}.${detailsListing.description ? ' ' + detailsListing.description : ''}`}
                  />
                </div>

                <div className="rounded-2xl bg-[#16803C] text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-white/80 uppercase tracking-wide">Listed Price</p>
                    <p className="font-display text-2xl sm:text-3xl font-extrabold tabular-nums">
                      LRD {detailsListing.price_lrd.toLocaleString()}{' '}
                      <span className="text-sm font-medium text-white/85">per {detailsListing.unit}</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/15 px-4 py-2 text-right">
                    <p className="text-[11px] font-semibold text-white/80">Available Quantity</p>
                    <p className="font-display text-lg font-bold">
                      {detailsListing.quantity} {detailsListing.unit}
                    </p>
                  </div>
                </div>
              </div>

              {/* PRODUCT DETAILS & QUALITY */}
              {detailsListing.description?.trim() && (
                <div className="space-y-2">
                  <h3 className="text-xs font-extrabold tracking-wider uppercase text-[#16803C]">
                    PRODUCT DETAILS &amp; QUALITY
                  </h3>
                  <p className="text-sm sm:text-base text-[#183B2B]/85 leading-relaxed bg-[#F3F8F0] rounded-2xl p-4">
                    {detailsListing.description}
                  </p>
                </div>
              )}

              {/* Two Information Sections */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[#183B2B]/10 p-4 space-y-2">
                  <h3 className="text-xs font-extrabold tracking-wider uppercase text-[#16803C] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                    <span>Harvest &amp; Market Location</span>
                  </h3>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#183B2B]/65">Town:</dt>
                      <dd className="font-semibold text-[#183B2B]">{detailsListing.town}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#183B2B]/65">County:</dt>
                      <dd className="font-semibold text-[#183B2B]">{detailsListing.county} County</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#183B2B]/65">Country:</dt>
                      <dd className="font-semibold text-[#183B2B]">Liberia</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-2xl border border-[#183B2B]/10 p-4 space-y-2">
                  <h3 className="text-xs font-extrabold tracking-wider uppercase text-[#16803C] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" aria-hidden="true" />
                    <span>Market Engagement</span>
                  </h3>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#183B2B]/65">Listing Date:</dt>
                      <dd className="font-semibold text-[#183B2B]">{formatDateLabel(detailsListing.created_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#183B2B]/65">Product Availability:</dt>
                      <dd className="font-semibold text-[#183B2B]">
                        {detailsListing.availability_status || 'Available'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[#183B2B]/65">Buyer Views:</dt>
                      <dd className="font-semibold text-[#183B2B] tabular-nums">
                        {detailsListing.view_count ?? 0}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* PRODUCER / SELLER INFORMATION */}
              {(() => {
                const callState = getCallState(detailsListing);
                return (
                  <div className="rounded-2xl bg-[#F3F8F0] border border-[#16803C]/20 p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-extrabold tracking-wider uppercase text-[#16803C]">
                        PRODUCER / SELLER INFORMATION
                      </h3>
                      <span className="text-xs font-semibold text-[#183B2B]/70">
                        {detailsListing.phone_verified === 1
                          ? 'Phone Verified'
                          : callState.hasConsentedRealPhone
                          ? 'Unverified (Self-Reported Contact)'
                          : callState.isDemoSimulatedCall
                          ? 'Demo Seller (Not Real Contact)'
                          : 'No Public Phone Provided'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-[#183B2B]/65">Farmer / Seller Name</p>
                        <p className="font-bold text-[#183B2B]">{detailsListing.seller_name}</p>
                      </div>
                      {detailsListing.farm_name && (
                        <div>
                          <p className="text-xs text-[#183B2B]/65">Farm / Business Name</p>
                          <p className="font-bold text-[#183B2B]">{detailsListing.farm_name}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-[#183B2B]/65">Telephone Contact</p>
                        <p className="font-bold text-[#183B2B]">
                          {callState.hasConsentedRealPhone
                            ? callState.phoneCheck.display
                            : callState.isDemoSimulatedCall
                            ? 'Demo Listing (Simulated Call Only)'
                            : 'Phone Number Unavailable'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenCall(detailsListing)}
                      className={`w-full min-h-[52px] inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-2xl text-base font-extrabold transition-colors ${
                        callState.isUnavailable
                          ? 'bg-[#183B2B]/15 text-[#183B2B]/75'
                          : 'bg-[#16803C] text-white hover:bg-[#116630] shadow-sm'
                      }`}
                    >
                      {callState.isUnavailable ? (
                        <PhoneOff className="w-5 h-5" aria-hidden="true" />
                      ) : (
                        <PhoneCall className="w-5 h-5" aria-hidden="true" />
                      )}
                      <span>
                        {callState.isUnavailable ? 'Phone Number Unavailable' : 'Call Farmer'}
                      </span>
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* DIRECT CALL FARMER MODAL (REAL DIALER / COPY NUMBER / DEMO SIMULATION / UNAVAILABLE) */}
      {callListing && (() => {
        const callState = getCallState(callListing);
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCallListing(null);
            }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
          >
            <div className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-2xl border border-[#183B2B]/10">
              <div className="flex items-start justify-between gap-3 border-b border-[#183B2B]/10 pb-3">
                <div>
                  <p className="text-xs font-bold text-[#16803C]">
                    {callState.hasConsentedRealPhone
                      ? 'Direct Telephone Contact'
                      : callState.isDemoSimulatedCall
                      ? 'Demo Listing · Simulated Call Preview'
                      : 'Contact Status'}
                  </p>
                  <h2 id="call-modal-title" className="font-display text-xl font-extrabold text-[#183B2B]">
                    {callState.isUnavailable ? 'Phone Number Unavailable' : `Call ${callListing.seller_name}`}
                  </h2>
                </div>
                <button
                  ref={callCloseRef}
                  type="button"
                  onClick={() => setCallListing(null)}
                  aria-label="Close call dialog"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#F3F8F0]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1 text-sm">
                <p className="font-bold text-[#183B2B]">{callListing.product_name}</p>
                <p className="text-xs text-[#183B2B]/75">
                  {callListing.seller_name} · {callListing.town}, {callListing.county} County
                </p>
                <p className="text-sm font-extrabold text-[#16803C] pt-1">
                  LRD {callListing.price_lrd.toLocaleString()} per {callListing.unit}
                </p>
              </div>

              {callState.hasConsentedRealPhone ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#16803C]/30 bg-[#DDEFE0]/50 p-4 text-center space-y-1">
                    <p className="text-xs font-semibold text-[#183B2B]/70">Consented Farmer Number</p>
                    <p className="font-display text-2xl font-extrabold text-[#183B2B] tracking-wide tabular-nums">
                      {callState.phoneCheck.display}
                    </p>
                    <p className="text-[11px] font-semibold text-[#183B2B]/65">
                      Status: Unverified (Self-Reported by Seller)
                    </p>
                  </div>

                  <a
                    href={callState.phoneCheck.telHref}
                    className="w-full min-h-[50px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#16803C] text-white text-sm font-extrabold hover:bg-[#116630]"
                  >
                    <PhoneCall className="w-5 h-5" aria-hidden="true" />
                    <span>Open Phone Dialer ({callState.phoneCheck.display})</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => void handleCopyPhone(callState.phoneCheck.normalized)}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#183B2B]/20 text-xs sm:text-sm font-bold text-[#183B2B] hover:bg-[#F3F8F0]"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                        <span>Number Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" aria-hidden="true" />
                        <span>Copy Number (For Desktop Computers)</span>
                      </>
                    )}
                  </button>

                  <p className="text-xs text-[#183B2B]/70 leading-relaxed">
                    Opens your device&apos;s telephone dialer so you can speak with the farmer directly. Agri-Advisory Liberia does not complete calls automatically.
                  </p>
                </div>
              ) : callState.isDemoSimulatedCall ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-[#F5B942]/20 border border-[#F5B942] p-4 space-y-2 text-xs sm:text-sm text-[#183B2B]">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Demo Listing — Simulated Direct Call</span>
                    </p>
                    <p className="leading-relaxed">
                      This sample listing belongs to a fictional hackathon seller, so no real phone call is initiated and no fake phone number is displayed.
                    </p>
                    <p className="leading-relaxed">
                      When a real farmer posts a listing with their consented Liberian number, clicking <strong>Call Farmer</strong> opens their phone dialer (<code>tel:</code>) directly—removing reading barriers.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCallListing(null);
                      setDetailsListing(null);
                      resetForm();
                      setViewMode('sell');
                    }}
                    className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16803C] text-white text-xs sm:text-sm font-bold hover:bg-[#116630]"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Try Posting a Listing With a Consented Number</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-red-50 border border-red-200 p-4 space-y-2 text-xs sm:text-sm text-red-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <PhoneOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Phone Number Unavailable</span>
                  </p>
                  <p className="leading-relaxed">
                    The seller has not provided or consented to display a telephone number for this listing. No placeholder number is substituted.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

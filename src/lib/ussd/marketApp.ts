import {apiFetch} from '../api';
import {getRequesterKey} from '../listingKeys';
import {getListingRecords, initDrafts, queueRecord, saveListingDraft} from '../offlineDrafts';
import {syncSoon} from '../syncEngine';
import {harvestClient} from '../triageApp';
import {createUssdMarketClient} from './marketClient';

/** All writes follow the same API/queue path as the existing harvest workspace. */
export const createBrowserUssdMarket = (online: () => boolean) => createUssdMarketClient({
  enabled: import.meta.env?.VITE_USSD_MARKETPLACE_ENABLED === 'true', online,
  uuid: () => crypto.randomUUID(),
  get: (path, headers) => apiFetch(path, {headers}),
  post: (path, body, headers) => apiFetch(path, {method: 'POST', headers, body: JSON.stringify(body)}),
  loadMarket: () => harvestClient.load(), init: initDrafts, records: getListingRecords,
  save: saveListingDraft, queue: (localId) => queueRecord('listing', localId), syncSoon, requesterKey: getRequesterKey,
});

import type {StatusKind} from '../lib/statusLabels';

export interface NavItem {
  label: string;
  /** Route for a working item; omitted for a future feature (shown, but not a link). */
  to?: string;
  kinds: StatusKind[];
  note?: string;
}
export interface NavGroup {
  id: 'advice' | 'expert' | 'learn' | 'tools';
  title: string;
  blurb: string;
  items: NavItem[];
}

/** The four farmer-facing groups shown on Home (H1). Every `to` must be an existing route (checked by tests/h1.test.ts). */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'advice', title: 'Get Advice', blurb: 'Find out what is wrong and what to do first.',
    items: [
      {label: 'Check my crop (cassava, rice, poultry)', to: '/check-my-crop', kinds: ['simulated', 'draft'], note: 'Simple questions, a colour and an advice card. Not a diagnosis.'},
      {label: 'Advice cards with codes', to: '/advice-cards', kinds: ['draft'], note: 'Demonstration advice. Not reviewed by an agronomist.'},
      {label: 'Crop problems (cassava)', to: '/advice/crop-problems', kinds: ['working', 'draft']},
      {label: 'Advice you can read offline', to: '/offline', kinds: ['working']},
      {label: 'Weather and planting', to: '/weather', kinds: ['simulated'], note: 'Sample weather only. Not live.'},
      {label: 'Soil and seeds', to: '/soil', kinds: ['working']},
      {label: 'Planting months by crop', to: '/guidance', kinds: ['draft'], note: 'Demonstration guidance. Works offline. Not reviewed by an agronomist.'},
      {label: 'Harvest handling and storage by crop', to: '/guidance?tab=storage', kinds: ['draft'], note: 'Demonstration guidance. Works offline.'},
      {label: 'Harvest and storage guides', to: '/guides', kinds: ['working']},
      {label: 'Farm emergencies', kinds: ['future']},
    ],
  },
  {
    id: 'expert', title: 'Ask an Expert', blurb: 'Send your question with a photo. Works offline too.',
    items: [
      {label: 'Ask an expert', to: '/experts', kinds: ['working', 'simulated'], note: 'Expert replies in this demo are simulated.'},
      {label: 'My questions', to: '/farmer/questions', kinds: ['working']},
      {label: 'Farmer community', kinds: ['future']},
    ],
  },
  {
    id: 'learn', title: 'Learn Farming', blurb: 'Short guides you can read or listen to.',
    items: [
      {label: 'Farming guides', to: '/guides', kinds: ['working']},
      {label: 'Listen to guidance', to: '/guides?listen=1', kinds: ['working']},
      {label: 'Farming lessons and quizzes', to: '/learn', kinds: ['working', 'draft'], note: 'Five short lessons. Your progress is saved on this phone.'},
    ],
  },
  {
    id: 'tools', title: 'Farm Tools', blurb: 'Simple tools for your farm.',
    items: [
      {label: 'My farm today (home screen)', to: '/today', kinds: ['working', 'simulated'], note: 'Reminders use sample weather, not live. Works offline.'},
      {label: 'Basic phone (USSD) demo', to: '/ussd-demo', kinds: ['simulated'], note: 'Demonstration only. No mobile network connection.'},
      {label: 'Sell my harvest', to: '/harvest/sell', kinds: ['working', 'simulated'], note: 'Save offline, sent when online. No payments.'},
      {label: 'Find harvest (buyers)', to: '/harvest', kinds: ['simulated'], note: 'Demonstration listings. No payments.'},
      {label: 'Farm cost and profit calculator', to: '/tools/calculator', kinds: ['working']},
      {label: 'Sample market information', to: '/marketplace', kinds: ['simulated'], note: 'Demonstration listings, not real prices.'},
      {label: 'Agricultural support directory', kinds: ['future']},
    ],
  },
];

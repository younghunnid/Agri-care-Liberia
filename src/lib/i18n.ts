export type LanguageCode = 'en' | 'bas' | 'man' | 'lre' | 'kpe';

export interface LanguageOption {
  code: LanguageCode;
  shortCode: string;
  name: string;
  status: 'active' | 'preview' | 'coming_soon';
  note: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    code: 'en',
    shortCode: 'EN',
    name: 'English',
    status: 'active',
    note: 'Complete interface, Smart Listen Mode, and sample guides',
  },
  {
    code: 'bas',
    shortCode: 'BAS',
    name: 'Bassa',
    status: 'preview',
    note: 'Prioritized in Local Language AI Lab with audio recordings; unrecorded UI falls back to English',
  },
  {
    code: 'man',
    shortCode: 'MAN',
    name: 'Mano',
    status: 'preview',
    note: 'Prioritized in Local Language AI Lab with audio recordings; unrecorded UI falls back to English',
  },
  {
    code: 'lre',
    shortCode: 'LRE',
    name: 'Liberian English',
    status: 'preview',
    note: 'Reviewed preview strings; unreviewed content falls back to English',
  },
  {
    code: 'kpe',
    shortCode: 'KPE',
    name: 'Kpelle',
    status: 'coming_soon',
    note: 'Future expansion — currently displays English',
  },
];

const EN_STRINGS = {
  brandName: 'Agri-Advisory Liberia',
  navHome: 'Home',
  navAsk: 'Advisor',
  navGuides: 'Knowledge',
  navMarket: 'Market',
  navMore: 'More',
  navPests: 'Pests',
  navExperts: 'Experts',
  navOffline: 'Offline',
  heroTitle: 'Practical farming help, online or offline.',
  heroSubtitle:
    'Ask our agricultural advisor, listen to clear step-by-step advice, explore crops, livestock, and fish farming, or connect with buyers and experts.',
  tapToSpeak: 'Ask Agricultural Advisor',
  typeQuestion: 'Type Your Question',
  exploreGuides: 'Knowledge Center',
  cardCropsTitle: 'Ask Agricultural Advisor',
  cardCropsDesc: 'Ask about crops, poultry, goats, fish ponds, or farm business.',
  cardPestsTitle: 'Listen to Farming Advice',
  cardPestsDesc: 'Turn on Smart Listen Mode to hear farming steps aloud.',
  cardGuidesTitle: 'Agricultural Marketplace',
  cardGuidesDesc: 'List farm harvest in LRD or connect with local buyers.',
  cardOfflineTitle: 'Get Expert Help',
  cardOfflineDesc: 'Send a farm problem with an optional photo. Demo replies are simulated.',
  popularCrops: 'Agricultural Categories',
  todaysTip: "Today's Farming Tip",
  askExpertTitle: 'Basic-Phone Voice Advisory',
  askExpertDesc:
    'Many rural farmers use button phones without internet. Try our interactive keypad call simulation to hear how voice menus work.',
  offlineBannerTitle: 'Save Advice for Offline & Low-Bandwidth Use',
  offlineBannerDesc:
    'Turn on Low-Bandwidth Mode for fast text loading on weak rural networks, or download guides for offline reading.',
  aboutTeam8Title: 'Team 8 Hackathon Prototype — Liberia',
  aboutTeam8Desc:
    'Built for inclusive agricultural advisory across Liberia. Sample data and simulated workflows are clearly labeled for judges.',
  onlineLabel: 'Online',
  offlineLabel: 'Offline',
  signIn: 'Sign In',
  myAccount: 'Dashboard',
};

const LRE_REVIEWED_STRINGS: Partial<typeof EN_STRINGS> = {
  heroTitle: 'Simple, trusted farm help—with network or without network.',
  heroSubtitle:
    'Ask the farm advisor, listen to voice advice step by step, check crop and animal guides, or link up with buyers.',
  tapToSpeak: 'Ask Farm Advisor',
  typeQuestion: 'Type Your Question',
  exploreGuides: 'Open Farm Knowledge',
  popularCrops: 'Farm Topics for Liberia',
  todaysTip: 'Small Farm Tip for Today',
  askExpertTitle: 'Button-Phone Voice Help (Demo)',
  offlineBannerTitle: 'Save Farm Guides for Use Without Network',
};

export function t(lang: LanguageCode, key: keyof typeof EN_STRINGS): {text: string; isFallback: boolean} {
  if (lang === 'lre') {
    const val = LRE_REVIEWED_STRINGS[key];
    if (val) return {text: val, isFallback: false};
    return {text: EN_STRINGS[key], isFallback: true};
  }
  if (lang === 'kpe' || lang === 'bas' || lang === 'man') {
    return {text: EN_STRINGS[key], isFallback: true};
  }
  return {text: EN_STRINGS[key], isFallback: false};
}

export function getLanguageMeta(code: string): LanguageOption {
  return LANGUAGE_OPTIONS.find((l) => l.code === code) || LANGUAGE_OPTIONS[0];
}

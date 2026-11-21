export interface ComingSoonFeature {
  id: string;
  title: string;
  category: 'Weather & Field Tech' | 'Voice & Local Languages' | 'Market & Logistics' | 'Learning & Records';
  farmerValue: string;
  postHackathonPlan: string;
}

export const COMING_SOON_FEATURES: ComingSoonFeature[] = [
  {
    id: 'live-weather',
    title: 'Rainfall alerts by SMS or voice',
    category: 'Weather & Field Tech',
    farmerValue: 'Helps farmers time planting, fertilizer application, and grain drying around county-level rain.',
    postHackathonPlan: 'A live forecast (Open-Meteo) is already shown in the app. Alerts by SMS or voice need an SMS provider and partnerships, and are not built.',
  },
  {
    id: 'crop-disease-photos',
    title: 'Crop disease detection from photos',
    category: 'Weather & Field Tech',
    farmerValue: 'Faster preliminary triage when farmers upload leaf or stem photos in low-extension areas.',
    postHackathonPlan: 'Train and validate Liberia-specific crop models with CARI/Ministry agronomists (today only cautious AI discussion is shown).',
  },
  {
    id: 'veterinary-consultation',
    title: 'Veterinary consultation',
    category: 'Weather & Field Tech',
    farmerValue: 'Connects poultry, goat, pig, and cattle owners quickly with licensed livestock health officers.',
    postHackathonPlan: 'Onboard county veterinary officers with triage queues and emergency alerts.',
  },
  {
    id: 'agri-price-monitoring',
    title: 'Agricultural price monitoring',
    category: 'Market & Logistics',
    farmerValue: 'Reduces unfair price guesswork by sharing verified weekly market ranges across counties.',
    postHackathonPlan: 'Partner with market enumerators in Red Light, Gbarnga, Ganta, Buchanan, and Tubmanburg.',
  },
  {
    id: 'farm-record-management',
    title: 'Farm record management',
    category: 'Learning & Records',
    farmerValue: 'Lets farmers track planting dates, seed costs, harvest bags, and profit across seasons.',
    postHackathonPlan: 'Add voice-assisted expense/harvest logs synced offline.',
  },
  {
    id: 'agri-training-academy',
    title: 'Agricultural training academy',
    category: 'Learning & Records',
    farmerValue: 'Structured step-by-step modules for youth farmers, women’s groups, and cooperatives.',
    postHackathonPlan: 'Co-develop practical field-school modules with Liberian agricultural institutes.',
  },
  {
    id: 'audio-learning-courses',
    title: 'Audio learning courses',
    category: 'Voice & Local Languages',
    farmerValue: 'Allows non-literate farmers to complete whole farming lessons purely by listening.',
    postHackathonPlan: 'Record serialized 3-minute lessons in English, Liberian English, Bassa, Mano, and Kpelle.',
  },
  {
    id: 'cooperative-management',
    title: 'Agricultural cooperative management',
    category: 'Market & Logistics',
    farmerValue: 'Helps farmer groups coordinate pooled harvests, shared equipment, and member shares.',
    postHackathonPlan: 'Add group ledger and bulk buyer inquiry tools.',
  },
  {
    id: 'farm-transport-assistance',
    title: 'Farm transportation assistance',
    category: 'Market & Logistics',
    farmerValue: 'Connects rural harvest hubs with pickup trucks or tricycles on market days.',
    postHackathonPlan: 'Pilot county transport directory and shared load matching.',
  },
  {
    id: 'loan-grant-information',
    title: 'Agricultural loan and grant information',
    category: 'Market & Logistics',
    farmerValue: 'Shares transparent eligibility checklists for verified microfinance and development grants.',
    postHackathonPlan: 'Publish verified NGO and rural bank directory without misleading credit promises.',
  },
  {
    id: 'voice-notifications-local',
    title: 'Voice notifications in local languages',
    category: 'Voice & Local Languages',
    farmerValue: 'Sends seasonal reminders and expert reply alerts in spoken Bassa, Mano, or Kpelle.',
    postHackathonPlan: 'Pair pre-recorded trusted community voice clips with telecom outbound IVR.',
  },
  {
    id: 'real-telecom-advisory',
    title: 'Real telephone advisory services',
    category: 'Voice & Local Languages',
    farmerValue: 'Reaches farmers on simple button phones with zero smartphone or mobile data required.',
    postHackathonPlan: 'Connect our IVR menu logic (previewed in Phone Simulator) to a Liberian toll-free telecom/Africa’s Talking gateway.',
  },
  {
    id: 'offline-audio-library',
    title: 'Offline agricultural audio library',
    category: 'Voice & Local Languages',
    farmerValue: 'Lets farmers download compressed MP3/Opus audio guides while in town to replay on the farm.',
    postHackathonPlan: 'Cache compact audio bundles inside the PWA offline storage.',
  },
  {
    id: 'ai-local-language-recognition',
    title: 'AI recognition of Liberian local languages',
    category: 'Voice & Local Languages',
    farmerValue: 'Would allow farmers to speak naturally in Bassa, Mano, or Kpelle and receive relevant advice.',
    postHackathonPlan: 'Collect consented community datasets in the Local Language AI Lab before training speech models.',
  },
];

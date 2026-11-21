import React, {useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Phone, PhoneOff, RotateCcw, Volume2} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {playKeypadTone, speakText, stopSpeaking} from '../../lib/voice';

type CallScreen =
  | 'idle'
  | 'language_menu'
  | 'topic_menu'
  | 'advice_playing'
  | 'expert_callback';

interface IvrTopic {
  key: string;
  label: string;
  spokenScript: string;
  bassaGloss: string;
  manoGloss: string;
}

const IVR_TOPICS: Record<string, IvrTopic> = {
  '1': {
    key: '1',
    label: 'Rice, Cassava & Maize',
    spokenScript:
      'Rice and Cassava Advice: Space cassava stems one meter apart on clean mounds. Weed early at three weeks and eight weeks. For rice, inspect leaf spots early morning and dry harvested grains on raised clean mats.',
    bassaGloss: 'Bassa greeting cue ("Kpɛɛ jɛɛ") -> Rice & cassava spacing guidance.',
    manoGloss: 'Mano greeting cue ("Yaa kɛɛ") -> Upland & swamp rice care guidance.',
  },
  '2': {
    key: '2',
    label: 'Poultry & Livestock',
    spokenScript:
      'Poultry and Livestock Advice: Keep coops and goat shelters dry above rainy-season mud. Wash drinkers daily with clean water and separate any newly bought birds or goats for fourteen days.',
    bassaGloss: 'Bassa recorded script slot -> Dry coop and clean drinker steps.',
    manoGloss: 'Mano recorded script slot -> Protecting chicks and goats from wet cold.',
  },
  '3': {
    key: '3',
    label: 'Fish Farming Ponds',
    spokenScript:
      'Fish Farming Advice: Check tilapia and catfish ponds at dawn. If fish gasp at the water top, pause feeding right away, dig rainwater runoff ditches around pond banks, and trickle fresh water in.',
    bassaGloss: 'Bassa recorded script slot -> Pond dike protection & dawn oxygen check.',
    manoGloss: 'Mano recorded script slot -> Safe feeding balance for catfish & tilapia.',
  },
  '4': {
    key: '4',
    label: 'Pests, Diseases & Soil',
    spokenScript:
      'Pest and Soil Advice: Check under leaves every week, mulch bare soil with dry grass, and make dark compost from dry leaves and crop peels. Do not mix chemical sprays without expert advice.',
    bassaGloss: 'Bassa recorded script slot -> Weekly scouting & safe farm compost.',
    manoGloss: 'Mano recorded script slot -> Mulching against heavy rainfall washout.',
  },
  '5': {
    key: '5',
    label: 'Harvest Storage & Buyers',
    spokenScript:
      'Storage and Market Advice: Dry peppers, rice, and maize off bare soil, sort spoiled harvest separately, stack sacks on wooden pallets, and list produce on Agricare Marketplace to reach county buyers.',
    bassaGloss: 'Bassa recorded script slot -> Clean grain drying & buyer preparation.',
    manoGloss: 'Mano recorded script slot -> Preventing weevil and damp storage rot.',
  },
};

const LANG_NAMES: Record<string, {name: string; greeting: string}> = {
  '1': {
    name: 'English',
    greeting: 'You selected English.',
  },
  '2': {
    name: 'Bassa (Demo Voice Script)',
    greeting: 'You selected Bassa demo slot. Note: English preview speech will read the Bassa script summary.',
  },
  '3': {
    name: 'Mano (Demo Voice Script)',
    greeting: 'You selected Mano demo slot. Note: English preview speech will read the Mano script summary.',
  },
  '4': {
    name: 'Liberian English',
    greeting: 'You selected Liberian English.',
  },
};

export const PhoneSimulatorPage: React.FC = () => {
  const {speechSupported} = useApp();
  const [searchParams] = useSearchParams();
  const [screen, setScreen] = useState<CallScreen>('idle');
  const [dialBuffer, setDialBuffer] = useState('');
  const [selectedLangKey, setSelectedLangKey] = useState('1');
  const [selectedTopicKey, setSelectedTopicKey] = useState('1');
  const [transcript, setTranscript] = useState(
    'Press the green Call button to start a simulated basic-phone advisory call. This is a simulation: no telephone number, short code or telecom network is used.'
  );
  const [voiceActive, setVoiceActive] = useState(false);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('scenario') === 'rice' && screen === 'idle') {
      setDialBuffer('');
    }
  }, [searchParams, screen]);

  const speakPrompt = (text: string) => {
    setTranscript(text);
    if (speechSupported) {
      setVoiceActive(true);
      speakText(text, {
        rate: 0.94,
        onEnd: () => setVoiceActive(false),
      });
    }
  };

  const startCall = () => {
    playKeypadTone('1');
    setScreen('language_menu');
    speakPrompt(
      'Welcome to the Agricare Voice Service for Liberia. This is a phone-call simulation. Press 1 for English. Press 2 for Bassa. Press 3 for Mano. Press 4 for Liberian English.'
    );
  };

  const endCall = () => {
    stopSpeaking();
    setVoiceActive(false);
    setScreen('idle');
    setTranscript('Call ended. Press the green Call button anytime to restart the basic-phone demonstration.');
  };

  const handleKeyPress = (key: string) => {
    playKeypadTone(key);

    if (screen === 'idle') {
      setDialBuffer((prev) => (prev + key).slice(-12));
      return;
    }

    if (key === '#') {
      setScreen('topic_menu');
      speakPrompt(
        'Main Farming Menu. Press 1 for Rice and Cassava. Press 2 for Poultry and Livestock. Press 3 for Fish Farming. Press 4 for Pests and Soil. Press 5 for Storage and Buyers. Press 9 to request human expert help.'
      );
      return;
    }

    if (screen === 'language_menu') {
      const lang = LANG_NAMES[key];
      if (lang) {
        setSelectedLangKey(key);
        setScreen('topic_menu');
        speakPrompt(
          `${lang.greeting} Choose your farming topic: Press 1 for Rice and Cassava. Press 2 for Poultry and Livestock. Press 3 for Fish Ponds. Press 4 for Pests and Soil. Press 5 for Storage and Buyers.`
        );
      } else {
        speakPrompt('Invalid key. Please press 1 for English, 2 for Bassa, 3 for Mano, or 4 for Liberian English.');
      }
      return;
    }

    if (screen === 'topic_menu') {
      if (key === '9') {
        setScreen('expert_callback');
        speakPrompt(
          'Your simulated callback request has been logged for a county agricultural extension officer. Press pound key to return to menu or End Call.'
        );
        return;
      }
      const topic = IVR_TOPICS[key];
      if (topic) {
        setSelectedTopicKey(key);
        setScreen('advice_playing');
        const langNote =
          selectedLangKey === '2'
            ? `${topic.bassaGloss} `
            : selectedLangKey === '3'
            ? `${topic.manoGloss} `
            : '';
        speakPrompt(`${langNote}${topic.spokenScript} Press star to replay, pound for main menu, or 9 for expert help.`);
      } else {
        speakPrompt('Please press 1, 2, 3, 4, or 5 to hear a farming topic.');
      }
      return;
    }

    if (screen === 'advice_playing' || screen === 'expert_callback') {
      if (key === '*') {
        const topic = IVR_TOPICS[selectedTopicKey];
        if (topic) {
          speakPrompt(`Replaying: ${topic.spokenScript}`);
        }
      } else if (key === '9') {
        setScreen('expert_callback');
        speakPrompt(
          'Simulated expert callback request recorded for Montserrado and Bong agricultural desk. Press pound key for main menu.'
        );
      } else {
        speakPrompt('Press star to replay advice, pound for main menu, or 9 to request an expert callback.');
      }
    }
  };

  const keypadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Prominent Honest Simulation Banner */}
      <div className="rounded-2xl bg-[#F5B942] text-[#183B2B] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="space-y-0.5">
          <p className="text-xs font-extrabold tracking-wide uppercase">
            SIMULATED PHONE CALL — REAL TELECOM INTEGRATION COMING SOON
          </p>
          <p className="text-sm font-medium">
            Interactive browser simulation showing how farmers on non-internet button phones hear Liberian crop, poultry, and fish advice using keypad numbers.
          </p>
        </div>
        <Link
          to="/coming-soon"
          className="min-h-[44px] inline-flex items-center px-3.5 py-2 rounded-xl bg-[#183B2B] text-white text-xs font-bold whitespace-nowrap shrink-0"
        >
          Telecom Roadmap
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* REALISTIC BUTTON PHONE SIMULATOR */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[330px] rounded-[42px] bg-[#183B2B] p-5 shadow-2xl border-4 border-[#0e241a] space-y-4">
            {/* Earpiece & Brand */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-1.5 rounded-full bg-white/25" />
              <p className="text-[11px] font-bold tracking-widest text-[#F5B942]">
                TEAM 8 · BASIC PHONE SIM
              </p>
            </div>

            {/* LCD Screen */}
            <div className="rounded-2xl bg-[#DDEFE0] border-2 border-[#0e241a] p-4 min-h-[210px] flex flex-col justify-between text-[#183B2B] font-mono">
              <div className="flex items-center justify-between text-[11px] border-b border-[#183B2B]/20 pb-1.5">
                <span>{screen === 'idle' ? 'NO DATA · GSM SIM' : 'IN CALL · IVR MENU'}</span>
                <span className="flex items-center gap-1 font-bold text-[#16803C]">
                  {voiceActive ? <Volume2 className="w-3.5 h-3.5" aria-hidden="true" /> : null}
                  {screen === 'idle' ? 'READY' : 'LIVE'}
                </span>
              </div>

              <div className="py-2 space-y-2 text-xs leading-snug">
                {screen === 'idle' && (
                  <>
                    <p className="text-center font-bold text-base tracking-wider pt-2">{dialBuffer || 'SIMULATED CALL'}</p>
                    <p className="text-center text-[11px] text-[#183B2B]/80">
                      Press green Call key to enter Voice Menu
                    </p>
                  </>
                )}
                {screen === 'language_menu' && (
                  <div className="space-y-1">
                    <p className="font-bold">SELECT LANGUAGE:</p>
                    <p>1 · English</p>
                    <p>2 · Bassa (Script Slot)</p>
                    <p>3 · Mano (Script Slot)</p>
                    <p>4 · Liberian English</p>
                  </div>
                )}
                {screen === 'topic_menu' && (
                  <div className="space-y-1">
                    <p className="font-bold">FARMING MENU ({LANG_NAMES[selectedLangKey]?.name}):</p>
                    <p>1 · Rice &amp; Cassava</p>
                    <p>2 · Poultry &amp; Livestock</p>
                    <p>3 · Fish Farming</p>
                    <p>4 · Pests &amp; Soil</p>
                    <p>5 · Storage &amp; Buyers</p>
                    <p>9 · Expert Help Request</p>
                  </div>
                )}
                {screen === 'advice_playing' && (
                  <div className="space-y-1">
                    <p className="font-bold text-[#16803C]">
                      PLAYING: {IVR_TOPICS[selectedTopicKey]?.label}
                    </p>
                    <p className="text-[11px]">[*] Replay · [#] Menu · [9] Expert</p>
                  </div>
                )}
                {screen === 'expert_callback' && (
                  <div className="space-y-1">
                    <p className="font-bold text-[#16803C]">EXPERT HELP LOGGED (DEMO)</p>
                    <p className="text-[11px]">Extension desk notified. [#] Menu</p>
                  </div>
                )}
              </div>

              <div className="border-t border-[#183B2B]/20 pt-1.5 flex items-center justify-between text-[10px] font-bold">
                <span>MENU (#)</span>
                <span>REPLAY (*)</span>
              </div>
            </div>

            {/* Call / End Controls */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={startCall}
                className="min-h-[46px] rounded-2xl bg-[#16803C] text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#1b9649] active:scale-95 transition"
              >
                <Phone className="w-4 h-4" aria-hidden="true" />
                <span>Call / Start</span>
              </button>
              <button
                type="button"
                onClick={endCall}
                className="min-h-[46px] rounded-2xl bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-red-700 active:scale-95 transition"
              >
                <PhoneOff className="w-4 h-4" aria-hidden="true" />
                <span>End Call</span>
              </button>
            </div>

            {/* 12-Key Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {keypadRows.flat().map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleKeyPress(k)}
                  className="min-h-[48px] rounded-2xl bg-white/10 hover:bg-white/20 active:bg-[#F5B942] active:text-[#183B2B] text-white font-display font-bold text-lg transition"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SYNCHRONIZED VOICE TRANSCRIPT & QUICK CONTROLS */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#183B2B]/10 pb-3">
              <div>
                <p className="text-xs font-semibold text-[#16803C]">Live Call Audio Transcript</p>
                <h1 className="font-display text-2xl font-extrabold text-[#183B2B]">
                  Basic-Phone Voice Advisory Journey
                </h1>
              </div>
              {screen !== 'idle' && (
                <button
                  type="button"
                  onClick={() => speakPrompt(transcript)}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#DDEFE0] text-xs font-bold text-[#183B2B]"
                >
                  <RotateCcw className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                  <span>Replay Voice Prompt</span>
                </button>
              )}
            </div>

            <div
              aria-live="polite"
              className="rounded-2xl bg-[#F3F8F0] border border-[#183B2B]/10 p-5 text-base text-[#183B2B] leading-relaxed"
            >
              {transcript}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-[#183B2B]/70">Quick Judge Shortcuts (Same Keypad Actions):</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={startCall}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#16803C] text-white text-xs font-semibold"
                >
                  1. Start Call
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (screen === 'idle') startCall();
                    setTimeout(() => handleKeyPress('2'), 50);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#DDEFE0] text-[#183B2B] text-xs font-semibold"
                >
                  2. Choose Bassa Slot (Key 2)
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('1')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#DDEFE0] text-[#183B2B] text-xs font-semibold"
                >
                  3. Hear Rice &amp; Cassava Advice (Key 1)
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('9')}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F5B942]/40 text-[#183B2B] text-xs font-semibold"
                >
                  4. Request Expert Help (Key 9)
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2">
            <h2 className="font-display text-lg font-bold text-[#183B2B]">
              Why This Matters for Liberia
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              In rural Bong, Lofa, Grand Bassa, and Nimba communities, many smallholder farmers share simple button phones with zero mobile data. Connecting this exact IVR keypad flow to a Liberian toll-free gateway post-hackathon lets non-literate farmers hear verified agricultural guidance in their own voice and language.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

import {BrandLogo} from '../../components/BrandLogo';
import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {UserPlus} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {type ClientUser, useApp} from '../../context/AppContext';
import {LANGUAGE_OPTIONS, type LanguageCode} from '../../lib/i18n';
import {normalizeLiberianPhone} from '../../lib/phone';

const LIBERIA_COUNTIES = [
  'Bomi', 'Bong', 'Gbarpolu', 'Grand Bassa', 'Grand Cape Mount',
  'Grand Gedeh', 'Grand Kru', 'Lofa', 'Margibi', 'Maryland',
  'Montserrado', 'Nimba', 'River Cess', 'River Gee', 'Sinoe',
];

const CROP_CHOICES = ['Cassava', 'Rice', 'Maize', 'Pepper', 'Okra', 'Plantain'];

export const RegisterPage: React.FC = () => {
  const {setUser, setLanguage} = useApp();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [county, setCounty] = useState('Montserrado');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('en');
  const [cropsOfInterest, setCropsOfInterest] = useState<string[]>(['Cassava']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleCrop = (crop: string) => {
    setCropsOfInterest((prev) =>
      prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const phoneCheck = normalizeLiberianPhone(phone);
    if (!phoneCheck.valid) {
      setError(
        phoneCheck.error ||
          'Enter a valid Liberian phone number (e.g., 077 012 3456 or +231 77 012 3456).'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{user: ClientUser}>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phoneCheck.normalized,
          email: email.trim() || undefined,
          password,
          county,
          preferredLanguage,
          cropsOfInterest,
        }),
      });
      setUser(res.user);
      await setLanguage(preferredLanguage);
      navigate('/account/security'); // the new number is not verified yet: ask the farmer to confirm it
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="space-y-1.5">
          <BrandLogo className="mx-auto mb-2 h-20" />
          <p className="text-xs font-semibold text-[#16803C]">Optional Free Account</p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B]">
            Farmer Registration
          </h1>
          <p className="text-sm text-[#183B2B]/80">
            Create an account to save farming advice, track your questions, and consult agricultural experts across Liberia.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-sm font-semibold mb-1.5">
              Name or Preferred Display Name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              minLength={2}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Flomo Mulbah"
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-phone" className="block text-sm font-semibold mb-1.5">
                Phone Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0770123456 or +231770123456"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
              />
              <p className="text-xs text-[#183B2B]/65 mt-1">Liberian format: 077 012 3456 or +231 77 012 3456</p>
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-sm font-semibold mb-1.5">
                Email (Optional)
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-county" className="block text-sm font-semibold mb-1.5">
                County (15 Liberian Counties)
              </label>
              <select
                id="reg-county"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {LIBERIA_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reg-lang" className="block text-sm font-semibold mb-1.5">
                Preferred Language
              </label>
              <select
                id="reg-lang"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as LanguageCode)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.shortCode} · {l.name}
                    {l.status === 'coming_soon' ? ' (Coming Soon)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="block text-sm font-semibold mb-2">Crops of Interest (Optional)</span>
            <div className="flex flex-wrap gap-2">
              {CROP_CHOICES.map((crop) => {
                const selected = cropsOfInterest.includes(crop);
                return (
                  <button
                    key={crop}
                    type="button"
                    onClick={() => toggleCrop(crop)}
                    aria-pressed={selected}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      selected
                        ? 'bg-[#16803C] text-white border-[#16803C]'
                        : 'bg-[#F3F8F0] text-[#183B2B] border-[#183B2B]/15 hover:bg-[#DDEFE0]'
                    }`}
                  >
                    {crop}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-semibold mb-1.5">
              Password (minimum 10 characters)
            </label>
            <input
              id="reg-password"
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#16803C] text-white font-semibold text-sm hover:bg-[#116630] disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>{loading ? 'Creating Account...' : 'Create Farmer Account'}</span>
          </button>

          <p className="text-center text-xs text-[#183B2B]/75 pt-2">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-[#16803C] hover:underline">
              Sign in here
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

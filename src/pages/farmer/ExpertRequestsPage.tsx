import React, {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Send} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {FARMER_NAV} from './FarmerDashboardPage';

const COUNTIES = [
  'Bomi', 'Bong', 'Gbarpolu', 'Grand Bassa', 'Grand Cape Mount',
  'Grand Gedeh', 'Grand Kru', 'Lofa', 'Margibi', 'Maryland',
  'Montserrado', 'Nimba', 'River Cess', 'River Gee', 'Sinoe',
];

export const ExpertRequestsPage: React.FC = () => {
  const {user} = useApp();
  const navigate = useNavigate();
  const [crops, setCrops] = useState<Array<{id: number; name: string}>>([]);
  const [cropId, setCropId] = useState('');
  const [topic, setTopic] = useState('Disease Awareness');
  const [county, setCounty] = useState(user?.county || 'Montserrado');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{crops: Array<{id: number; name: string}>}>('/crops')
      .then((res) => setCrops(res.crops))
      .catch(() => undefined);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/farmer/questions', {
        method: 'POST',
        body: JSON.stringify({
          cropId: cropId ? Number(cropId) : undefined,
          topic,
          county,
          title,
          description,
        }),
      });
      navigate('/farmer/questions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WorkspaceShell
      kicker="Farmer Workspace"
      title="New Expert Request"
      subtitle="Send a crop question to an agricultural specialist account (demonstration platform: answers are not verified advice)."
      navItems={FARMER_NAV}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-4 max-w-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="req-crop" className="block text-sm font-semibold mb-1.5">Crop</label>
            <select id="req-crop" value={cropId} onChange={(e) => setCropId(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm">
              <option value="">General</option>
              {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="req-topic" className="block text-sm font-semibold mb-1.5">Topic</label>
            <select id="req-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm">
              {['Planting', 'Soil Preparation', 'Watering', 'Crop Care', 'Pest Prevention', 'Disease Awareness', 'Harvesting', 'Storage', 'Climate Resilience'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="req-county" className="block text-sm font-semibold mb-1.5">County</label>
            <select id="req-county" value={county} onChange={(e) => setCounty(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm">
              {COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="req-title" className="block text-sm font-semibold mb-1.5">Summary Title</label>
          <input id="req-title" type="text" required minLength={5} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm" />
        </div>

        <div>
          <label htmlFor="req-desc" className="block text-sm font-semibold mb-1.5">Problem Description</label>
          <textarea id="req-desc" rows={5} required minLength={15} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-2xl border border-[#183B2B]/20 p-3.5 text-sm" />
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-2xl bg-[#16803C] text-white text-sm font-semibold">
          <Send className="w-4 h-4" aria-hidden="true" />
          <span>{submitting ? 'Submitting...' : 'Submit Consultation Request'}</span>
        </button>
      </form>
    </WorkspaceShell>
  );
};

import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {Send} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {FARMER_NAV} from './FarmerDashboardPage';

interface FarmerQuestion {
  id: number;
  topic: string;
  county: string;
  title: string;
  status: string;
  crop_name: string | null;
  expert_name: string | null;
  updated_at: string;
}

interface ThreadMessage {
  id: number;
  sender_role: string;
  sender_name: string;
  message_text: string;
  is_official_expert_advice: number;
  created_at: string;
}

export const MyQuestionsPage: React.FC = () => {
  const [questions, setQuestions] = useState<FarmerQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadQuestions = () => {
    setLoading(true);
    apiFetch<{questions: FarmerQuestion[]}>('/farmer/questions')
      .then((res) => {
        setQuestions(res.questions);
        if (res.questions.length > 0 && !selectedId) {
          setSelectedId(res.questions[0].id);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    apiFetch<{messages: ThreadMessage[]}>(`/farmer/questions/${selectedId}`)
      .then((res) => setMessages(res.messages))
      .catch(() => undefined);
  }, [selectedId]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || reply.trim().length < 3) return;
    setSending(true);
    try {
      await apiFetch(`/farmer/questions/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({messageText: reply}),
      });
      setReply('');
      const res = await apiFetch<{messages: ThreadMessage[]}>(`/farmer/questions/${selectedId}`);
      setMessages(res.messages);
    } finally {
      setSending(false);
    }
  };

  const activeQ = questions.find((q) => q.id === selectedId);

  return (
    <WorkspaceShell
      kicker="Farmer Workspace"
      title="My Questions"
      subtitle="Track status updates and read official agricultural expert responses."
      navItems={FARMER_NAV}
    >
      {loading ? (
        <p className="text-sm text-[#183B2B]/70">Loading your questions...</p>
      ) : questions.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-8 text-center space-y-3">
          <p className="text-sm text-[#183B2B]/75">You haven’t submitted any expert questions yet.</p>
          <Link to="/farmer/expert-requests" className="inline-flex items-center min-h-[44px] px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-semibold">
            Ask an Expert
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            {questions.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedId(q.id)}
                className={`w-full text-left rounded-2xl p-4 border transition-colors ${
                  selectedId === q.id
                    ? 'bg-[#DDEFE0] border-[#16803C]'
                    : 'bg-white border-[#183B2B]/10 hover:border-[#16803C]/50'
                }`}
              >
                <p className="text-xs text-[#183B2B]/70">
                  {q.status} · {q.crop_name || 'General'} · {q.county}
                </p>
                <p className="font-display font-bold text-sm text-[#183B2B] mt-1">{q.title}</p>
                <p className="text-xs text-[#183B2B]/65 mt-1">
                  {q.expert_name ? `Expert: ${q.expert_name}` : 'Awaiting expert assignment'}
                </p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-7">
            {activeQ && (
              <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-5">
                <div className="border-b border-[#183B2B]/10 pb-3">
                  <p className="text-xs font-semibold text-[#16803C]">
                    Status: {activeQ.status} · {activeQ.topic}
                  </p>
                  <h2 className="font-display text-xl font-bold text-[#183B2B] mt-1">{activeQ.title}</h2>
                </div>

                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-2xl p-4 text-sm space-y-1 ${
                        m.sender_role === 'expert' ? 'bg-[#DDEFE0]' : 'bg-[#F3F8F0]'
                      }`}
                    >
                      <p className="text-xs font-semibold text-[#183B2B]/75">
                        {m.sender_name}
                        {m.is_official_expert_advice ? ' · Expert answer (demonstration platform: not verified agricultural advice)' : ''} · {m.created_at}
                      </p>
                      <p className="text-[#183B2B] leading-relaxed whitespace-pre-wrap">{m.message_text}</p>
                    </div>
                  ))}
                </div>

                {activeQ.status !== 'Closed' && (
                  <form onSubmit={(e) => void handleSendReply(e)} className="flex gap-2 pt-2">
                    <label htmlFor="farmer-reply" className="sr-only">
                      Add follow-up note
                    </label>
                    <input
                      id="farmer-reply"
                      type="text"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Reply or provide requested clarification..."
                      className="flex-1 min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={sending || reply.trim().length < 3}
                      className="min-h-[44px] px-4 rounded-xl bg-[#16803C] text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" aria-hidden="true" />
                      <span>Send</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
};

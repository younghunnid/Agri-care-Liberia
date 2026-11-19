import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2, Clock, MessageSquare} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {WorkspaceShell} from '../../components/WorkspaceShell';

export const EXPERT_NAV = [
  {to: '/expert', label: 'Expert Overview', end: true},
  {to: '/expert/questions', label: 'Assigned Questions'},
  {to: '/expert/profile', label: 'Expert Profile'},
];

interface ExpertQuestion {
  id: number;
  status: string;
  title: string;
  county: string;
  crop_name: string | null;
}

export const ExpertDashboardPage: React.FC = () => {
  const {user} = useApp();
  const [questions, setQuestions] = useState<ExpertQuestion[]>([]);

  useEffect(() => {
    apiFetch<{questions: ExpertQuestion[]}>('/expert/questions')
      .then((res) => setQuestions(res.questions))
      .catch(() => undefined);
  }, []);

  const pending = questions.filter((q) => q.status !== 'Answered' && q.status !== 'Closed').length;
  const answered = questions.filter((q) => q.status === 'Answered' || q.status === 'Closed').length;

  return (
    <WorkspaceShell
      kicker={`Expert account · ${user?.expertSpecialty || 'Agronomy'}`}
      title={`Expert Workspace — ${user?.displayName}`}
      subtitle="Review assigned farmer questions and issue clear, low-risk agricultural guidance."
      navItems={EXPERT_NAV}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2">
            <Clock className="w-6 h-6 text-[#F5B942]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{pending}</p>
            <p className="text-sm font-semibold">Awaiting Expert Response</p>
          </div>
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2">
            <CheckCircle2 className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{answered}</p>
            <p className="text-sm font-semibold">Answered Consultations</p>
          </div>
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-2">
            <MessageSquare className="w-6 h-6 text-[#16803C]" aria-hidden="true" />
            <p className="font-display text-2xl font-extrabold tabular-nums">{questions.length}</p>
            <p className="text-sm font-semibold">Total Assigned Cases</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recent Assigned Questions</h2>
            <Link to="/expert/questions" className="text-sm font-semibold text-[#16803C] hover:underline">
              Open Full Queue
            </Link>
          </div>
          {questions.length === 0 ? (
            <p className="text-sm text-[#183B2B]/75">No farmer questions are currently assigned to you.</p>
          ) : (
            <div className="divide-y divide-[#183B2B]/10">
              {questions.slice(0, 5).map((q) => (
                <div key={q.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#183B2B]/65">
                      {q.status} · {q.crop_name || 'General'} · {q.county} County
                    </p>
                    <p className="font-semibold text-sm text-[#183B2B]">{q.title}</p>
                  </div>
                  <Link
                    to={`/expert/questions/${q.id}`}
                    className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-[#DDEFE0] text-xs font-semibold text-[#183B2B] hover:bg-[#16803C] hover:text-white transition-colors shrink-0"
                  >
                    Review &amp; Answer
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
};

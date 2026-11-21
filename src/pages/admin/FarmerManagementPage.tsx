import React, {useEffect, useState} from 'react';
import {apiFetch} from '../../lib/api';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {ADMIN_NAV} from './AdminOverviewPage';
import {RECOVERY_METHODS} from '../../lib/privacy';

interface AdminUserRow {
  id: number;
  display_name: string;
  phone: string;
  email: string | null;
  status: string;
  phone_verified?: number;
  county: string | null;
  preferred_language: string | null;
  roles: string | null;
}

export const FarmerManagementPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  // Assisted password recovery: the administrator has ALREADY established who the person is outside this website.
  const [rec, setRec] = useState<AdminUserRow | null>(null);
  const [method, setMethod] = useState<string>(RECOVERY_METHODS[0].value);
  const [note, setNote] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{code: string; expiresInMinutes: number; user: {displayName: string; phone: string}} | null>(null);
  const closeRec = () => { setRec(null); setIssued(null); setNote(''); setAdminPw(''); setConfirmed(false); setRecError(null); setMethod(RECOVERY_METHODS[0].value); };
  const issue = async () => {
    if (!rec) return; setRecBusy(true); setRecError(null);
    try { setIssued(await apiFetch(`/admin/users/${rec.id}/recovery`, {method: 'POST', body: JSON.stringify({method, note, adminPassword: adminPw, identityConfirmed: confirmed})})); setAdminPw(''); }
    catch (e) { setRecError(e instanceof Error ? e.message : 'Could not create a recovery code.'); } finally { setRecBusy(false); }
  };

  const load = () => {
    apiFetch<{users: AdminUserRow[]}>('/admin/users')
      .then((res) => setUsers(res.users))
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (u: AdminUserRow) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    await apiFetch(`/admin/users/${u.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({status: next}),
    });
    load();
  };

  return (
    <WorkspaceShell
      kicker="Administrator Console"
      title="Farmer & User Management"
      navItems={ADMIN_NAV}
    >
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#183B2B]/10 text-xs text-[#183B2B]/65">
            <tr>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Phone status</th>
              <th className="py-2 pr-4">County</th>
              <th className="py-2 pr-4">Roles</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#183B2B]/10">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-3 pr-4 font-semibold">{u.display_name}</td>
                <td className="py-3 pr-4 font-mono text-xs tabular-nums">{u.phone}</td>
                <td className="py-3 pr-4 text-xs font-semibold" data-testid={`phone-status-${u.id}`}>{u.phone_verified ? <span className="text-[#0F5C2A]">Verified</span> : <span className="text-amber-900">Not verified</span>}</td>
                <td className="py-3 pr-4">{u.county || '—'}</td>
                <td className="py-3 pr-4 text-xs">{u.roles}</td>
                <td className="py-3 pr-4 font-semibold text-xs">{u.status}</td>
                <td className="py-3 space-x-2 whitespace-nowrap">
                  {!(u.roles ?? '').split(',').includes('admin') && u.status === 'active' && (
                    <button type="button" onClick={() => setRec(u)} data-testid={`recover-${u.id}`} className="min-h-[44px] px-3 py-1.5 rounded-xl border border-[#183B2B]/20 text-xs font-semibold hover:bg-[#F3F8F0]">Password recovery</button>
                  )}
                  <button
                    type="button"
                    onClick={() => void toggleStatus(u)}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl border border-[#183B2B]/20 text-xs font-semibold hover:bg-[#F3F8F0]"
                  >
                    {u.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rec && (
        <div role="dialog" aria-modal="true" aria-labelledby="rec-title" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3" data-testid="recovery-dialog">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-5 space-y-3">
            <h2 id="rec-title" className="text-xl font-extrabold text-[#183B2B]">Password recovery for {rec.display_name}</h2>
            {issued ? (
              <div className="space-y-3">
                <p className="text-sm text-[#183B2B]">One-time code for <strong>{issued.user.displayName}</strong> ({issued.user.phone}). It is shown only now, works once and expires in {issued.expiresInMinutes} minutes. Give it to the person yourself, in person or on the call you used to check who they are. Do not send it by message.</p>
                <p className="text-center font-mono text-3xl font-extrabold tracking-widest text-[#183B2B] select-all" data-testid="recovery-code">{issued.code}</p>
                <p className="text-sm text-[#183B2B]/80">They open <strong>Use a recovery code</strong> on the sign-in help page, enter their phone number, this code and a new password.</p>
                <button type="button" onClick={closeRec} className="w-full min-h-[48px] rounded-2xl bg-[#16803C] text-white font-extrabold" data-testid="recovery-close">I have given the code. Hide it.</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#183B2B]">A phone number alone is <strong>not</strong> proof of who someone is. Only continue after you have checked this person another way. You cannot see or read their old password; they will choose a new one.</p>
                <label className="block text-sm font-bold" htmlFor="rec-method">How did you check who they are?</label>
                <select id="rec-method" value={method} onChange={(e) => setMethod(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/25 px-2 text-sm">{RECOVERY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
                <label className="block text-sm font-bold" htmlFor="rec-note">What did you check? (kept in the audit log; no passwords or codes)</label>
                <textarea id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} className="w-full rounded-xl border border-[#183B2B]/25 p-2 text-sm" data-testid="recovery-note" />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="w-5 h-5 mt-0.5 accent-[#16803C]" data-testid="recovery-confirm" /> I confirm I checked this person's identity independently, not only by their phone number.</label>
                <label className="block text-sm font-bold" htmlFor="rec-adminpw">Your own password</label>
                <input id="rec-adminpw" type="password" autoComplete="current-password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/25 px-2 text-sm" data-testid="recovery-adminpw" />
                {recError && <p role="alert" className="text-sm font-bold text-[#7A1010]" data-testid="recovery-error">{recError}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={closeRec} className="flex-1 min-h-[48px] rounded-2xl border border-[#183B2B]/25 font-bold">Cancel</button>
                  <button type="button" onClick={() => void issue()} disabled={recBusy || !confirmed || note.trim().length < 10 || !adminPw} className="flex-1 min-h-[48px] rounded-2xl bg-[#16803C] text-white font-extrabold disabled:opacity-50" data-testid="recovery-issue">Create one-time code</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
};

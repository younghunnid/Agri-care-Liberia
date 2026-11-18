import React, {useEffect, useState} from 'react';
import {apiFetch} from '../../lib/api';
import {WorkspaceShell} from '../../components/WorkspaceShell';
import {ADMIN_NAV} from './AdminOverviewPage';

interface AdminUserRow {
  id: number;
  display_name: string;
  phone: string;
  email: string | null;
  status: string;
  county: string | null;
  preferred_language: string | null;
  roles: string | null;
}

export const FarmerManagementPage: React.FC = () => {
  const [users, setUsers] = useState<AdminUserRow[]>([]);

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
                <td className="py-3 pr-4">{u.county || '—'}</td>
                <td className="py-3 pr-4 text-xs">{u.roles}</td>
                <td className="py-3 pr-4 font-semibold text-xs">{u.status}</td>
                <td className="py-3">
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
    </WorkspaceShell>
  );
};

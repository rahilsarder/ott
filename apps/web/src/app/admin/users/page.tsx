'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@ott/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, inputClass } from '@/components/admin/ui';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  _count: { profiles: number };
}

export default function UsersAdmin() {
  const client = useQueryClient();
  const { user: currentUser } = useSession();

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<AdminUser[]>('/admin/users'),
  });

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api(`/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-[-0.015em]">Users</h1>

      {isLoading && <p className="text-sm text-ash">Loading…</p>}

      {users && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="label-mono border-b border-hairline text-left text-ash-dim">
              <tr>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal">Profiles</th>
                <th className="px-4 py-3 font-normal">Joined</th>
                <th className="px-4 py-3 font-normal">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <tr key={user.id} className="transition hover:bg-bone/5">
                    <td className="px-4 py-3 font-medium">
                      {user.name}
                      {isSelf && <span className="ml-2 text-xs text-ash-dim">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-ash">{user.email}</td>
                    <td className="px-4 py-3 text-ash">{user._count.profiles}</td>
                    <td className="px-4 py-3 text-ash">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <select
                        className={inputClass}
                        value={user.role}
                        /* Blocking self-demotion keeps the instance from ending up with no admin. */
                        disabled={isSelf || setRole.isPending}
                        onChange={(e) => setRole.mutate({ id: user.id, role: e.target.value as UserRole })}
                      >
                        <option value="USER">User</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

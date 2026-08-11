'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { upsertChannelSchema, type BulkPublishResult, type UpsertChannelInput } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { Banner, Button, Card, Field, ImageUpload, inputClass } from '@/components/admin/ui';
import { StreamTester } from '@/components/admin/StreamTester';
import { cn } from '@/lib/format';
import { PencilIcon, TrashIcon } from '@/components/icons';

interface AdminChannel extends UpsertChannelInput {
  id: string;
}

const BLANK: UpsertChannelInput = {
  slug: '',
  name: '',
  description: '',
  category: 'General',
  logoUrl: null,
  streamPath: '',
  hasDvr: false,
  sortOrder: 0,
  isPublished: false,
};

export default function ChannelsAdmin() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<AdminChannel | null>(null);
  const [draft, setDraft] = useState<UpsertChannelInput>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: channels, isLoading } = useQuery({
    queryKey: ['admin', 'channels'],
    queryFn: () => api<AdminChannel[]>('/admin/channels'),
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ['admin', 'channels'] });

  const save = useMutation({
    mutationFn: async () => {
      const parsed = upsertChannelSchema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      return editing
        ? api<AdminChannel>(`/admin/channels/${editing.id}`, { method: 'PUT', body: parsed.data })
        : api<AdminChannel>('/admin/channels', { method: 'POST', body: parsed.data });
    },
    onSuccess: () => {
      closeForm();
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/admin/channels/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const bulkPublish = useMutation({
    mutationFn: (isPublished: boolean) =>
      api<BulkPublishResult>('/admin/channels/bulk-publish', {
        method: 'PATCH',
        body: { ids: [...selected], isPublished },
      }),
    onSuccess: () => {
      setSelected(new Set());
      invalidate();
    },
  });

  const openNew = () => {
    setEditing(null);
    setDraft(BLANK);
    setError(null);
    setOpen(true);
  };

  const openEdit = (channel: AdminChannel) => {
    setEditing(channel);
    setDraft({ ...channel });
    setError(null);
    setOpen(true);
  };

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    setDraft(BLANK);
    setError(null);
  };

  const set = <K extends keyof UpsertChannelInput>(key: K, value: UpsertChannelInput[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = Boolean(channels?.length) && selected.size === channels?.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">Channels</h1>
        <Button className="ml-auto" onClick={openNew}>
          New channel
        </Button>
      </div>

      {open && (
        <Card className="space-y-4">
          <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : 'New channel'}</h2>
          {error && <Banner tone="error">{error}</Banner>}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <input
                className={inputClass}
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value;
                  set('name', name);
                  // Derive the slug while creating; never rewrite an existing one,
                  // since it may already be linked to from elsewhere.
                  if (!editing) set('slug', slugify(name));
                }}
              />
            </Field>

            <Field label="Slug" hint="Used in URLs. Lowercase letters, digits and hyphens.">
              <input className={inputClass} value={draft.slug} onChange={(e) => set('slug', e.target.value)} />
            </Field>

            <Field
              label="Flussonic stream name"
              hint="Just the stream name as configured on Flussonic — e.g. news24. Not a full URL."
            >
              <input
                className={inputClass}
                value={draft.streamPath}
                onChange={(e) => set('streamPath', e.target.value)}
                placeholder="news24"
              />
            </Field>

            <Field label="Category">
              <input className={inputClass} value={draft.category} onChange={(e) => set('category', e.target.value)} />
            </Field>

            <Field label="Sort order" hint="Lower numbers appear first.">
              <input
                type="number"
                className={inputClass}
                value={draft.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value))}
              />
            </Field>

            <div className="space-y-3 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.hasDvr} onChange={(e) => set('hasDvr', e.target.checked)} />
                DVR enabled on this stream
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isPublished}
                  onChange={(e) => set('isPublished', e.target.checked)}
                />
                Published (visible to viewers)
              </label>
            </div>

            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  className={cn(inputClass, 'min-h-20 resize-y')}
                  value={draft.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <ImageUpload kind="logo" label="Logo" value={draft.logoUrl} onChange={(url) => set('logoUrl', url)} />
            </div>
          </div>

          {draft.streamPath && <StreamTester streamPath={draft.streamPath} isLive />}

          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save channel'}
            </Button>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {isLoading && <p className="text-sm text-ash">Loading…</p>}

      {!isLoading && !channels?.length && (
        <Card>
          <p className="text-ash">No channels yet. Create one to start streaming live TV.</p>
        </Card>
      )}

      {selected.size > 0 && (
        <div className="chamfer-sm flex items-center gap-3 border border-brass/40 bg-brass/10 px-4 py-2.5 text-sm">
          <span className="label-mono text-brass-hot">{selected.size} selected</span>
          <Button variant="ghost" onClick={() => bulkPublish.mutate(true)} disabled={bulkPublish.isPending}>
            Publish
          </Button>
          <Button variant="ghost" onClick={() => bulkPublish.mutate(false)} disabled={bulkPublish.isPending}>
            Unpublish
          </Button>
          <button
            onClick={() => setSelected(new Set())}
            className="focus-brass ml-auto text-ash-dim transition hover:text-bone"
          >
            Clear
          </button>
        </div>
      )}

      {channels && channels.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="label-mono border-b border-hairline text-left text-ash-dim">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(channels.map((c) => c.id)))}
                    aria-label="Select all channels"
                  />
                </th>
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Stream</th>
                <th className="px-4 py-3 font-normal">Category</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {channels.map((channel) => (
                <tr key={channel.id} className="transition hover:bg-bone/5">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(channel.id)}
                      onChange={() => toggleSelected(channel.id)}
                      aria-label={`Select ${channel.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{channel.name}</td>
                  <td className="px-4 py-3">
                    <code className="bg-bone/10 px-1.5 py-0.5 text-xs">{channel.streamPath}</code>
                  </td>
                  <td className="px-4 py-3 text-ash">{channel.category}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'label-mono px-2 py-0.5',
                        channel.isPublished ? 'bg-signal-ok/15 text-signal-ok' : 'bg-bone/10 text-ash-dim',
                      )}
                    >
                      {channel.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(channel)}
                        aria-label={`Edit ${channel.name}`}
                        className="focus-brass rounded p-1.5 text-ash transition hover:bg-bone/10 hover:text-bone"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${channel.name}? This cannot be undone.`)) remove.mutate(channel.id);
                        }}
                        aria-label={`Delete ${channel.name}`}
                        className="focus-brass rounded p-1.5 text-ash transition hover:bg-signal-bad/15 hover:text-signal-bad"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

'use client';

import { useState } from 'react';
import { uploadFile } from '@/lib/api';
import { cn } from '@/lib/format';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-bone">{label}</span>
      {children}
      {hint && <span className="text-xs text-ash-dim">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'chamfer-sm focus-brass w-full border border-hairline bg-night-2 px-3 py-2 text-sm text-bone outline-none placeholder:text-ash-dim';

const BUTTON_VARIANTS = {
  primary: 'bg-brass text-[#17110a] hover:bg-brass-hot',
  ghost: 'bg-bone/10 text-bone hover:bg-bone/20',
  danger: 'bg-signal-bad/20 text-signal-bad hover:bg-signal-bad/30',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      className={cn(
        'chamfer-sm focus-brass inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('border border-hairline bg-night-2 p-5', className)}>{children}</div>;
}

export function Banner({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const tones = {
    error: 'border-signal-bad/40 bg-signal-bad/10 text-signal-bad',
    success: 'border-signal-ok/40 bg-signal-ok/10 text-signal-ok',
  } as const;
  return (
    <p role="alert" className={cn('border px-3 py-2 text-sm', tones[tone])}>
      {children}
    </p>
  );
}

/**
 * Uploads through the admin API rather than letting admins paste arbitrary URLs
 * only — the API re-encodes images, which normalises size and strips anything
 * hidden inside a file that merely claims to be a picture.
 */
export function ImageUpload({
  kind,
  value,
  onChange,
  label,
}: {
  kind: 'poster' | 'backdrop' | 'still' | 'logo';
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadFile<{ url: string }>(`/admin/uploads/${kind}`, file);
      onChange(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={label}>
      <div className="flex items-start gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="chamfer-sm h-24 w-16 border border-hairline object-cover" />
        ) : (
          <div className="chamfer-sm grid h-24 w-16 place-items-center border border-hairline bg-night-3 text-xs text-ash-dim">
            None
          </div>
        )}

        <div className="flex-1 space-y-2">
          <input
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://… or upload a file"
            className={inputClass}
          />
          <div className="flex items-center gap-2">
            <label className="chamfer-sm label-mono focus-brass cursor-pointer bg-bone/10 px-3 py-1.5 text-bone transition hover:bg-bone/20">
              {busy ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = '';
                }}
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="label-mono text-ash-dim transition hover:text-bone"
              >
                Clear
              </button>
            )}
          </div>
          {error && <p className="text-xs text-signal-bad">{error}</p>}
        </div>
      </div>
    </Field>
  );
}

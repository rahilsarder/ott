'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import { ApiError } from '@/lib/api';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center bg-ink" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, signUp } = useSession();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await signUp(name, email, password);
      // Always land on the profile gate; the browse pages need a scoped token.
      router.replace(`/profiles?next=${encodeURIComponent(params.get('next') ?? '/')}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center bg-ink px-4">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(229,9,20,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(59,130,246,0.25), transparent 45%)',
        }}
      />

      <div className="relative w-full max-w-md animate-rise rounded-xl bg-black/75 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <h1 className="mb-1 text-3xl font-black uppercase tracking-tighter text-accent">
          {process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Streamly'}
        </h1>
        <p className="mb-6 text-sm text-white/60">
          {mode === 'signin' ? 'Sign in to keep watching.' : 'Create an account to start watching.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <Field label="Name" value={name} onChange={setName} autoComplete="name" required minLength={1} />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={8}
          />

          {error && (
            <p role="alert" className="rounded bg-accent/15 px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-accent py-3 font-semibold transition hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <GoogleSignInButton
          onSuccess={() => router.replace(`/profiles?next=${encodeURIComponent(params.get('next') ?? '/')}`)}
          onError={setError}
        />

        <p className="mt-4 text-center text-sm text-white/60">
          <Link href="/login/qr" className="font-medium text-white hover:underline">
            Sign in with QR code instead
          </Link>
        </p>

        <p className="mt-6 text-sm text-white/60">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
            }}
            className="font-medium text-white hover:underline"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        placeholder={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded bg-white/10 px-4 py-3 text-sm outline-none ring-1 ring-white/10 transition placeholder:text-white/40 focus:ring-2 focus:ring-white/50"
      />
    </label>
  );
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DeviceVerifyResponse } from '@ott/shared';
import { api, ApiError } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { Banner, Button, Field, inputClass, Panel } from '@/projection/ui';

export default function LinkPage() {
  return (
    <AuthGate requireProfile={false}>
      <Suspense fallback={null}>
        <LinkDevice />
      </Suspense>
    </AuthGate>
  );
}

type Stage = 'entry' | 'checking' | 'confirm' | 'invalid' | 'approved' | 'denied';

function LinkDevice() {
  const params = useSearchParams();
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase().slice(0, 8));
  const [stage, setStage] = useState<Stage>('entry');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (candidate: string) => {
    setStage('checking');
    setError(null);
    try {
      const res = await api<DeviceVerifyResponse>(`/devices/verify?code=${encodeURIComponent(candidate)}`);
      setStage(res.valid ? 'confirm' : 'invalid');
    } catch {
      setStage('invalid');
    }
  };

  useEffect(() => {
    if (code.length === 8) void verify(code);
    // Only ever auto-verifies the code that arrived via ?code= on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const respond = async (action: 'approve' | 'deny') => {
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/devices/${action}`, { method: 'POST', body: { userCode: code } });
      setStage(action === 'approve' ? 'approved' : 'denied');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-night px-4">
      <Panel className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold text-bone">Link a device</h1>

        {stage === 'entry' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 8) void verify(code);
            }}
            className="space-y-3"
          >
            <Field label="Code shown on your device" hint="8 characters, from the TV or sign-in screen">
              <input
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
                autoFocus
                autoComplete="off"
                placeholder="ABCD2345"
              />
            </Field>
            <Button type="submit" disabled={code.length !== 8} className="w-full">
              Continue
            </Button>
          </form>
        )}

        {stage === 'checking' && <p className="text-sm text-ash">Checking code…</p>}

        {stage === 'invalid' && (
          <>
            <Banner tone="bad">That code is invalid or has expired.</Banner>
            <Button variant="ghost" className="w-full" onClick={() => setStage('entry')}>
              Try another code
            </Button>
          </>
        )}

        {stage === 'confirm' && (
          <>
            <p className="text-sm text-ash">Approve this sign-in? Anyone with this code will be signed in as you.</p>
            {error && <Banner tone="bad">{error}</Banner>}
            <div className="flex gap-3">
              <Button className="flex-1" disabled={busy} onClick={() => void respond('approve')}>
                Approve
              </Button>
              <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => void respond('deny')}>
                Deny
              </Button>
            </div>
          </>
        )}

        {stage === 'approved' && <Banner tone="ok">Signed in. You can close this page.</Banner>}
        {stage === 'denied' && <Banner tone="warn">Sign-in request denied.</Banner>}
      </Panel>
    </main>
  );
}

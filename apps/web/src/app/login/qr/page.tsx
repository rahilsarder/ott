'use client';

import Link from 'next/link';
import QRCode from 'qrcode';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DevicePollResponse, DeviceStartResponse } from '@ott/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Banner, Button, Panel } from '@/projection/ui';

export default function LoginQrPage() {
  return (
    <Suspense fallback={null}>
      <QrSignIn />
    </Suspense>
  );
}

type Status = 'loading' | 'waiting' | 'denied' | 'expired' | 'error';

function QrSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const { applySession } = useSession();

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const deviceCodeRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A generation counter, not a boolean — React 18 dev StrictMode invokes this
  // effect twice in a row, so two overlapping `start()` calls can be in flight
  // at once. A plain "cancelled" flag can't tell which one is stale (whichever
  // resolves last wins the race); each run gets its own id, and only the
  // still-current one is allowed to touch state or continue polling.
  const generationRef = useRef(0);

  const schedulePoll = (generation: number, delayMs: number) => {
    timerRef.current = setTimeout(() => void poll(generation, delayMs), delayMs);
  };

  const poll = async (generation: number, delayMs: number) => {
    if (generationRef.current !== generation || !deviceCodeRef.current) return;
    try {
      const res = await api<DevicePollResponse>('/devices/poll', {
        method: 'POST',
        body: { deviceCode: deviceCodeRef.current },
      });
      if (generationRef.current !== generation) return;

      if (res.status === 'approved') {
        applySession({ accessToken: res.accessToken, expiresIn: res.expiresIn, user: res.user });
        router.replace(`/profiles?next=${encodeURIComponent(params.get('next') ?? '/')}`);
        return;
      }
      if (res.status === 'denied') {
        setStatus('denied');
        return;
      }
      if (res.status === 'expired') {
        setStatus('expired');
        return;
      }
      // 'pending' or 'slow_down' — keep waiting.
      schedulePoll(generation, delayMs);
    } catch {
      if (generationRef.current === generation) setStatus('error');
    }
  };

  const start = async () => {
    const generation = ++generationRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('loading');
    try {
      const res = await api<DeviceStartResponse>('/devices/start', { method: 'POST' });
      if (generationRef.current !== generation) return;
      deviceCodeRef.current = res.deviceCode;
      setUserCode(res.userCode);
      const dataUrl = await QRCode.toDataURL(res.verificationUrlComplete);
      if (generationRef.current !== generation) return;
      setQrDataUrl(dataUrl);
      setStatus('waiting');
      schedulePoll(generation, res.interval * 1000);
    } catch {
      if (generationRef.current === generation) setStatus('error');
    }
  };

  useEffect(() => {
    void start();
    return () => {
      generationRef.current++;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-night px-4">
      <Panel className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold text-bone">Sign in with QR code</h1>

        {status === 'loading' && <p className="text-sm text-ash">Preparing your code…</p>}

        {status === 'waiting' && qrDataUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not an optimizable remote asset */}
            <img src={qrDataUrl} alt="Scan to sign in" className="mx-auto size-56 bg-bone p-2" />
            <p className="text-sm text-ash">Scan with your phone, or open the sign-in link and enter this code:</p>
            <p className="label-mono text-2xl tracking-[0.3em] text-brass-hot">{userCode}</p>
            <p className="text-xs text-ash-dim">Waiting for approval…</p>
          </>
        )}

        {status === 'denied' && (
          <>
            <Banner tone="bad">Sign-in was denied.</Banner>
            <Button className="w-full" onClick={() => void start()}>
              Try again
            </Button>
          </>
        )}

        {status === 'expired' && (
          <>
            <Banner tone="warn">This code expired.</Banner>
            <Button className="w-full" onClick={() => void start()}>
              Get a new code
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Banner tone="bad">Something went wrong.</Banner>
            <Button className="w-full" onClick={() => void start()}>
              Try again
            </Button>
          </>
        )}

        <p className="text-sm text-white/60">
          <Link href="/login" className="font-medium text-white hover:underline">
            Back to sign in
          </Link>
        </p>
      </Panel>
    </main>
  );
}

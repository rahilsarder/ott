'use client';

import Script from 'next/script';
import { useCallback, useId, useRef } from 'react';
import { useSession } from '@/lib/session';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

/**
 * Raw Google Identity Services, not a wrapper library — this is one button,
 * not worth a new dependency. `onSuccess`/`onError` let the caller (the login
 * page) own navigation and error display, same as it does for email sign-in.
 */
export function GoogleSignInButton({ onSuccess, onError }: { onSuccess: () => void; onError: (message: string) => void }) {
  const { signInWithGoogle } = useSession();
  const elementId = useId().replace(/:/g, '');
  const initialized = useRef(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const init = useCallback(() => {
    if (!clientId || !window.google || initialized.current) return;
    initialized.current = true;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        signInWithGoogle(response.credential).then(onSuccess).catch(() => onError('Google sign-in failed. Please try again.'));
      },
    });

    const el = document.getElementById(elementId);
    if (el) window.google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', width: 320 });
  }, [clientId, elementId, onError, onSuccess, signInWithGoogle]);

  if (!clientId) return null;

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={init} onReady={init} />
      <div id={elementId} className="flex justify-center" />
    </>
  );
}

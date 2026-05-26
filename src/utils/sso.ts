export function redirectToSSO(): void {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const callbackUrl = encodeURIComponent(
    isLocalhost
      ? `${window.location.origin}/#/sso/callback`
      : 'https://app.candy.cx/#/sso/callback'
  );
  window.location.href = `https://spacemarvel.ai/login?redirect_uri=${callbackUrl}`;
}

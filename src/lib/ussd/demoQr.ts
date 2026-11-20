import qrcode from 'qrcode-generator';

export type DemoDestination = {ok: true; url: string} | {ok: false; message: string};
/** No request-host inference, query overrides, credentials, fragments or bearer data. */
export function demoDestination(configured: unknown): DemoDestination {
  if (typeof configured !== 'string' || !configured.trim()) return {ok: false, message: 'No public demo URL is configured. Ask the presenter to configure VITE_PUBLIC_DEMO_URL and rebuild the app.'};
  try {
    const u = new URL(configured.trim()); const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.port || !['/', '/ussd-demo', '/ussd-demo/'].includes(u.pathname)) throw new Error();
    // QR posters must never send a judge to loopback, a private LAN, an IP literal or a placeholder hostname.
    if (!host.includes('.') || host.endsWith('.') || host.endsWith('.home.arpa') || /[:\[\]]/.test(host) || /^\d+(\.\d+){3}$/.test(host) || /(^|\.)(localhost|local|lan|internal|test|invalid|example)$/.test(host) || /(^|\.)example\.(com|org|net)$/.test(host)) throw new Error();
    if (u.href.length > 240) throw new Error();
    return {ok: true, url: `${u.origin}/ussd-demo`};
  } catch {
    return {ok: false, message: 'Configure VITE_PUBLIC_DEMO_URL with the public HTTPS origin (or its /ussd-demo URL). Localhost, IP addresses, custom ports, credentials, query strings and fragments cannot be used on the poster.'};
  }
}
export function qrMatrix(url: string): boolean[][] {
  const code = qrcode(0, 'M'); code.addData(url, 'Byte'); code.make();
  return Array.from({length: code.getModuleCount()}, (_, y) => Array.from({length: code.getModuleCount()}, (_, x) => code.isDark(y, x)));
}
export function qrPath(matrix: boolean[][], quiet = 4): string {
  return matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + quiet},${y + quiet}h1v1h-1z`] : [])).join('');
}

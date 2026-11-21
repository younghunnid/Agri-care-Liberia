import React, {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {demoDestination, qrMatrix, qrPath} from '../../lib/ussd/demoQr';

export const QR_TITLE = 'Scan to Try the Agricare Basic-Phone Demo.';
export const DemoQr: React.FC<{poster?: boolean; configured?: string}> = ({poster = false, configured = import.meta.env?.VITE_PUBLIC_DEMO_URL ?? ''}) => {
  const target = useMemo(() => demoDestination(configured), [configured]);
  const matrix = useMemo(() => target.ok ? qrMatrix(target.url) : null, [target]);
  return (
    <section className={`rounded-3xl border-2 border-[#183B2B]/15 bg-white p-5 space-y-4 ${poster ? 'text-center' : ''}`} data-testid="demo-qr" aria-labelledby="qr-heading">
      <h2 id="qr-heading" className="font-display text-2xl font-extrabold">{QR_TITLE}</h2>
      {target.ok && matrix ? <>
        <a href={target.url} aria-label="Open the public basic-phone demonstration" data-testid="qr-link" className="inline-block max-w-full rounded-xl focus-visible:ring-4 focus-visible:ring-[#16803C]">
          <svg role="img" aria-label="QR code for the public Agricare basic-phone demonstration" data-testid="qr-code" data-destination={target.url} viewBox={`0 0 ${matrix.length + 8} ${matrix.length + 8}`} className={`w-full h-auto ${poster ? 'max-w-[400px]' : 'max-w-[240px]'}`} width="280" height="280" shapeRendering="crispEdges">
            <rect width="100%" height="100%" fill="white" /><path d={qrPath(matrix)} fill="black" />
          </svg>
        </a>
        <p className="break-all font-mono text-sm" data-testid="qr-destination">{target.url}</p>
        <p className="text-base">Browser-based USSD simulator. No active telecom service, payment or money transfer.</p>
      </> : <div role="note" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-left space-y-2" data-testid="qr-setup">
        <p className="font-bold">Public demo link needs setup</p><p>{'message' in target ? target.message : 'The QR code could not be generated.'}</p>
        <p>Use the address where this application is actually hosted. Verify that /ussd opens there (a full-screen phone, no website around it) before printing. Do not put a password, access token or sign-in link in this setting.</p>
      </div>}
      {!poster && <Link to="/ussd-demo/poster" className="agri-button-secondary">Open printable QR poster</Link>}
    </section>
  );
};

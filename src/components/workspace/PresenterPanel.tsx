import React from 'react';
import {Link} from 'react-router-dom';
import {useApp} from '../../context/AppContext';
import {useResource} from '../../lib/useResource';
import {MetricCard, PanelState, SectionCard} from './DashboardBits';

const LAUNCH = [
  {to: '/today', label: 'Farmer Today'},
  {to: '/check-my-crop', label: 'Check my crop'},
  {to: '/demo/farm-to-market', label: 'Farm-to-market walkthrough'},
  {to: '/demo/cassava', label: 'Cassava demonstration'},
  {to: '/ussd-demo', label: 'Basic-phone (USSD-style) demo'},
  {to: '/ussd-demo/poster', label: 'QR poster'},
  {to: '/ministry', label: 'Ministry workspace'},
  {to: '/marketplace', label: 'Marketplace'},
];

/** Presenter readiness from facts the app can verify itself: connection, environment flag, sign-in and scenario progress on this device. */
export const PresenterPanel: React.FC<{completed: number; total: number}> = ({completed, total}) => {
  const {isOnline, user} = useApp();
  const env = useResource<boolean | null>(async () => {
    const r = await fetch('/api/v1/environment', {headers: {Accept: 'application/json'}});
    if (!r.ok) return null;
    const j = (await r.json()) as {demoEnvironment?: boolean};
    return typeof j.demoEnvironment === 'boolean' ? j.demoEnvironment : null;
  }, [], isOnline);
  const role = user ? (user.roles.includes('admin') ? 'Administrator' : user.roles.includes('expert') ? 'Expert' : 'Farmer') : 'Not signed in';

  return (
    <SectionCard title="Presenter dashboard" description="Checks the app can make about itself before you start. Nothing here is a statistic about farmers.">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Connection" value={isOnline ? 'Online' : 'Offline'} source="This browser" note={isOnline ? 'Live pages and data are reachable.' : 'Saved pages and queued actions only.'} />
        <MetricCard label="Environment" loading={isOnline && env.loading} value={env.data === true ? 'Demonstration' : env.data === false ? 'Standard' : undefined} source="Server" note={env.data === true ? 'Simulated SMS, synthetic accounts only.' : 'The server did not report a demonstration flag.'} />
        <MetricCard label="Signed in as" value={role} source="This session" note={role === 'Administrator' ? 'You can reset shared demo data.' : 'Resetting shared demo data needs an administrator.'} />
        <MetricCard label="Journeys viewed" value={`${completed} of ${total}`} source="This device" note="Scenario progress is stored on this device only." />
      </div>
      {!isOnline && <div className="mt-4"><PanelState kind="offline" title="You are offline">Open each journey once while online so it is saved before a presentation without signal.</PanelState></div>}
      <h3 className="mb-2 mt-5 text-sm font-bold">Quick launch</h3>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{LAUNCH.map((l) => <li key={l.to}><Link to={l.to} className="flex min-h-[44px] items-center rounded-xl bg-[#F3F8F0] px-3 text-sm font-semibold hover:bg-[#DDEFE0]">{l.label}</Link></li>)}</ul>
    </SectionCard>
  );
};

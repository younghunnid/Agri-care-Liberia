import React from 'react';
import {Link} from 'react-router-dom';
import {PRIVACY_VERSION} from '../../lib/privacy';

/** Privacy notice. DRAFT for the programme to review (legal and data-protection advice) before real farmers register. Written in plain language. */
export const PrivacyPage: React.FC = () => (
  <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6 text-[#183B2B]" data-testid="privacy-page">
    <header className="space-y-2">
      <h1 className="font-display text-3xl font-extrabold">Privacy notice</h1>
      <p className="text-sm text-[#183B2B]/75">Agricare Liberia · version {PRIVACY_VERSION}. This notice is a draft for the project team to review with legal and data-protection advice before it is relied on for real farmers.</p>
    </header>
    <section aria-labelledby="p-what" className="space-y-2">
      <h2 id="p-what" className="text-xl font-extrabold">What we keep</h2>
      <ul className="list-disc pl-5 space-y-1 text-base">
        <li>Your name or display name, your phone number, your county, preferred language and the crops you chose. An e-mail address only if you give one.</li>
        <li>Your password, stored only as a salted hash. Nobody, including the team, can read it or look it up.</li>
        <li>What you ask and save in the app: questions, photos or voice notes you attach, harvest listings and messages between buyers and sellers.</li>
        <li>On the USSD demo handset, if you agree: your category (for example Farmer or Buyer), your county, the time you agreed, and a private code made by your browser. It is not your phone number.</li>
        <li>A security log (sign-ins, password changes, recovery steps) kept for safety and for investigating misuse.</li>
      </ul>
    </section>
    <section aria-labelledby="p-phone" className="space-y-2">
      <h2 id="p-phone" className="text-xl font-extrabold">Your phone number is not verified</h2>
      <p className="text-base">This site does not send text messages. You sign in with your phone number and password. We do not prove that a number belongs to the person who typed it, so it is shown as <strong>Not verified</strong>. Your number is shown to a buyer only if you choose that on a listing.</p>
    </section>
    <section aria-labelledby="p-why" className="space-y-2">
      <h2 id="p-why" className="text-xl font-extrabold">Why and who sees it</h2>
      <ul className="list-disc pl-5 space-y-1 text-base">
        <li>To give you farming advice, save your work, and connect you with experts, buyers and sellers.</li>
        <li>Administrators can see account details to run the service and to help with account recovery after they have checked who you are in another way.</li>
        <li>Experts see the questions sent to them. Buyers see what a seller chooses to publish.</li>
        <li>The Ministry view shows only combined numbers. Small groups are hidden or merged and numbers are rounded, so no person can be picked out.</li>
        <li>We do not sell your information. This demonstration is not an official Ministry system.</li>
      </ul>
    </section>
    <section aria-labelledby="p-keep" className="space-y-2">
      <h2 id="p-keep" className="text-xl font-extrabold">How long, and your choices</h2>
      <p className="text-base">Information is kept while your account exists. You can ask the team to show you what is held about you, to correct it, or to remove your account. There is not yet a button for this: please use the <Link to="/contact" className="font-semibold text-[#16803C] underline">Contact page</Link>. We will ask you to prove who you are before we act.</p>
    </section>
    <section aria-labelledby="p-weather" className="space-y-2">
      <h2 id="p-weather" className="text-xl font-extrabold">Weather</h2>
      <p className="text-base">To show a forecast, the place you choose (or your phone's approximate position, only if you tap "Use my location" and allow it) is sent to our server and then to Open-Meteo.com. We do not send your name, phone number or address to them, and we do not keep your position. The forecast is saved on your own phone so it can be shown offline, labelled as old.</p>
    </section>
    <section aria-labelledby="p-forgot" className="space-y-2">
      <h2 id="p-forgot" className="text-xl font-extrabold">If you forget your password</h2>
      <p className="text-base">A password cannot be reset by phone number alone. An administrator checks who you are in person or on a number the programme already knew, then gives you a one-time code. You choose a new password with it, and every other device is signed out.</p>
    </section>
    <section aria-labelledby="p-demo" className="space-y-2">
      <h2 id="p-demo" className="text-xl font-extrabold">Demonstration accounts</h2>
      <p className="text-base">Accounts and records marked synthetic or demonstration are invented for presentations. They never contact real users.</p>
    </section>
  </div>
);

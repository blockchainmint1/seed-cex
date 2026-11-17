import * as React from "react";
import { Cta, Details, Layout, Note, P, SITE, when } from "../components";

export type AccountChangeProps = {
  name: string;
  /** Short noun phrase, e.g. "trading preferences", "Telegram alerts", "API key". */
  thing: string;
  /** What happened, plain sentence fragments, e.g. ["Default market: TXC/TSD → BTC/TSD"]. */
  changes: string[];
  at: string;
  timezone: string;
  /** Wording of the safest next step if it wasn't them. */
  ifNotYou?: string;
};

export function AccountChangeEmail(p: AccountChangeProps) {
  return (
    <Layout preview={`You changed your ${p.thing} on Seeds. If that wasn't you, act now.`} eyebrow="Account change" title={`You changed your ${p.thing}.`} footer="security">
      <P>We're confirming a change made while signed in to your Seeds account.</P>
      <Details rows={[
        ["What changed", p.thing],
        ...p.changes.map((c, i): [string, React.ReactNode] => [i === 0 ? "Details" : "", c]),
        ["When", when(p.at, p.timezone)],
      ]} />
      <P>If this was you, there's nothing else to do.</P>
      <Note tone="warn">If you didn't make this change: {p.ifNotYou ?? "revoke your HME Wallet link from your profile, sign out of Honest.Money everywhere, and contact support@honest.money."} Seeds will never ask for your recovery phrase.</Note>
      <Cta href={`${SITE}/account`}>Review your account</Cta>
    </Layout>
  );
}

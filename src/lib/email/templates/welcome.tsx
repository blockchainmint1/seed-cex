import * as React from "react";
import { Cta, Layout, Note, P, SITE, Steps } from "../components";

export type WelcomeProps = { name: string };

export function WelcomeEmail({ name }: WelcomeProps) {
  return (
    <Layout preview="Your Seeds account is ready. Here's how to make your first trade while you keep your keys." eyebrow="Welcome to Seeds" title={`Your account is ready, ${name}.`} footer="transactional">
      <P>Seeds is a non-custodial exchange. You trade from a trading pocket in your own HME Wallet, so your coins stay under your keys until a trade settles.</P>
      <Steps steps={[
        { title: "Link your HME Wallet", body: "On your profile, scan the link code with HME Wallet. Choose instant trades or approve every trade yourself." },
        { title: "Fund your trading pocket", body: "Move only what you want to trade into the pocket. Your savings stay separate and Seeds never sees them." },
        { title: "Pick a market and place an order", body: "Every order shows the price, the fee and what settles where before you confirm." },
      ]} />
      <Cta href={`${SITE}/account`}>Open your profile</Cta>
      <Note>Your recovery phrase restores your wallet. Store it offline. If it's lost, your assets may not be recoverable, and nobody can reset it for you.</Note>
      <P muted>Want the full picture first? Read <a href={`${SITE}/how-it-works`} style={{ color: "#0A7A35" }}>how Seeds works</a>.</P>
    </Layout>
  );
}

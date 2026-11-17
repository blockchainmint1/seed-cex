import * as React from "react";
import { Cta, Details, Layout, Note, P, when } from "../components";

export type LegacyLinkProps = { name: string; linkUrl: string; expiresAt: string; timezone: string };

export function LegacyLinkEmail(p: LegacyLinkProps) {
  return (
    <Layout
      preview="We found your older Seeds account. Confirm it's yours to join it to your Honest.Money membership."
      eyebrow="Link your account"
      title="We found your older Seeds account."
      footer="security"
    >
      <P>Hi {p.name}, you just signed in to Seeds with Honest.Money, and this email address already has a Seeds account from before Honest.Money sign-in.</P>
      <P>Confirm it's yours and we'll join it to your membership. Your order history, trades and saved wallet carry over, and from now on you sign in with Honest.Money only.</P>
      <Details rows={[["Link works until", when(p.expiresAt, p.timezone)], ["Works", "Once"]]} />
      <Cta href={p.linkUrl}>Link my older account</Cta>
      <Note tone="warn">If you didn't just sign in to Seeds, ignore this email. Nothing changes unless someone clicks the button. Seeds will never ask for your recovery phrase.</Note>
    </Layout>
  );
}

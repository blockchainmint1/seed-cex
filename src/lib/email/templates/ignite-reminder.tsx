import * as React from "react";
import { Cta, Details, Layout, Note, P, SITE, usd } from "../components";

export type IgniteReminderProps = { name: string; amount: number; dates: string; time: string; seatsLeft: number; className: string; classSlug: string };

export function IgniteReminderEmail(p: IgniteReminderProps) {
  return (
    <Layout
      preview={`Your seat in ${p.className} isn't reserved yet. Pay ${usd(p.amount)} to hold it. ${p.seatsLeft} seats left.`}
      eyebrow="To the Moon class"
      title="Finish reserving your To the Moon seat."
      footer="transactional"
    >
      <P>Hi {p.name}, you started registering for {p.className}, a Seeds To the Moon crypto trading class, but your payment hasn't come through yet, so your seat isn't held.</P>
      <Details rows={[
        ["Class", p.className],
        ["Dates", p.dates],
        ["Time", p.time],
        ["To pay", usd(p.amount)],
        ["Seats left", String(p.seatsLeft)],
      ]} />
      <Cta href={`${SITE}/to-the-moon/${p.classSlug}`}>Finish my registration</Cta>
      <P muted>Sign in with your Honest.Money account. Your details are saved, so you only need to pay. A fresh payment link opens each time, so an older link that ran out is fine to ignore.</P>
      <Note>If you already paid in the last few minutes, NectarPay may still be confirming it. Open the link above and Seeds will check again.</Note>
    </Layout>
  );
}

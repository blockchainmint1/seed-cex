import * as React from "react";
import { Details, Layout, Note, P } from "../components";

export type WithdrawalCodeProps = {
  name: string;
  code: string;
  amount: string;
  symbol: string;
  network: string;
  to: string;
  minutes: number;
};

/** The 6-digit email code for exactly one withdrawal. Security email: always sent. */
export function WithdrawalCodeEmail(p: WithdrawalCodeProps) {
  return (
    <Layout preview={`Your Seeds withdrawal code: ${p.code}`} eyebrow="Withdrawal code" title={`Your code: ${p.code}`} footer="security">
      <P>Enter this code on Seeds to approve this withdrawal. It works only for these exact details and ends in {p.minutes} minutes.</P>
      <Details rows={[
        ["Code", <b key="c" style={{ fontSize: 22, letterSpacing: 4 }}>{p.code}</b>],
        ["Amount", `${p.amount} ${p.symbol}`],
        ["Network", p.network],
        ["To", p.to],
      ]} />
      <P>After the code, Seeds also asks for your authenticator code and a tap in Telegram. Nothing moves before all three.</P>
      <Note tone="warn">If you didn't ask for this: don't enter the code, revoke your trading pocket in HME Wallet, sign out of Honest.Money everywhere and contact support@honest.money. Seeds will never ask for this code by phone, chat or email.</Note>
    </Layout>
  );
}

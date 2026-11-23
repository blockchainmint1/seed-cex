import * as React from "react";
import { Cta, Layout, P, SITE } from "../components";

export type IgniteInterestProps = { subject: string; paragraphs: string[]; classSlug: string | null; unsubscribeUrl: string };

/** News about Ignite classes, written by an admin, to people on the interest list. Text only; React escapes everything. */
export function IgniteInterestEmail(p: IgniteInterestProps) {
  return (
    <Layout preview={p.paragraphs[0]?.slice(0, 140) ?? p.subject} eyebrow="Seeds Flight School" title={p.subject} footer="interest" unsubscribeUrl={p.unsubscribeUrl}>
      {p.paragraphs.map((t, i) => (
        <P key={i}>{t.split("\n").map((line, j) => (j ? [<br key={j} />, line] : line))}</P>
      ))}
      <Cta href={p.classSlug ? `${SITE}/flight-school/${p.classSlug}` : `${SITE}/flight-school`}>{p.classSlug ? "See the class" : "See upcoming classes"}</Cta>
      <P muted>The Seeds team</P>
    </Layout>
  );
}

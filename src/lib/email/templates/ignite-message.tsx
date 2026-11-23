import * as React from "react";
import { Layout, P } from "../components";

export type IgniteMessageProps = { subject: string; paragraphs: string[] };

/** A message an admin writes to Ignite registrants. Text only; React escapes everything. */
export function IgniteMessageEmail(p: IgniteMessageProps) {
  return (
    <Layout preview={p.paragraphs[0]?.slice(0, 140) ?? p.subject} eyebrow="To the Moon class" title={p.subject} footer="transactional">
      {p.paragraphs.map((t, i) => (
        <P key={i}>{t.split("\n").map((line, j) => (j ? [<br key={j} />, line] : line))}</P>
      ))}
      <P muted>The Seeds team</P>
    </Layout>
  );
}

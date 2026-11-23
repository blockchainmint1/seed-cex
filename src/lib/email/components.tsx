/**
 * Seeds email building blocks, following the brand guidelines (v0.1):
 * Deep Forest header with the supplied lockup, Warm Ivory surfaces, Manrope
 * with the system fallback stack, tabular figures, flat color only, and one
 * Seed Green action per email. Copy is plain, specific and calm.
 */
import * as React from "react";
import {
  Body, Button, Container, Column, Head, Heading, Hr, Html, Img, Link, Preview, Row, Section, Text,
} from "@react-email/components";
import logo from "@/assets/email/seeds-lockup.png.asset.json";

export const SITE = "https://seeds.honest.money";
export const LOGO_URL = `${SITE}${logo.url}`;

export const C = {
  green: "#19ED50",
  forest: "#002419",
  logoGround: "#021D12",
  nearBlack: "#00170F",
  ivory: "#FFF8E8",
  ivory200: "#F2EAD6",
  line: "#DCD2BC",
  stone: "#56645C",
  greenDeep: "#0A7A35",
  amberDeep: "#8A5800",
  redDeep: "#B3261E",
} as const;

const FONT = "Manrope, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum'" };

export type FooterKind = "security" | "transactional" | "weekly" | "peer" | "interest";

export function Layout(props: {
  preview: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  footer: FooterKind;
  unsubscribeUrl?: string;
}) {
  return (
    <Html lang="en">
      <Head>
        {/* Clients that block web fonts fall back to the system stack, as the brand guide specifies for email. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{props.preview}</Preview>
      <Body style={{ backgroundColor: C.ivory200, margin: 0, padding: "32px 12px", fontFamily: FONT, color: C.forest }}>
        <Container style={{ maxWidth: 600, width: "100%", margin: "0 auto" }}>
          <Section style={{ backgroundColor: C.logoGround, borderRadius: "12px 12px 0 0", padding: "28px 32px" }}>
            <Link href={SITE}><Img src={LOGO_URL} width="156" height="48" alt="seeds" style={{ display: "block", border: 0 }} /></Link>
          </Section>
          <Section style={{ backgroundColor: C.ivory, border: `1px solid ${C.line}`, borderTop: 0, borderRadius: "0 0 12px 12px", padding: "32px 32px 28px" }}>
            <Text style={{ margin: 0, fontSize: 13, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.02em", color: C.greenDeep }}>{props.eyebrow}</Text>
            <Heading as="h1" style={{ margin: "8px 0 20px", fontSize: 28, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.01em", color: C.forest }}>{props.title}</Heading>
            {props.children}
          </Section>
          <Footer kind={props.footer} unsubscribeUrl={props.unsubscribeUrl} />
        </Container>
      </Body>
    </Html>
  );
}

export function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={{ margin: "0 0 16px", fontSize: 16, lineHeight: "24px", color: muted ? C.stone : C.forest }}>{children}</Text>;
}

export function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button href={href} style={{ backgroundColor: C.green, color: C.nearBlack, fontSize: 15, lineHeight: "20px", fontWeight: 600, borderRadius: 12, padding: "14px 24px", textDecoration: "none", display: "inline-block" }}>
        {children}
      </Button>
    </Section>
  );
}

/** Label/value rows; values right-aligned with tabular figures. */
export function Details({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <Section style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: "4px 20px", margin: "0 0 24px", backgroundColor: "#FFFFFF" }}>
      {rows.map(([label, value], i) => (
        <Row key={`${i}-${label}`} style={{ borderTop: i === 0 ? 0 : `1px solid ${C.ivory200}` }}>
          <Column style={{ padding: "12px 12px 12px 0", fontSize: 13, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.02em", color: C.stone, verticalAlign: "top", width: "42%" }}>{label}</Column>
          <Column style={{ padding: "12px 0", fontSize: 15, lineHeight: "20px", fontWeight: 600, color: C.forest, textAlign: "right", overflowWrap: "anywhere", ...NUM }}>{value}</Column>
        </Row>
      ))}
    </Section>
  );
}

export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <Section style={{ margin: "0 0 24px" }}>
      {steps.map((s, i) => (
        <Row key={s.title} style={{ marginBottom: 12 }}>
          <Column style={{ width: 36, verticalAlign: "top" }}>
            <Text style={{ margin: 0, width: 28, height: 28, lineHeight: "28px", borderRadius: 14, backgroundColor: C.forest, color: C.ivory, textAlign: "center", fontSize: 13, fontWeight: 600, ...NUM }}>{i + 1}</Text>
          </Column>
          <Column style={{ verticalAlign: "top", paddingBottom: 12 }}>
            <Text style={{ margin: "3px 0 2px", fontSize: 16, lineHeight: "22px", fontWeight: 600, color: C.forest }}>{s.title}</Text>
            <Text style={{ margin: 0, fontSize: 15, lineHeight: "22px", color: C.stone }}>{s.body}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

/** Calm callout. tone="warn" uses Amber Deep text on ivory, never color alone. */
export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const accent = tone === "warn" ? C.amberDeep : C.greenDeep;
  return (
    <Section style={{ borderLeft: `3px solid ${accent}`, backgroundColor: C.ivory200, borderRadius: "0 8px 8px 0", padding: "12px 16px", margin: "0 0 24px" }}>
      <Text style={{ margin: 0, fontSize: 14, lineHeight: "21px", color: C.forest }}>{children}</Text>
    </Section>
  );
}

export function Stat({ items }: { items: { label: string; value: string }[] }) {
  return (
    <Section style={{ margin: "0 0 24px" }}>
      <Row>
        {items.map((it, i) => (
          <Column key={it.label} style={{ width: `${100 / items.length}%`, paddingLeft: i === 0 ? 0 : 6, paddingRight: i === items.length - 1 ? 0 : 6, verticalAlign: "top" }}>
            <div style={{ padding: "14px 16px", border: `1px solid ${C.line}`, borderRadius: 12, backgroundColor: "#FFFFFF" }}>
              <Text style={{ margin: 0, fontSize: 13, lineHeight: "16px", fontWeight: 600, letterSpacing: "0.02em", color: C.stone }}>{it.label}</Text>
              <Text style={{ margin: "6px 0 0", fontSize: 24, lineHeight: "30px", fontWeight: 700, color: C.forest, ...NUM }}>{it.value}</Text>
            </div>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13, fontWeight: 500 }}>{children}</span>;
}

function Footer({ kind, unsubscribeUrl }: { kind: FooterKind; unsubscribeUrl?: string }) {
  const link = { color: C.stone, textDecoration: "underline" };
  const reason = kind === "interest"
    ? "You're receiving this because you asked to hear about Seeds Ignite classes, or started registering for one."
    : kind === "peer"
    ? "A Seeds member asked us to send you this payment link. If you don't know them, ignore this email. Nothing happens unless you pay."
    : kind === "security"
    ? "You're receiving this because it's about the security of your Seeds account. These emails can't be turned off."
    : kind === "weekly"
      ? "You're receiving this weekly update because you have a Seeds account."
      : "You're receiving this because of activity on your Seeds account.";
  return (
    <Section style={{ padding: "24px 8px 0" }}>
      <Text style={{ margin: "0 0 12px", fontSize: 13, lineHeight: "19px", color: C.stone }}>
        Seeds is non-custodial: you hold your keys, and nobody from Seeds or Honest Money will ever ask for your recovery phrase.
      </Text>
      <Text style={{ margin: "0 0 12px", fontSize: 13, lineHeight: "19px", color: C.stone }}>
        {reason}{" "}
        {kind !== "security" && kind !== "peer" && kind !== "interest" ? <Link href={`${SITE}/account/alerts`} style={link}>Email settings</Link> : null}
        {unsubscribeUrl ? <>{" · "}<Link href={unsubscribeUrl} style={link}>{kind === "interest" ? "Unsubscribe from class news" : "Unsubscribe from weekly updates"}</Link></> : null}
      </Text>
      <Hr style={{ borderColor: C.line, margin: "16px 0" }} />
      <Text style={{ margin: "0 0 6px", fontSize: 13, lineHeight: "19px", fontWeight: 500, color: C.forest }}>
        Part of the <Link href="https://honest.money" style={{ color: C.forest, textDecoration: "underline" }}>Honest Money Ecosystem</Link>
      </Text>
      <Text style={{ margin: 0, fontSize: 13, lineHeight: "19px", color: C.stone }}>
        <Link href={`${SITE}/terms`} style={link}>Terms</Link>{" · "}
        <Link href={`${SITE}/privacy`} style={link}>Privacy</Link>{" · "}
        <Link href={`${SITE}/manifesto`} style={link}>Manifesto</Link>{" · "}
        <Link href="mailto:support@honest.money" style={link}>support@honest.money</Link>
      </Text>
    </Section>
  );
}

export function fmt(n: number, max = 8): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: max }) : "—";
}
export function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function when(iso: string, tz = "UTC"): string {
  try {
    return new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  } catch {
    return new Date(iso).toUTCString();
  }
}

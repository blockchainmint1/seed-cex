import { Globe, MessageCircle, Mail } from "lucide-react";
import { gradeOf } from "@/lib/recruit/recruit-rules";
import { fmtCompact } from "@/lib/format";

export const money = (n: number | null | undefined) => (n == null ? "—" : `$${fmtCompact(n)}`);

export function GradePill({ score }: { score: number }) {
  const g = gradeOf(score);
  const cls = g === "A" ? "border-primary/50 bg-primary/10 text-primary" : g === "B" ? "border-border bg-muted text-foreground" : g === "C" ? "border-border text-muted-foreground" : "border-destructive/40 text-destructive";
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${cls}`} title={`Score ${score} of 100`}><b>{g}</b> {score}</span>;
}

/** X's logo as a letter, so we don't pull a third-party icon. */
function XMark() {
  return <span className="font-display text-[11px] font-extrabold leading-none">X</span>;
}

export function ContactIcons({ website, twitter, telegram, email }: { website: string | null; twitter: string | null; telegram: string | null; email: string | null }) {
  const a = "inline-flex h-6 w-6 items-center justify-center rounded-sm border border-border text-muted-foreground hover:border-primary hover:text-primary";
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {website ? <a className={a} href={website} target="_blank" rel="noopener noreferrer nofollow" aria-label="Website"><Globe className="h-3.5 w-3.5" /></a> : null}
      {twitter ? <a className={a} href={twitter} target="_blank" rel="noopener noreferrer nofollow" aria-label="X account"><XMark /></a> : null}
      {telegram ? <a className={a} href={telegram} target="_blank" rel="noopener noreferrer nofollow" aria-label="Telegram"><MessageCircle className="h-3.5 w-3.5" /></a> : null}
      {email ? <a className={a} href={`mailto:${email}`} aria-label="Email"><Mail className="h-3.5 w-3.5" /></a> : null}
      {!website && !twitter && !telegram && !email ? <span className="text-xs text-muted-foreground">none</span> : null}
    </span>
  );
}

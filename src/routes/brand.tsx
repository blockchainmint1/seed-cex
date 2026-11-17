import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, ExternalLink, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import guidelines from "@/assets/brand/guidelines.pdf.asset.json";
import pageText from "@/assets/brand/page-text.json";

const assets = import.meta.glob<{ default: { url: string } }>(
  "../assets/brand/page-*.webp.asset.json",
  { eager: true },
);
const pages = Object.entries(assets)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, asset], index) => ({ url: asset.default.url, text: pageText[index] ?? "", number: index + 1 }));

export const Route = createFileRoute("/brand")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Seeds Brand Guidelines — Visual Identity & Brand Reference" },
      { name: "description", content: "The complete 21-page Seeds brand guidelines: logo, colors, typography, voice and product examples. Working draft v0.1, November 2026." },
      { property: "og:title", content: "Seeds Brand Guidelines — Visual Identity & Brand Reference" },
      { property: "og:description", content: "Explore the original Seeds brand guidelines and download the complete PDF. Working draft v0.1, November 2026." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrandPage,
});

function BrandPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected === null ? undefined : pages[selected];

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-foreground">Brand Guidelines</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={guidelines.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Open PDF</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={guidelines.url} download="Seeds_Brand_Guidelines.pdf"><Download />Download PDF</a>
          </Button>
        </div>
      </div>
      <div className="space-y-5 sm:space-y-8">
        {pages.map((page, index) => (
          <section key={page.number} aria-label={`Brand guidelines page ${page.number}`}>
            <div>
              <img
                src={page.url}
                alt={`Seeds brand guidelines, page ${page.number} of 21`}
                width={1920}
                height={1080}
                loading={index < 2 ? "eager" : "lazy"}
                decoding="async"
                className="block aspect-video w-full"
              />
            </div>
            <div className="mt-1 flex justify-end">
              <Button
                variant="secondary"
                size="icon"
                className="text-foreground"
                aria-label={`Enlarge page ${page.number}`}
                title={`Enlarge page ${page.number}`}
                onClick={() => setSelected(index)}
              ><ZoomIn /></Button>
            </div>
            <div className="sr-only">{page.text}</div>
          </section>
        ))}
      </div>
      <Dialog open={active !== undefined} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90dvh] w-[96vw] max-w-7xl overflow-auto p-4 pt-12" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Brand guidelines page {active?.number}</DialogTitle>
          {active && <img src={active.url} alt={`Seeds brand guidelines, page ${active.number}`} width={1920} height={1080} className="w-[1920px] max-w-none" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
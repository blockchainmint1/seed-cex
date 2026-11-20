import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import firstFrame from "@/assets/genesis/seeds_genesis_first_frame.jpg.asset.json";
import finalFrame from "@/assets/genesis/seeds_genesis_final_poster.jpg.asset.json";
import suppliedPoster from "@/assets/genesis/seeds_genesis_final_poster_supplied.jpg.asset.json";
import videoMp4 from "@/assets/genesis/seeds_genesis_web_hero.mp4.asset.json";
import videoWebm from "@/assets/genesis/seeds_genesis_web_hero.webm.asset.json";

/** Screens that get the moving version; phones and reduced-motion get the still tree. */
export const GENESIS_MOTION_QUERY = "(min-width: 640px) and (prefers-reduced-motion: no-preference)";
export const GENESIS_FIRST_FRAME = firstFrame.url;
export const GENESIS_POSTER = suppliedPoster.url;

// Remembered only in the browser (set after playback), so moving between pages
// never restarts the growth; a fresh page load plays it once more.
let playedThisVisit = false;

type Phase = "waiting" | "playing" | "rest";

function GenesisMedia() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>(() => (playedThisVisit ? "rest" : "waiting"));
  const [mountVideo, setMountVideo] = useState(false);

  useEffect(() => {
    if (phase !== "waiting") return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!window.matchMedia(GENESIS_MOTION_QUERY).matches || conn?.saveData) {
      setPhase("rest");
      return;
    }
    setMountVideo(true);
    // Slow connection or blocked autoplay: settle on the finished tree.
    const t = window.setTimeout(() => setPhase((p) => (p === "waiting" ? "rest" : p)), 6000);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    const v = videoRef.current;
    if (!mountVideo || !v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.play().catch(() => setPhase("rest"));
  }, [mountVideo]);

  const finish = () => {
    playedThisVisit = true;
    setPhase("rest");
  };

  return (
    <div className="genesis-media" aria-hidden>
      {/* Resting image: the video's own last frame where it plays (seamless hand-off),
          the supplied final poster on phones and for reduced motion. */}
      <picture>
        <source media={GENESIS_MOTION_QUERY} srcSet={finalFrame.url} />
        <img
          src={suppliedPoster.url}
          alt=""
          width={910}
          height={512}
          decoding="async"
          className="genesis-layer genesis-rest"
        />
      </picture>
      <img
        src={firstFrame.url}
        alt=""
        width={848}
        height={464}
        fetchPriority="high"
        className="genesis-layer genesis-first"
        data-hidden={phase !== "waiting" ? "true" : undefined}
      />
      {mountVideo ? (
        <video
          ref={videoRef}
          className="genesis-layer genesis-video"
          data-hidden={phase === "rest" ? "true" : undefined}
          poster={firstFrame.url}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onPlaying={() => setPhase((p) => (p === "waiting" ? "playing" : p))}
          onEnded={finish}
          onError={() => setPhase("rest")}
        >
          <source src={videoWebm.url} type="video/webm" />
          <source src={videoMp4.url} type="video/mp4" />
        </video>
      ) : null}
      <noscript>
        <style>{".genesis-first{display:none}"}</style>
      </noscript>
    </div>
  );
}

/** Homepage hero: the "Seeds Genesis" animation with the headline beside it. */
export function GenesisHero() {
  return (
    <section className="genesis-hero dark relative isolate overflow-hidden border-b border-border bg-background text-foreground">
      <GenesisMedia />
      <div className="genesis-scrim" aria-hidden />
      <div className="relative z-10 mx-auto max-w-7xl px-5 pt-2 pb-14 sm:pb-16 lg:flex lg:min-h-(--genesis-h) lg:items-center lg:py-16">
        <div className="max-w-xl lg:max-w-[24rem] xl:max-w-[29rem] 2xl:max-w-[36rem]">
          <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
            The non-custodial exchange
          </p>
          <h1 className="mt-5 font-display text-[2.75rem] leading-[1.02] font-bold tracking-[-0.03em] text-foreground sm:text-6xl lg:text-[3.25rem] xl:text-[3.75rem] 2xl:text-[4.5rem]">
            Trade crypto.
            <br />
            Keep your keys.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            A clearer way to trade, with ownership in your hands.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/markets"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-action px-6 text-[0.9375rem] font-semibold text-action-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Explore Seeds
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-foreground/40 px-6 text-[0.9375rem] font-semibold text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              How it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

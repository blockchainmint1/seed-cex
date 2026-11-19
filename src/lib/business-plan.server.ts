/**
 * The Seeds business plan text. Server-only: getBusinessPlan returns it to
 * admins, so it never lands in the public JS bundle. Prices come from
 * listing.ts; outside facts carry where and when they were checked.
 */
import type { BusinessPlan } from "./business-plan";
import { finderFee } from "./business-plan";

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export const BUSINESS_PLAN: BusinessPlan = {
  updated: "2026-11-19",
  sections: [
    {
      id: "summary",
      title: "The short version",
      summary: "What Seeds is, who it's for, and how it pays its way.",
      blocks: [
        { kind: "text", text: "Seeds is the Honest Money Ecosystem's exchange. Members trade from their own HME Wallet pocket, Seeds never holds their coins, there's no KYC, and Seeds never charges a trading fee. Trading opens on November 30, 2026, the same day the first Ignite class starts." },
        { kind: "text", text: "Because trades are free, Seeds can't pay partners a cut of trading fees the way other exchanges do. Growth comes from three engines: the Ignite class (teaches people and brings them in), communities (coin teams, coaches and creators who bring their people), and word of mouth (invite links, events, giveaways). Money comes in from coin teams paying to list." },
        { kind: "items", title: "Who we're for", items: [
          { title: "The Honest Money family", body: "TEXITcoin holders and miners, ZCU and ISK members, and HME Wallet users. They already have the wallet Seeds needs, so they're the fastest to start.", status: "live" },
          { title: "Curious beginners", body: "People who want to learn to trade but are scared of losing coins to an exchange. Ignite is built for them." },
          { title: "Active traders tired of KYC and frozen accounts", body: "They want their keys, no ID uploads and no fees. Our message is aimed straight at them." },
          { title: "Coin teams", body: "Small and mid-sized projects that can't afford $25,000+ listings elsewhere. They're our paying customers, and every one brings its own community." },
        ] },
      ],
    },
    {
      id: "money",
      title: "How Seeds makes money",
      summary: "Listing fees today. Everything else is a proposal.",
      blocks: [
        { kind: "table", title: "Money in", head: ["Source", "Price", "Status"], rows: [
          ["Listing: Seed package", usd(1000), "On /list now"],
          ["Listing: Sapling package", usd(2500), "On /list now"],
          ["Listing: Grove package", usd(5000), "On /list now"],
          ["Trading fees", "None, ever", "Promise on the site"],
          ["Swap fee", "None for now", "Can be revisited"],
          ["Ignite $400 deposit", "Not income", "Goes back to the student for trading"],
        ] },
        { kind: "calc", calc: "listing" },
        { kind: "items", title: "Ideas for more income (none promised anywhere yet)", items: [
          { title: "Yearly listing renewal", body: "Still open: is a listing one-time or yearly? A smaller yearly renewal (for example a third of the package) would turn listings into steady income.", status: "decide" },
          { title: "Sponsored trading contests", body: "A coin team pays for a contest and puts up the prizes. Seeds runs it and labels it sponsored. Already part of Sapling and Grove, after launch.", status: "proposed" },
          { title: "Paid advanced classes", body: "Ignite stays the free-to-learn front door. A later \"Ignite Advanced\" or coach-run class could carry a real course fee.", status: "decide" },
          { title: "Extra spotlight weeks", body: "Coin teams can buy more homepage spotlight time beyond their package, always marked sponsored.", status: "proposed" },
        ] },
      ],
    },
    {
      id: "strategy",
      title: "Marketing strategy",
      summary: "One message, one path in, and a calendar.",
      blocks: [
        { kind: "items", title: "The message", items: [
          { title: "Your keys. No KYC. No Seeds fees.", body: "Every ad, post, talk and coin should say this in some form. It's simple, it's true today, and almost no other exchange can say it." },
          { title: "Proof, not promises", body: "We show the work: public stats, open code, published audits, the AI \"show the work\" tables. We never promise returns." },
        ] },
        { kind: "table", title: "The path every member takes", head: ["Step", "Where it happens", "Status"], rows: [
          ["1. Hears about Seeds", "Creator, coach, coin team, event, invite link, search", "Mixed"],
          ["2. Lands on Seeds", "Homepage with the Ignite pop-up, /coming-soon, /list", "Built"],
          ["3. Joins", "Signs in with Honest.Money", "Live"],
          ["4. Sets up", "Welcome guide: name, two-factor, wallet link, Telegram", "Built"],
          ["5. Learns", "Ignite class", "Live (first class Nov 30)"],
          ["6. First trade", "Order book, P2P desk, swaps", "Opens Nov 30"],
          ["7. Brings a friend", "Invite link and QR on Account → Referrals", "Live (no counts yet)"],
        ] },
        { kind: "table", title: "Calendar", head: ["When", "Focus", "Notes"], rows: [
          ["Now → Nov 30, 2026", "Fill the first Ignite class", "Telegram, email, homepage pop-up, creator shout-outs"],
          ["Nov 30 – Dec 4, 2026", "Launch week + Ignite", "Launch announcement, daily class clips (with permission)"],
          ["December 2026", "First coin listings", "Personally invite 10–20 coin teams from the HME family"],
          ["Jan 2027", "Second Ignite class + first coaches", "Alumni become helpers and referrers"],
          ["Feb 1–3, 2027", "Consensus Hong Kong", "Optional; far away, mostly a business crowd"],
          ["May 4–6, 2027", "Consensus, Miami Beach", "About 15,000 people (organizer's figure)"],
          ["Jul 15–17, 2027", "Bitcoin 2027, Nashville", "Over 20,000 a year since 2022 (organizer's figure); best fit for the coin giveaway"],
        ] },
        { kind: "note", tone: "info", text: "Conference dates and crowd sizes are from the organizers' own websites (conference.b.tc and consensus.coindesk.com), checked Nov 19, 2026. Booth and sponsor prices weren't listed; ask for quotes." },
      ],
    },
    {
      id: "influencers",
      title: "Trading influencers",
      summary: "Creators who already talk to the people we want.",
      blocks: [
        { kind: "items", title: "Who to go after", items: [
          { title: "Small and mid-sized creators first", body: "Roughly 5,000–100,000 followers on YouTube, X, Telegram or TikTok who talk about self-custody, privacy, no-KYC trading, TEXITcoin or Texas. Smaller audiences trust their creator more and cost far less." },
          { title: "Teachers over hype", body: "Pick people who explain things. A creator known for \"100x calls\" is a risk to our name." },
        ] },
        { kind: "items", title: "What we can offer (since there's no fee to share)", items: [
          { title: "Finder's fee on listings", body: `If a creator brings a coin team that pays and goes live, they get ${usd(finderFee("seed"))} / ${usd(finderFee("sapling"))} / ${usd(finderFee("grove"))} (20%). Same deal as any listing affiliate.`, status: "proposed" },
          { title: "Flat paid sponsorships", body: "A fixed fee per video, stream or post. Simple, and we know the cost up front.", status: "decide" },
          { title: "A guest spot in Ignite", body: "Teach one session. They get exposure, we get their audience in the room.", status: "proposed" },
          { title: "Creator trading contests", body: "A creator hosts a contest for their followers, prizes from a coin team. After launch.", status: "proposed" },
          { title: "Early access", body: "First look at new Seeds features to make content about." },
        ] },
        { kind: "items", title: "Rules for every paid creator", items: [
          { title: "Say it's paid", body: "US rules (the FTC) require paid creators to clearly say so, like \"#ad\" or \"paid partnership\". Put it in every agreement." },
          { title: "No return promises, no signals", body: "They can teach and show Seeds. They can't promise profits or tell people what to buy." },
          { title: "Tracked with their own invite link", body: "Each creator shares seeds.honest.money/invite/{code}. Ignite sign-ups already save the code; Seeds doesn't count clicks or HME sign-ups yet.", status: "decide" },
        ] },
      ],
    },
    {
      id: "coaches",
      title: "Trading coaches",
      summary: "Turn Ignite graduates and outside coaches into teachers who use Seeds as their classroom.",
      blocks: [
        { kind: "items", items: [
          { title: "Seeds Coach program", body: "Coaches finish Ignite, agree to our rules, and get a \"Seeds Coach\" badge. They run their own classes at their own price and teach on Seeds.", status: "proposed" },
          { title: "What coaches get", body: "The Ignite lesson material, a listing in a coach directory, their own invite link, early features, and the listing finder's fee for coin teams they bring.", status: "proposed" },
          { title: "Start small", body: "Five coaches after the first Ignite class, chosen by Bobby. Grow only once those five work out." },
          { title: "Hard rules", body: "Coaches never hold students' coins, never trade for them, and never promise returns. Seeds stays out of the money between coach and student." },
          { title: "Local meetups", body: "Coaches host \"Seeds Circles\" in their city, starting in Texas. Cheap, personal, and great for trust.", status: "proposed" },
        ] },
        { kind: "note", tone: "info", text: "Not built yet: coach badge, coach directory page, and class schedule. Say the word and I'll build them." },
      ],
    },
    {
      id: "affiliates",
      title: "Affiliates for listings",
      summary: "Anyone who brings a paying coin team gets paid.",
      blocks: [
        { kind: "table", title: "Proposed finder's fee (20%)", head: ["Package", "Price", "Finder gets", "Seeds keeps"], rows: [
          ["Seed", usd(1000), usd(finderFee("seed")), usd(1000 - finderFee("seed"))],
          ["Sapling", usd(2500), usd(finderFee("sapling")), usd(2500 - finderFee("sapling"))],
          ["Grove", usd(5000), usd(finderFee("grove")), usd(5000 - finderFee("grove"))],
        ] },
        { kind: "items", title: "Proposed rules", items: [
          { title: "Paid only after the coin is paid in full and live", body: "Nothing for applications that are declined or never pay." },
          { title: "One finder per coin", body: "The first written introduction wins, and it counts for 90 days." },
          { title: "Told to the coin team", body: "The coin team knows a finder introduced them. No hidden deals." },
          { title: "How it's paid", body: "In USD or TSD: your call.", status: "decide" },
          { title: "Who can be a finder", body: "Any HME member, creator, coach or existing coin team. Coin teams that refer other coins are often the best source." },
        ] },
        { kind: "note", tone: "info", text: "Not built yet: a \"Who sent you?\" box on the /list form, a Finder column in Admin → Listings, and payout tracking." },
      ],
    },
    {
      id: "coins",
      title: "Conference coins: the AOL plan",
      summary: "AOL put a free disc in every mailbox. We put a Seeds coin in every hand.",
      blocks: [
        { kind: "text", text: "The copper Seeds coin from the homepage becomes a giveaway. The front has the Seeds mark. The back has a QR code and a code under a scratch-off. Scan it, join with Honest.Money, link your wallet, and the coin is claimed. Every code is unique, so we know exactly which event and which handout brought each member in." },
        { kind: "note", tone: "warn", text: "The coin must not hold any crypto or a private key. In December 2013 the US Treasury's FinCEN told Casascius, the maker of physical bitcoins with coins loaded inside, that it was acting as an unregistered money transmitter, and it stopped making them (reported by WIRED and The Verge). A claim code with a capped reward avoids that, but get a lawyer to check any reward before we hand out a single coin." },
        { kind: "items", title: "What claiming gets you", items: [
          { title: "Start with no-money rewards", body: "A \"Founding member\" badge, priority for the next Ignite class, and an entry in a launch trading contest. No crypto has to move.", status: "proposed" },
          { title: "A small TSD welcome later, maybe", body: "Seeds can only send coins out on PulseChain today, so a TSD reward would need new sending support or a person sending by hand. One per HME member, with a total cap.", status: "decide" },
        ] },
        { kind: "table", title: "What coins cost (one maker's price list, checked Nov 19, 2026)", head: ["Coin size", "500 coins", "1,000 coins", "2,000 coins"], rows: [
          ["1.5 inch", "$2.95 each", "$2.88 each", "$2.83 each"],
          ["1.75 inch", "$3.28 each", "$3.25 each", "$3.18 each"],
          ["2 inch", "$3.58 each", "$3.54 each", "$3.47 each"],
        ] },
        { kind: "note", tone: "info", text: "Those are plain die-struck coins from allaboutchallengecoins.com, plus a one-time mold fee of $100–$150. Coloured or 3D coins from other makers ran about $4.25–$6 each at 1,000. Scratch-off labels and QR printing are extra. Get three quotes." },
        { kind: "calc", calc: "coins" },
        { kind: "items", title: "Where to hand them out", items: [
          { title: "Big shows, without a booth", body: "Side events, meetups and hallways at Bitcoin 2027 (Nashville) and Consensus (Miami). A team of 3–4 in Seeds shirts can hand out hundreds a day." },
          { title: "Texas and HME events", body: "TEXITcoin meetups and Texas crypto events are home turf and cheap to attend." },
          { title: "Every Ignite graduate", body: "Give each graduate 10 coins to hand to friends. Their code ties every claim back to them." },
          { title: "Seed packets too", body: "Real seed packets with a QR code: \"Plant a seed.\" Very cheap, on brand, and people keep them.", status: "proposed" },
        ] },
      ],
    },
    {
      id: "ideas",
      title: "More marketing ideas",
      summary: "Ranked roughly by cost: cheapest and fastest first.",
      blocks: [
        { kind: "items", items: [
          { title: "Get Seeds listed on CoinMarketCap and CoinGecko", body: "Seeds already has the price feed they ask for. Being listed as an exchange there puts Seeds in front of millions of crypto searchers for free.", status: "proposed" },
          { title: "Founding 1,000", body: "The first 1,000 members who link a wallet get a permanent badge. Scarcity plus pride. We're at the live wallet-link count shown above.", status: "proposed" },
          { title: "Referral leaderboard", body: "Show members how many people their link brought in, with a monthly top-10. Needs click and sign-up counting first.", status: "decide" },
          { title: "\"How to buy\" pages", body: "Pages like \"How to buy TEXITcoin with no KYC\" and one per listed coin. They show up in Google for years. Already promised in Sapling.", status: "proposed" },
          { title: "Launch press release, Nov 30", body: "\"Texas-born exchange opens with no KYC, no trading fees and no custody.\" Send to crypto news sites and Texas business press." },
          { title: "Weekly \"Seeds Live\"", body: "A 30-minute stream walking through the markets and an AI basket with its \"show the work\" tables. Teaching only, never tips." },
          { title: "Public Telegram channel", body: "Launch countdown, new listings, AMAs and class clips. We already run the Seeds alerts bot; this is the public side." },
          { title: "Coin community kits", body: "Every listed coin gets banners, a how-to-buy link and ready-made posts for its own Telegram. Their community becomes our marketing." },
          { title: "HME cross-promotion", body: "Ask HME for a Seeds spot in HME Wallet and the honest.money newsletter. Ours is the ecosystem's exchange.", status: "decide" },
          { title: "Spanish-language Seeds", body: "Spanish-speaking countries use a lot of crypto and get little help. Translate the homepage, Ignite and No KYC pages first.", status: "proposed" },
          { title: "Security bug bounty", body: "Pay people who find security holes. It protects members, and \"we pay hackers to check us\" builds trust.", status: "decide" },
          { title: "Graduation stories", body: "Short videos of Ignite students, only with their permission, about learning, never about profits." },
        ] },
      ],
    },
    {
      id: "guardrails",
      title: "Rules we never break",
      summary: "Marketing that would hurt members or the name isn't worth it.",
      blocks: [
        { kind: "items", items: [
          { title: "Never promise returns", body: "Not in ads, not from creators, not from coaches. Trading is risky and we say so." },
          { title: "Never hold members' coins", body: "No promotion, giveaway or partner deal may make Seeds a custodian." },
          { title: "Paid always means labelled", body: "Sponsored spotlights, paid creators and paid contests are always marked." },
          { title: "One reward per HME member", body: "With no KYC we can't check identities, so rewards are tied to an HME membership and capped in total." },
          { title: "Lawyer first on giveaways and contests", body: "Prizes and free coins can fall under sweepstakes and tax rules, and can be taxable to whoever receives them." },
        ] },
      ],
    },
    {
      id: "decisions",
      title: "Decisions for Bobby",
      summary: "Each of these unblocks something above.",
      blocks: [
        { kind: "items", items: [
          { title: "Finder's fee: is 20% right, and paid in USD or TSD?", body: "Unblocks the affiliate program and the creator deal.", status: "decide" },
          { title: "Listings: one-time or yearly?", body: "Changes the income picture a lot.", status: "decide" },
          { title: "Conference coins: how many, which size, and which first event?", body: "Bitcoin 2027 in Nashville (July) is my pick; start with 1,000 coins.", status: "decide" },
          { title: "Claim reward: badge only, or a small TSD amount too?", body: "Badge-only can start right away; TSD needs a lawyer and new sending support.", status: "decide" },
          { title: "Coaches: who are the first five?", body: "Ideally picked from the first Ignite class.", status: "decide" },
          { title: "Marketing budget per month", body: "With a number, I can rank these ideas by cost per new member.", status: "decide" },
          { title: "Targets", body: "How many members, linked wallets and listings by March 31, 2027?", status: "decide" },
        ] },
      ],
    },
  ],
};

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
        { kind: "text", text: "Seeds is the Honest Money Ecosystem's exchange. Members trade from their own HME Wallet pocket, Seeds never holds their coins, there's no KYC, and Seeds never charges a trading fee. Trading opens on November 30, 2026, the same day the first To the Moon class starts." },
        { kind: "text", text: "Because trades are free, Seeds can't pay partners a cut of trading fees the way other exchanges do. Growth comes from seven plays, all in this plan: P2P sellers who pick up where LocalBitcoins left off, weekly trading competitions, trading creators who stream on Seeds, coin teams stranded by BitMart's shutdown, affiliates who bring those teams, Seeds coins handed out at events, and a public voice from inside the exchange world saying why non-custodial matters. To the Moon stays the front door for beginners. Money comes in from coin teams paying to list." },
        { kind: "items", title: "Who we're for", items: [
          { title: "The Honest Money family", body: "TEXITcoin holders and miners, ZCU and ISK members, and HME Wallet users. They already have the wallet Seeds needs, so they're the fastest to start.", status: "live" },
          { title: "Curious beginners", body: "People who want to learn to trade but are scared of losing coins to an exchange. To the Moon is built for them." },
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
          ["Listing: Sapling package", usd(1000), "On /list now"],
          ["Listing: Grove package", usd(2500), "On /list now"],
          ["Listing: Forest package", usd(5000), "On /list now"],
          ["Trading fees", "None, ever", "Promise on the site"],
          ["Swap fee", "None for now", "Can be revisited"],
          ["To the Moon $400 deposit", "Not income", "Goes back to the student for trading"],
        ] },
        { kind: "calc", calc: "listing" },
        { kind: "items", title: "Ideas for more income (none promised anywhere yet)", items: [
          { title: "Yearly listing renewal", body: "Still open: is a listing one-time or yearly? A smaller yearly renewal (for example a third of the package) would turn listings into steady income.", status: "decide" },
          { title: "Sponsored trading contests", body: "A coin team pays for a contest and puts up the prizes. Seeds runs it and labels it sponsored. Already part of Grove and Forest, after launch.", status: "proposed" },
          { title: "Paid advanced classes", body: "To the Moon stays the free-to-learn front door. A later \"To the Moon Advanced\" or coach-run class could carry a real course fee.", status: "decide" },
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
          ["2. Lands on Seeds", "Homepage with the To the Moon pop-up, /coming-soon, /list", "Built"],
          ["3. Joins", "Signs in with Honest.Money", "Live"],
          ["4. Sets up", "Welcome guide: name, two-factor, wallet link, Telegram", "Built"],
          ["5. Learns", "To the Moon class", "Live (first class Nov 30)"],
          ["6. First trade", "Order book, P2P desk, swaps", "Opens Nov 30"],
          ["7. Brings a friend", "Invite link and QR on Account → Referrals", "Live (no counts yet)"],
        ] },
        { kind: "table", title: "Calendar", head: ["When", "Focus", "Notes"], rows: [
          ["Now → Nov 30, 2026", "Fill the first To the Moon class", "Telegram, email, homepage pop-up, creator shout-outs"],
          ["Nov 30 – Dec 4, 2026", "Launch week + To the Moon", "Launch announcement, daily class clips (with permission)"],
          ["December 2026", "First coin listings + BitMart list", "Personally invite 10–20 HME coin teams; build the BitMart lead list; recruit the first 50 P2P sellers; long-list 100 creators"],
          ["Jan 2027", "Second To the Moon class, first coaches, first weekly league", "League runs every Monday from here; 10 creator try-out streams; first coin order (5,000)"],
          ["Jan 31, 2027", "BitMart closes for good", "Big push of the BitMart refugee offer the same week"],
          ["Feb 1–3, 2027", "Consensus Hong Kong", "Optional; far away, mostly a business crowd"],
          ["May 4–6, 2027", "Consensus, Miami Beach", "About 15,000 people (organizer's figure)"],
          ["Jul 15–17, 2027", "Bitcoin 2027", "Over 20,000 a year since 2022 (organizer's figure); best fit for the coin giveaway. 2025 and 2026 were in Las Vegas; confirm the 2027 city before booking"],
        ] },
        { kind: "note", tone: "info", text: "Conference dates and crowd sizes are from the organizers' own websites (conference.b.tc and consensus.coindesk.com), checked Nov 19, 2026. Booth and sponsor prices weren't listed; ask for quotes." },
      ],
    },
    {
      id: "p2p",
      title: "P2P sellers: pick up where LocalBitcoins left off",
      summary: "LocalBitcoins closed in 2023 and Paxful in 2025. Their sellers need a new home.",
      blocks: [
        { kind: "text", text: "The P2P desk is built: sellers post ads, buyers pay by Zelle, cash or bank, and the coins move straight from the seller's own pocket after the seller taps Approve in Telegram. Seeds never holds the coins, never asks for ID, and takes no cut. The only fee is whatever the seller chooses to charge, and the buyer sees it before opening a trade. The job now is filling the marketplace with good sellers, because buyers go wherever the sellers are." },
        { kind: "table", title: "Who we're up against (checked Nov 19, 2026)", head: ["Platform", "Holds your coins?", "ID check?", "Fee", "Weak spot"], rows: [
          ["Paxful", "Closed", "—", "—", "Shut down Nov 1, 2025; withdrawals only. Its sellers are looking for a home."],
          ["NoOnes (Paxful's founder)", "Yes", "Yes, in levels", "1% to sell", "Holds coins; withdrawal fees; ID levels"],
          ["Binance P2P", "Yes", "Yes", "0–0.35%, both sides can pay", "ID, frozen accounts, merchant rules"],
          ["Bybit P2P", "Yes", "Yes", "0–0.30% by currency", "ID; fees change by currency"],
          ["OKX P2P", "Yes", "Yes", "0%", "Already free, so we win on keys and no ID, not on price"],
          ["Hodl Hodl", "No", "No", "0.75% each side", "Bitcoin only; no US"],
          ["Bisq", "No", "No", "0.15% / 1.15%", "Desktop app, deposits, hard to learn"],
          ["RoboSats", "No", "No", "0.025% / 0.175%", "Lightning + Tor; built for experts"],
          ["Peach", "Sellers hold, for now", "No (small trades)", "2% buyer", "Escrow paused Sept 2026; no US"],
          ["Vexl", "No", "No (phone number)", "0%", "Friends-of-friends only, no protection"],
          ["LocalCoinSwap", "No (on-chain escrow)", "No", "1% maker", "Small; pays a badge to Paxful sellers"],
        ] },
        { kind: "note", tone: "info", text: "Fees are the platforms' own published numbers, checked Nov 19, 2026 (paxful.com, noones.com, binance.com, bybit.com, okx.com, hodlhodl.com, bisq.wiki, docs.robosats.org, peachbitcoin.com, vexl.it, localcoinswap.com). None of them publish reliable P2P-only volume. Bitpapa was put on the US sanctions list in March 2024, so it's not a competitor we'd ever want to be compared with." },
        { kind: "items", title: "Why a seller moves to Seeds", items: [
          { title: "Your coins never leave your wallet until you approve", body: "On Binance, Bybit, OKX and NoOnes the coins sit with the exchange during a trade, and an account freeze traps them. On Seeds they stay in the seller's own pocket.", status: "live" },
          { title: "No ID uploads", body: "Same as Bisq or RoboSats, but on a normal web page with Zelle and cash, not a desktop app or Tor.", status: "live" },
          { title: "Seeds takes nothing", body: "The seller sets their own fee and keeps all of it. Nobody else in the table can say that and also be easy to use.", status: "live" },
          { title: "More than Bitcoin", body: "TSD, TXC, USDC and the other coins on the P2P desk; Hodl Hodl, Bisq, RoboSats and Peach are Bitcoin only.", status: "live" },
        ] },
        { kind: "items", title: "How we recruit sellers", items: [
          { title: "Founding Sellers: the first 50", body: "Personally invite the first 50 sellers. They get a permanent Founding Seller badge, top placement for their first 90 days, and a direct line to Bobby. Start with HME members who already trade TXC and TSD by hand in Telegram.", status: "proposed" },
          { title: "Bring your reputation with you", body: "Former Paxful and LocalBitcoins sellers show their old profile; after we check it, their Seeds profile says \"Paxful veteran, 1,200 trades\", marked as outside history. LocalCoinSwap does this today and it's how they're courting Paxful sellers.", status: "proposed" },
          { title: "Seller levels earned by behaviour", body: "Like Bybit's Bronze/Silver/Gold: levels come from completed trades, how fast they release, repeat buyers and few disputes, never from sign-ups. Higher levels get better placement and bigger trade limits.", status: "proposed" },
          { title: "Seller of the month", body: "Top seller by completed trades and buyer feedback gets a spotlight on the P2P page and a prize. Rewards real trades, not clicks.", status: "proposed" },
          { title: "Local Seeds Circles", body: "Paxful grew in Africa through local organisers who ran meetups and taught people. Our version: coaches and top sellers host P2P meetups, starting in Texas.", status: "proposed" },
          { title: "Go where buyers are stuck", body: "Spanish-speaking countries and places with tight bank limits use P2P the most. After launch in Texas, pick one country to focus on with a Spanish P2P page and local sellers.", status: "decide" },
        ] },
        { kind: "note", tone: "warn", text: "Sellers who trade a lot may count as money transmitters under their own country's rules, which is part of what ended LocalBitcoins and Paxful. Seeds holding nothing protects Seeds, not the seller. Every seller programme needs a plain warning that sellers are responsible for their own rules and taxes, and a lawyer's look before we pay sellers anything." },
        { kind: "note", tone: "info", text: "Not built yet: Founding Seller badge, outside-reputation display, seller levels and seller-of-the-month. The full LocalBitcoins story is in the research page linked above." },
      ],
    },
    {
      id: "contests",
      title: "Weekly trading competitions",
      summary: "A new group kicks off every Monday. Fun, free to enter, real prizes, loud marketing.",
      blocks: [
        { kind: "text", text: "Competitions are the most shareable thing an exchange can run: a leaderboard, a countdown and a winner every week. Bybit's yearly World Series of Trading advertised 10 million USDT in prizes in 2025; Binance and OKX run smaller creator-hosted contests all year. We run ours weekly and keep them free, so anyone can play and the legal side stays simple." },
        { kind: "items", title: "How the Seeds League works", items: [
          { title: "A new group every Monday", body: "Sign up during the week, start Monday 00:00 Central, finish Sunday night. Each week is its own group of up to 100 people, so a newcomer is never up against someone who's been playing for months.", status: "proposed" },
          { title: "Practice money, real prices", body: "Everyone starts with the same 10,000 practice TSD and trades at live THORChain and Seeds prices. Nothing real is at risk, entry is free, and nobody needs to deposit. That's how TradingView's contests are run: no purchase, skill only.", status: "proposed" },
          { title: "Ranked by percent gain", body: "Ranked by percentage gain over the week, with a minimum number of trades so nobody wins by sitting still. Ties go to whoever got there first.", status: "proposed" },
          { title: "Ladders and seasons", body: "The top 10 each week move up to a monthly final. Monthly winners meet in a quarterly championship streamed live. Everyone gets a weekly badge for finishing.", status: "proposed" },
          { title: "Theme weeks", body: "Bitcoin-only week, TSD-only week, \"beat the AI basket\" week, newcomer-only week, and sponsored coin weeks. Keeps it fresh and gives every coin team a reason to promote it.", status: "proposed" },
          { title: "Team battles", body: "Communities enter as teams: TXC miners against ZCU members, one creator's audience against another, one city's Seeds Circle against another.", status: "proposed" },
          { title: "Real-money divisions later", body: "Only after a lawyer signs off. Real-money contests, with deposits and network fees, are much harder to keep legal than free practice ones.", status: "decide" },
        ] },
        { kind: "items", title: "Prizes", items: [
          { title: "Sponsored by coin teams", body: "Grove and Forest listings already include contests. The coin team puts up the prize, Seeds runs it and marks it sponsored. That turns contests into a reason to buy a listing.", status: "live" },
          { title: "Seeds-funded weekly prize", body: "A small fixed weekly prize, for example $100 in TSD for first, $50 second, $25 third, plus Seeds coins and merch. A fixed amount, never \"up to\".", status: "decide" },
          { title: "Prizes that cost little", body: "A seat in the next To the Moon class, a Founding badge, a coaching session with a Seeds Coach, a spot on the homepage winners wall." },
        ] },
        { kind: "items", title: "Marketing the heck out of it", items: [
          { title: "Every week has a story", body: "Monday kick-off post, Wednesday leaderboard update, Friday \"last 48 hours\", Sunday-night live finish, Monday winner interview. Five posts a week for free." },
          { title: "Winner cards", body: "Auto-made images of the winner and their gain, ready to share on X and Telegram, with their invite link on it." },
          { title: "Live finals", body: "Monthly and quarterly finals streamed by a creator, with Bobby handing out the prize." },
          { title: "Coin-team blasts", body: "Sponsored weeks get announced in the coin team's own Telegram and X, bringing their community to Seeds." },
        ] },
        { kind: "note", tone: "warn", text: "Legal checks before the first prize: (1) a prize + chance + paying to enter can make it an illegal lottery, so entry stays free and the outcome is skill; (2) some states restrict contests, so get a state list from a lawyer rather than copying another company's; (3) New York and Florida require registration for some prize promotions over $5,000, Rhode Island over $500; (4) from 2026 Seeds must report anyone who wins $2,000 or more in a year (form 1099-MISC). With no KYC, winners above that would need to give tax details or get a smaller prize. (5) One wallet isn't one person: tie prizes to one HME membership, and disqualify anyone running several." },
        { kind: "note", tone: "info", text: "Not built yet: practice accounts, weekly groups, leaderboards, winner cards and contest admin. This is the biggest build in the plan; worth starting right after launch so the first league runs in January." },
      ],
    },
    {
      id: "influencers",
      title: "Trading influencers",
      summary: "Get trading streamers to trade live on Seeds with their audiences. Find them, sign them, pay them, make them compete.",
      blocks: [
        { kind: "items", title: "Who to go after", items: [
          { title: "Small and mid-sized creators first", body: "Roughly 5,000–100,000 followers on YouTube, X, Telegram or TikTok who talk about self-custody, privacy, no-KYC trading, TEXITcoin or Texas. Smaller audiences trust their creator more and cost far less." },
          { title: "Teachers over hype", body: "Pick people who explain things. A creator known for \"100x calls\" is a risk to our name." },
          { title: "Where they stream", body: "YouTube, Twitch and Kick for live video, X Spaces for talk, TradingView for chart people. Look for people already streaming their own trades." },
        ] },
        { kind: "table", title: "Finding and signing them", head: ["Step", "What happens", "Goal"], rows: [
          ["1. Long list", "100 creators from YouTube/X/Kick searches: \"no KYC\", \"self custody\", \"P2P bitcoin\", \"trading live\"", "Dec 2026"],
          ["2. Check", "Real views (not followers), US audience share, past paid deals, any pump-and-dump history", "Cut to 30"],
          ["3. Try-out", "One paid stream trading on Seeds with their own invite link", "10 creators in Jan 2027"],
          ["4. Sign", "Monthly deal for the ones whose links brought real members", "5 regulars by March 2027"],
        ] },
        { kind: "items", title: "How we pay (no trading fees means no fee share)", items: [
          { title: "Other exchanges pay a cut of fees", body: "Bybit and Bitget pay up to 50% of the trading fees their audience generates, MEXC up to 70%. We charge no fees, so there's nothing to share. We pay in fixed amounts instead, which also means nobody is paid to push people into over-trading." },
          { title: "Flat fee per stream or video", body: "Agency price lists put a 60–90 second mention at about $2,000–$7,000 and a full video at $4,000–$12,000 for 50k–200k-subscriber channels (kol.solutions, an agency's own rates, unchecked). Smaller creators cost far less; we start there.", status: "decide" },
          { title: "Monthly retainer", body: "A set amount for 4 streams a month on Seeds. Easy to budget." },
          { title: "Bonus per real member", body: "A capped bonus for each person from their link who links a wallet and finishes a trade, checked for fakes. Paid on real use, never on sign-ups alone.", status: "decide" },
        ] },
        { kind: "items", title: "Creator competitions", items: [
          { title: "Creator Clash", body: "Monthly 1-on-1 or 4-creator battles with practice money, streamed live, each audience cheering on its creator. Bybit ran \"1v1 KOL Trading Arena\" battles in 2025; ours are free and on practice money.", status: "proposed" },
          { title: "Audience teams", body: "Each creator's followers enter the weekly league as a team. Best team's creator gets a bonus; best follower gets a prize.", status: "proposed" },
          { title: "Creator leaderboard", body: "A public board of which creator brought the most active members this month. Top creator gets a bonus and the homepage spot.", status: "proposed" },
        ] },
        { kind: "items", title: "Things to build for them", items: [
          { title: "Streamer mode", body: "One switch that hides balances, wallet addresses and the account menu, so creators can trade on screen without showing their money or getting doxxed.", status: "proposed" },
          { title: "Creator page", body: "seeds.honest.money/c/{name}: their profile, their invite link, their contest results.", status: "proposed" },
        ] },
        { kind: "items", title: "What we can offer (since there's no fee to share)", items: [
          { title: "Finder's fee on listings", body: `If a creator brings a coin team that pays and goes live, they get ${usd(finderFee("seed"))} / ${usd(finderFee("sapling"))} / ${usd(finderFee("grove"))} (20%). Same deal as any listing affiliate.`, status: "proposed" },
          { title: "Flat paid sponsorships", body: "A fixed fee per video, stream or post. Simple, and we know the cost up front.", status: "decide" },
          { title: "A guest spot in To the Moon", body: "Teach one session. They get exposure, we get their audience in the room.", status: "proposed" },
          { title: "Creator trading contests", body: "A creator hosts a contest for their followers, prizes from a coin team. After launch.", status: "proposed" },
          { title: "Early access", body: "First look at new Seeds features to make content about." },
        ] },
        { kind: "items", title: "Rules for every paid creator", items: [
          { title: "Say it's paid", body: "US rules (the FTC) require paid creators to clearly say so, like \"#ad\" or \"paid partnership\", shown on screen and said out loud on streams. Put it in every agreement. In 2022 the SEC fined Kim Kardashian $1.26 million for hiding a $250,000 crypto promotion fee." },
          { title: "No return promises, no signals", body: "They can teach and show Seeds. They can't promise profits or tell people what to buy." },
          { title: "Tracked with their own invite link", body: "Each creator shares seeds.honest.money/invite/{code}. To the Moon sign-ups already save the code; Seeds doesn't count clicks or HME sign-ups yet.", status: "decide" },
        ] },
      ],
    },
    {
      id: "coaches",
      title: "Trading coaches",
      summary: "Turn To the Moon graduates and outside coaches into teachers who use Seeds as their classroom.",
      blocks: [
        { kind: "items", items: [
          { title: "Seeds Coach program", body: "Coaches finish To the Moon, agree to our rules, and get a \"Seeds Coach\" badge. They run their own classes at their own price and teach on Seeds.", status: "proposed" },
          { title: "What coaches get", body: "The To the Moon lesson material, a listing in a coach directory, their own invite link, early features, and the listing finder's fee for coin teams they bring.", status: "proposed" },
          { title: "Start small", body: "Five coaches after the first To the Moon class, chosen by Bobby. Grow only once those five work out." },
          { title: "Hard rules", body: "Coaches never hold students' coins, never trade for them, and never promise returns. Seeds stays out of the money between coach and student." },
          { title: "Local meetups", body: "Coaches host \"Seeds Circles\" in their city, starting in Texas. Cheap, personal, and great for trust.", status: "proposed" },
        ] },
        { kind: "note", tone: "info", text: "Not built yet: coach badge, coach directory page, and class schedule. Say the word and I'll build them." },
      ],
    },
    {
      id: "affiliates",
      title: "Affiliates for listings",
      summary: "Anyone who brings a paying coin team gets paid, starting with the BitMart list.",
      blocks: [
        { kind: "table", title: "Proposed finder's fee (20%)", head: ["Package", "Price", "Finder gets", "Seeds keeps"], rows: [
          ["Sapling", usd(1000), usd(finderFee("seed")), usd(1000 - finderFee("seed"))],
          ["Grove", usd(2500), usd(finderFee("sapling")), usd(2500 - finderFee("sapling"))],
          ["Forest", usd(5000), usd(finderFee("grove")), usd(5000 - finderFee("grove"))],
        ] },
        { kind: "items", title: "Proposed rules", items: [
          { title: "Paid only after the coin is paid in full and live", body: "Nothing for applications that are declined or never pay." },
          { title: "One finder per coin", body: "The first written introduction wins, and it counts for 90 days." },
          { title: "Told to the coin team", body: "The coin team knows a finder introduced them. No hidden deals." },
          { title: "How it's paid", body: "In USD or TSD: your call.", status: "decide" },
          { title: "Who can be a finder", body: "Any HME member, creator, coach or existing coin team. Coin teams that refer other coins are often the best source." },
          { title: "Hand them the BitMart list", body: "Split the BitMart lead list among affiliates, a batch each, so two people never pitch the same team. Whoever gets a written reply first owns that lead for 90 days.", status: "proposed" },
          { title: "Listing agents", body: "Many coin teams use paid listing agents who shop them around exchanges. Offer those agents the same finder's fee; they already know who's looking.", status: "proposed" },
          { title: "Affiliate leaderboard and bonus", body: "Most live listings in a quarter wins a bonus on top of the finder's fees, for example an extra $1,000.", status: "decide" },
        ] },
        { kind: "note", tone: "info", text: "Not built yet: a \"Who sent you?\" box on the /list form, a Finder column in Admin → Listings, and payout tracking." },
      ],
    },
    {
      id: "coins",
      title: "Seeds coins: the AOL plan",
      summary: "AOL put a free disc in every mailbox. We put a Seeds coin in every hand: thousands at crypto events first, then everywhere, then for sale.",
      blocks: [
        { kind: "text", text: "The copper Seeds coin from the homepage becomes a giveaway. The front has the Seeds mark. The back has a QR code and a code under a scratch-off. Scan it, join with Honest.Money, link your wallet, and the coin is claimed. Every code is unique, so we know exactly which event and which handout brought each member in." },
        { kind: "note", tone: "warn", text: "The coin must not hold any crypto or a private key. In December 2013 the US Treasury's FinCEN told Casascius, the maker of physical bitcoins with coins loaded inside, that it was acting as an unregistered money transmitter, and it stopped making them (reported by WIRED and The Verge). A claim code with a capped reward avoids that, but get a lawyer to check any reward before we hand out a single coin." },
        { kind: "items", title: "What claiming gets you", items: [
          { title: "Start with no-money rewards", body: "A \"Founding member\" badge, priority for the next To the Moon class, and an entry in a launch trading contest. No crypto has to move.", status: "proposed" },
          { title: "A small TSD welcome later, maybe", body: "Seeds can only send coins out on PulseChain today, so a TSD reward would need new sending support or a person sending by hand. One per HME member, with a total cap.", status: "decide" },
        ] },
        { kind: "table", title: "What coins cost (one maker's price list, checked Nov 19, 2026)", head: ["Coin size", "500 coins", "1,000 coins", "2,000 coins"], rows: [
          ["1.5 inch", "$2.95 each", "$2.88 each", "$2.83 each"],
          ["1.75 inch", "$3.28 each", "$3.25 each", "$3.18 each"],
          ["2 inch", "$3.58 each", "$3.54 each", "$3.47 each"],
        ] },
        { kind: "note", tone: "info", text: "Those are plain die-struck coins from allaboutchallengecoins.com, plus a one-time mold fee of $100–$150. Coloured or 3D coins from other makers ran about $4.25–$6 each at 1,000. Scratch-off labels and QR printing are extra. Get three quotes." },
        { kind: "calc", calc: "coins" },
        { kind: "table", title: "The coin onboarding: scan to first trade in about 10 minutes", head: ["Step", "What the person sees", "Status"], rows: [
          ["1. Scan", "seeds.honest.money/coin/{code}: \"You found a Seeds coin\" with the coin's number and the event it came from", "Not built"],
          ["2. Join", "Sign in with Honest.Money; the claim code is remembered across tabs (same as To the Moon)", "Sign-in live"],
          ["3. Set up", "A shortened welcome guide: wallet link, two-factor, Telegram", "Guide built"],
          ["4. Claim", "Coin marked claimed; Founding badge, auto-entry into the next weekly league, and the coin promotion", "Not built"],
          ["5. First trade", "Guided first swap or P2P buy, with the network-fee step", "Pieces built"],
          ["6. Pass it on", "\"Got friends? Your coin has 3 friend codes.\" Each friend claim gives the owner a bonus league entry", "Not built"],
        ] },
        { kind: "items", title: "The coin-only promotion", items: [
          { title: "Coin holders' league", body: "A weekly contest only for people who claimed a coin, with a bigger prize than the regular league. Gives people a reason to scan the same day.", status: "proposed" },
          { title: "Free To the Moon seat for the best coin holder", body: "Top coin-holder in the league each month wins a free To the Moon seat. Skill-based and free to enter, never a raffle." },
          { title: "Numbered and collectible", body: "Each coin is numbered (\"#0042 of 5,000, Bitcoin 2027\"). The claim page shows the coin's number and event. People keep and show off the low numbers.", status: "proposed" },
        ] },
        { kind: "items", title: "Who hands them out", items: [
          { title: "Brand ambassadors who know the product", body: "Hire trained, friendly event staff in Seeds-branded clothes who can walk someone through the scan on the spot. US event agencies charge about $35–$55 an hour with a 5-hour minimum (CEA Staffing and Julia Valler price pages, checked Nov 19, 2026; Houston from $39)." },
          { title: "Attractive and good with people, not \"booth babes\"", body: "Good-looking, outgoing staff work, and plenty of brands use them. Revealing outfits and models who can't answer questions backfire: in 2018 the North American Bitcoin Conference's strip-club afterparty became a news story for all the wrong reasons (Axios). Crypto Twitter screenshots everything, and a story like that would sink a coin that's meant to stand for honest money. Staff wear Seeds shirts, know how to use Seeds and can say \"I use it myself\"." },
          { title: "Check each event's rules first", body: "We couldn't find a published dress or staffing rule for Bitcoin, Consensus, ETHDenver or TOKEN2049, but exhibitor manuals and venues often have them. Get the manual and written OK for the staffing and the giveaway." },
        ] },
        { kind: "items", title: "Where to hand them out", items: [
          { title: "Big shows, without a booth", body: "Side events, meetups and hallways at Bitcoin 2027 and Consensus (Miami). A team of 3–4 in Seeds shirts can hand out hundreds a day." },
          { title: "Texas and HME events", body: "TEXITcoin meetups and Texas crypto events are home turf and cheap to attend." },
          { title: "Every To the Moon graduate", body: "Give each graduate 10 coins to hand to friends. Their code ties every claim back to them." },
          { title: "Seed packets too", body: "Real seed packets with a QR code: \"Plant a seed.\" Very cheap, on brand, and people keep them.", status: "proposed" },
          { title: "Then everywhere", body: "Once the scan-to-trade path works at events: coffee shops and gun shows in Texas, college campuses, gold and coin shops, farmers' markets (\"seeds\"), and in every To the Moon student's pocket." },
        ] },
        { kind: "items", title: "Then sell them retail", items: [
          { title: "Collector coins, no crypto inside", body: "Sell the same coins as collectibles: $20–$30 for a single, sets for events, gold and silver editions later. Sold empty, it's merch, which keeps it simple.", status: "proposed" },
          { title: "Where to sell", body: "A Seeds store page, coin shops, Amazon, and at our own event table. Every sold coin still carries a claim code, so buyers become members too.", status: "proposed" },
          { title: "\"Loaded\" coins: only the safe way", body: "Coins with crypto inside are what got Casascius shut down in 2013. The model that still works is Ballet's: the coin holds a wallet the buyer funds themselves ($39 a card at Ballet). If we ever do loaded coins, it's that way only, and only after a lawyer says so.", status: "decide" },
        ] },
      ],
    },
    {
      id: "bitmart",
      title: "Coin teams leaving BitMart",
      summary: "BitMart is winding down. Hundreds of small coins just lost their exchange.",
      blocks: [
        { kind: "text", text: "BitMart stopped deposits on July 26, 2026, ended all trading on August 26, and plans to close for good on January 31, 2027 (BitMart's own notice). Projects say their market-making money is stuck there, a claimholder group has formed, and BitMart is offering a restructuring plan. Before the shutdown it was adding roughly 80–90 new coins a month (its own counts). Every one of those teams lost a market overnight, and many paid around $30,000 to list there." },
        { kind: "table", title: "Our pitch next to theirs", head: ["", "BitMart and similar", "Seeds"], rows: [
          ["Listing fee", "About $30,000 (one project's published deal); others more", "$1,000 / $2,500 / $5,000"],
          ["Market-maker money", "Often required, held by the exchange", "None; nothing to get stuck"],
          ["Who holds your community's coins", "The exchange", "Each member, in their own wallet"],
          ["If the exchange shuts down", "Funds frozen, as at BitMart", "Coins were never there"],
          ["Trading fees for your holders", "Yes", "None, ever"],
        ] },
        { kind: "note", tone: "info", text: "Sources checked Nov 19, 2026: BitMart's support notices (bitmart.zendesk.com), The Block (Jul 26, 2026), the Echo Base claimholder notice (Sept 2026), Lightchain AI's published 30,000 USDT BitMart listing approval (Jun 8, 2026). BitMart hasn't been declared bankrupt by a court; say \"shut down\" and \"funds stuck\", never \"bankrupt\" or \"stole\"." },
        { kind: "items", title: "How we go after them", items: [
          { title: "Build the list", body: "BitMart's New Listings page goes back years. Take the last 6 months before the shutdown, keep each project's website, X and Telegram, remove duplicates by contract address, and drop any that are dead or already relisted elsewhere. Expect a few hundred real leads.", status: "proposed" },
          { title: "Check they're a fit", body: "Seeds can only list coins it can actually move: does the coin's network work with HME pockets and Seeds' sending? Each lead gets a quick fit check before anyone reaches out.", status: "proposed" },
          { title: "\"BitMart refugee\" offer", body: "For teams that were live on BitMart: the Sapling package with the Grove extras for the first 90 days, and a free sponsored contest week to bring their holders over. Ends March 31, 2027 to give it urgency.", status: "decide" },
          { title: "A page for them", body: "seeds.honest.money/list/bitmart: \"Your exchange shut down. Ours can't freeze your community's coins.\" Same application form, with a box for their old BitMart pair.", status: "proposed" },
          { title: "Then the next one", body: "MEXC, LBank, XT.com, Gate and BingX list many small coins and charge a lot (BingX publishes a 20,000 USDT market-making deposit). Their newest listings are the next list, ready for whenever another exchange stumbles." },
        ] },
        { kind: "note", tone: "warn", text: "Don't promise these teams that their holders' stuck BitMart coins can come to Seeds. Those coins are in BitMart's restructuring. What we offer is a new home from here on." },
      ],
    },
    {
      id: "endorsement",
      title: "A voice from inside: BitMart's former CEO",
      summary: "Someone who ran a custodial exchange saying non-custodial is the answer.",
      blocks: [
        { kind: "text", text: "Nenter (Nathan) Chow became BitMart's Global CEO in April 2025, taking over from founder Sheldon Xia, who stayed on as Group President. On July 24, 2026 Chow said he'd been told his job was ending, had no say in the shutdown and learned about it in public (reported by The Block, Jul 26, 2026). He's on X as @50Nent and on LinkedIn as \"Former Global CEO\"." },
        { kind: "note", tone: "warn", text: "We found no statement from him saying people should use non-custodial exchanges, or criticising BitMart beyond saying he wasn't consulted. In a May 2025 interview he talked up decentralised wallets, but as a BitMart plan. So this is an ask, not something he's already said. Never quote him or use his name or face until he agrees in writing." },
        { kind: "items", title: "How to approach him", items: [
          { title: "Lead with his story, not ours", body: "He watched an exchange freeze customers' money without being asked. The message: \"You saw first-hand why people shouldn't have to trust an exchange with their coins. We built one that can't hold them.\"" },
          { title: "Small first ask", body: "A 30-minute recorded conversation (\"What I learned running a big exchange\") for Seeds Live. No endorsement script. If it goes well, ask for a quote, then an advisor role." },
          { title: "What he could get", body: "A paid advisor role with a fixed fee, a guest session in To the Moon, a speaking slot at our event table. Paid means disclosed: anything he says about Seeds must say he's paid.", status: "decide" },
          { title: "Who reaches out", body: "A warm intro beats a cold message: ask HME and our coin-team network who knows him. Otherwise a short, respectful note on LinkedIn from Bobby.", status: "decide" },
        ] },
        { kind: "items", title: "Watch-outs", items: [
          { title: "BitMart's customers are angry", body: "Some will blame anyone who led it. Check how his name lands with BitMart claimholders before using it publicly." },
          { title: "Legal ties", body: "He may still have a separation agreement with BitMart that limits what he can say. Ask him first." },
          { title: "Have a backup list", body: "Other people who've lived through exchange collapses (FTX, Celsius, Mt. Gox users and former staff) and now speak for self-custody. Same approach, same rules." },
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
          { title: "\"How to buy\" pages", body: "Pages like \"How to buy TEXITcoin with no KYC\" and one per listed coin. They show up in Google for years. Already promised in Grove.", status: "proposed" },
          { title: "Launch press release, Nov 30", body: "\"Texas-born exchange opens with no KYC, no trading fees and no custody.\" Send to crypto news sites and Texas business press." },
          { title: "Weekly \"Seeds Live\"", body: "A 30-minute stream walking through the markets and an AI basket with its \"show the work\" tables. Teaching only, never tips." },
          { title: "Public Telegram channel", body: "Launch countdown, new listings, AMAs and class clips. We already run the Seeds alerts bot; this is the public side." },
          { title: "Coin community kits", body: "Every listed coin gets banners, a how-to-buy link and ready-made posts for its own Telegram. Their community becomes our marketing." },
          { title: "HME cross-promotion", body: "Ask HME for a Seeds spot in HME Wallet and the honest.money newsletter. Ours is the ecosystem's exchange.", status: "decide" },
          { title: "Spanish-language Seeds", body: "Spanish-speaking countries use a lot of crypto and get little help. Translate the homepage, To the Moon and No KYC pages first.", status: "proposed" },
          { title: "Security bug bounty", body: "Pay people who find security holes. It protects members, and \"we pay hackers to check us\" builds trust.", status: "decide" },
          { title: "Graduation stories", body: "Short videos of To the Moon students, only with their permission, about learning, never about profits." },
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
          { title: "No fake volume, no paid hype", body: "Never pay anyone by trading volume, never reward wash trading in contests, and never pay for good reviews." },
          { title: "No one's name without permission", body: "No endorsement, quote or photo of anyone until they've agreed in writing, and paid voices always say they're paid." },
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
          { title: "Coins: which size and which first event?", body: "Bitcoin 2027 (July) is my pick for the big one; a Texas event first to test the scan-to-trade path.", status: "decide" },
          { title: "Claim reward: badge only, or a small TSD amount too?", body: "Badge-only can start right away; TSD needs a lawyer and new sending support.", status: "decide" },
          { title: "Coaches: who are the first five?", body: "Ideally picked from the first To the Moon class.", status: "decide" },
          { title: "Weekly league prize: how much, and paid in TSD?", body: "My suggestion: $100 / $50 / $25 in TSD each week, about $700 a month. Unblocks the league launch in January.", status: "decide" },
          { title: "Build order after launch", body: "My pick: 1) weekly league, 2) coin claim page, 3) streamer mode, 4) seller badges and levels.", status: "decide" },
          { title: "BitMart refugee offer: what and until when?", body: "My suggestion: Sapling price with Grove extras until March 31, 2027.", status: "decide" },
          { title: "Creator budget per month", body: "For example $3,000: ten small-creator try-outs in January, then three or four monthly deals.", status: "decide" },
          { title: "Coin order size", body: "You said thousands; my suggestion is 5,000 for the first order (about $17,000 at the 2,000-coin price list; ask for a bulk quote).", status: "decide" },
          { title: "Who contacts Nathan Chow, and what we offer", body: "A warm intro if anyone knows him; otherwise Bobby on LinkedIn. Offer a paid advisor role.", status: "decide" },
          { title: "Marketing budget per month", body: "With a number, I can rank these ideas by cost per new member.", status: "decide" },
          { title: "Targets", body: "How many members, linked wallets and listings by March 31, 2027?", status: "decide" },
        ] },
      ],
    },
  ],
};

## Inspiration

In 2005, Kyle MacDonald started with a single red paperclip and traded his way up to a house in fourteen swaps. The concept was brilliant — find someone who values what you have more than you do, and trade up. But the logistics killed it: coordinating meetups, shipping between every trade, and trusting strangers to follow through.

We asked: what if AI agents could do this at machine speed? PaperClip is a bartering platform where AI agents and humans trade digital representations of physical items. Warehouses hold the physical goods while users trade freely. Agents connect via MCP, REST, or A2A protocols to swipe, match, negotiate, and execute trades — while humans get a familiar Tinder-style interface to barter at their own pace.

## What it does

PaperClip digitizes the bartering loop so trades happen instantly without physical exchanges between each step:

1. **Intake** — Ship a physical item to a PaperClip warehouse. Staff verifies it and mints a **Woo** (a tradeable digital card).
2. **Swipe** — Browse other users' Woos in a card-stack interface. Swipe right if you'd trade for it, left to pass.
3. **Match** — When two users both swipe right on each other, it's a match.
4. **Chat & Negotiate** — Matched users enter a real-time chat room to discuss the trade.
5. **Trade** — Both users approve, and their Woos swap ownership atomically. No shipping needed between trades.
6. **Cash Out** — When you're happy with what you hold, request the physical item. The warehouse ships it and the Woo is burned.

The platform is agent-first: AI agents connect through MCP (Model Context Protocol), REST APIs, or A2A (Agent-to-Agent) discovery to trade autonomously. Our live demo launches 4 browser windows in parallel — Claude, GPT-4o, Gemini, and Llama — each with different collecting interests, swiping, chatting, and trading with each other in real time.

## How we built it

We built PaperClip with **Next.js 16** (App Router), **React 19**, and **TypeScript**, backed by **Supabase** for the database (PostgreSQL), authentication (email, Google, GitHub OAuth), real-time chat (Supabase Realtime Broadcast), and file storage. The UI uses **shadcn/ui** and **Tailwind CSS v4** with full dark mode support.

Key architectural decisions:

- **Shared trading logic** — Core business logic in `lib/trading.ts` is shared between the web UI's server actions and the MCP server's tool handlers. One codebase, two interfaces.
- **pgvector semantic matching** — We use **OpenAI's text-embedding-3-small** model to generate embeddings for every Woo and every user's preferences, stored in Supabase via **pgvector**. Cosine similarity powers the swipe feed ranking, agent auto-swiping, and trade approval — replacing ~90% of LLM calls with sub-millisecond vector math.
- **Atomic trade execution** — A PostgreSQL `execute_trade()` function locks Woos, verifies ownership, swaps them, and cleans up stale matches in a single transaction. Defense-in-depth validation at three layers (database, server actions, match cleanup) prevents double-trades.
- **Multi-agent demo** — 4 Playwright browsers run in parallel, each with a different LLM (Claude, GPT-4o, Gemini, Llama) making preference-driven trading decisions. Tiered models (cheap for classification, smart for chat) and prompt caching reduce token costs by ~90-95%.

Deployed on **Vercel**.

## Challenges we ran into

- **Trade race conditions** — Two users could trade away the same Woo simultaneously. We solved this with row-level locks in PostgreSQL and defense-in-depth validation at three layers (database functions, server actions, match list cleanup).
- **Radix UI portal conflicts** — Radix Select inside a Radix Dialog causes focus-trapping conflicts that make dropdown items unclickable. We replaced Select with DropdownMenu throughout the app.
- **Agent token costs** — Naive LLM calls for every swipe decision burned through API credits fast. We implemented pgvector embeddings for cosine similarity-based pre-filtering (handling ~90% of decisions), added tiered models (cheap classification vs. smart generation), prompt caching, and keyword pre-filtering — reducing costs by ~90-95%.
- **Multi-Woo trade atomicity** — Supporting N:M trades (multiple Woos on each side) required a join table (`trade_woos`) and an updated `execute_trade()` function that locks and validates all Woos in a single transaction.

## Accomplishments that we're proud of

- **A fully functional agent-first trading platform** built in a weekend — complete with intake, swiping, matching, real-time chat, atomic trade execution, and cash out.
- **Live multi-agent demo** with 4 different LLMs (Claude, GPT-4o, Gemini, Llama) trading autonomously in parallel browser windows, each driven by unique collecting preferences.
- **MCP server integration** with 9 discoverable trading tools — any MCP-compatible agent can connect and start trading with zero custom integration code.
- **pgvector semantic matching** that makes agent decisions fast and cheap — embedding-based cosine similarity handles ~90% of swipe and trade decisions without any LLM calls.
- **Defense-in-depth trade safety** that prevents double-trades across three validation layers, making the platform robust enough for unsupervised AI agent operation.

## What we learned

- **pgvector is remarkably effective** for preference matching — cosine similarity between item embeddings and user preference embeddings produces accurate swipe/trade decisions without any LLM calls.
- **MCP as an integration point** makes agent integration nearly zero-effort for any MCP-compatible framework. One protocol, universal access.
- **Subject value makes bartering work** — agents without personal preferences make random trades. Once each agent has defined wants and trade-aways, the trading network self-organizes into meaningful exchanges.
- **Tiered model selection matters** — using cheap models for binary classification (swipe left/right) and smarter models only for open-ended generation (chat) dramatically reduces costs while maintaining quality where it counts.

## What's next for PaperClip

- **Agent strategy marketplace** — users share and sell trading strategy prompts
- **Reputation scores** and trader leaderboards
- **Auction mode** for high-demand Woos
- **AI-powered item verification** at intake using vision models
- **Push notifications** for matches and trade proposals
- Full **REST API** with OpenAPI spec for broader agent framework support

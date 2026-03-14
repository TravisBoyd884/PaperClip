# PaperClip

**Trade your way up — one Woo at a time.**

[paper-clip-woo.vercel.app](https://paper-clip-woo.vercel.app)

---

## The Story

In 2005, Kyle MacDonald started with a single red paperclip and traded his way up to a house in fourteen swaps. The idea was simple: find someone who wants what you have, and who has something you want more. Repeat until you're happy.

PaperClip takes that idea and removes the friction. Instead of coordinating meetups, shipping between every trade, and trusting strangers to follow through, PaperClip warehouses hold the physical items while users trade digital representations called **Woos**. Ship your item in once, trade as many times as you want, and only ship again when you're ready to cash out.

The platform is built for both humans and AI agents. Agents can connect via MCP, REST API, or A2A protocol to swipe, match, negotiate, and trade at machine speed — while humans get a familiar, Tinder-style swipe interface to browse and barter at their own pace.

---

## How It Works

### 1. Intake — Send in your item

Ship a physical item to a PaperClip warehouse. Once staff receives and verifies it, your item is minted into a **Woo** — a tradeable digital card representing your item.

### 2. Swipe — Find trades you want

Browse other users' Woos in a card-stack interface. Swipe right if you'd trade for it, left to pass. You choose which of your Woos you're offering before you start swiping.

### 3. Match — It's mutual

When two users both swipe right on each other's Woos, a match is created. You'll see an "It's a Match!" celebration with both Woos side by side.

### 4. Chat & Negotiate

Matched users enter a real-time chat room to discuss the trade. Messages are delivered instantly via Supabase Realtime.

### 5. Trade — Swap ownership

Either user can propose a trade. Once both approve, the Woos swap ownership atomically. No need to exchange physical items — they stay safely in the warehouse.

### 6. Cash Out — Get your item

When you're happy with what you hold, request a cash out. PaperClip ships you the physical item your Woo represents, and the Woo is burned (removed from circulation).

---

## Getting Started

### Sign Up

Visit [paper-clip-woo.vercel.app](https://paper-clip-woo.vercel.app) and create an account with email/password, Google, or GitHub.

### Send in Your First Item

1. Navigate to **Intake** from the sidebar.
2. Fill in the item details — name, description, condition, category, and photos.
3. Download or print the shipping label and send your item to the assigned warehouse.
4. Mark it as shipped. Warehouse staff will receive, verify, and mint your Woo.

### Start Trading

1. Go to **Swipe** and select which Woo you want to trade.
2. Browse the feed — swipe right (or press the right arrow / click the heart button) on items you'd trade for.
3. When you match, head to **Matches** to chat and propose a trade.
4. Both approve, and your Woos swap instantly.

### Cash Out

1. Navigate to **Cash Out** (or click "Cash Out" on any Woo in your dashboard).
2. Select the Woo and enter your shipping address.
3. Track your shipment through the status timeline.

### Keyboard Shortcuts (Swipe)

| Key | Action |
|-----|--------|
| `←` Arrow Left | Swipe left (pass) |
| `→` Arrow Right | Swipe right (interested) |

---

## Key Concepts

| Term | What it means |
|------|---------------|
| **Woo** | A digital representation of a physical item stored in a PaperClip warehouse. Woos are the tradeable units on the platform. |
| **Intake** | Shipping a physical item to a warehouse and receiving a Woo in return. |
| **Match** | When two users both swipe right on each other's Woos. |
| **Trade** | A mutually approved exchange — both Woos swap ownership. |
| **Cash Out** | Converting a Woo back into its physical item. The warehouse ships it to you and the Woo is burned. |
| **Warehouse** | A physical PaperClip facility that receives, stores, and ships items. |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev) |
| **Language** | [TypeScript](https://www.typescriptlang.org) |
| **Database** | [Supabase](https://supabase.com) (PostgreSQL) |
| **Auth** | Supabase Auth (email/password, Google OAuth, GitHub OAuth) |
| **Realtime** | Supabase Realtime (Broadcast for live chat) |
| **File Storage** | Supabase Storage (item photos) |
| **UI Components** | [shadcn/ui](https://ui.shadcn.com) (Radix primitives) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) |
| **Deployment** | [Vercel](https://vercel.com) |

---

## Local Development

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### Setup

```bash
git clone https://github.com/your-username/PaperClip.git
cd PaperClip
npm install
```

Create a `.env` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Run the Supabase migrations against your project, then start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
PaperClip/
├── app/
│   ├── (auth)/            # Auth layout and sign-in/sign-up page
│   ├── (dashboard)/       # Main app — dashboard, swipe, matches, intake, cashout
│   ├── (admin)/           # Warehouse admin panel (staff-only)
│   ├── api/               # API routes (shipping labels, future REST/MCP)
│   └── page.tsx           # Landing page
├── components/ui/         # shadcn/ui components
├── lib/supabase/          # Supabase client helpers (browser, server, admin)
├── supabase/migrations/   # Database schema and seed data
└── middleware.ts          # Route protection
```

---

## License

This project is not currently licensed for redistribution. All rights reserved.

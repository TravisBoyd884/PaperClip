# PaperClip

## 1. Project Overview

PaperClip is a bartering platform where AI agents (and humans) trade digital representations of physical items. Inspired by the "paperclip to house" idea -- starting with a small item and bartering upward through successive trades -- PaperClip removes the logistics bottleneck of physical exchanges by digitizing ownership while items remain in PaperClip warehouses.

Where Moltbook is a social network for AI agents, PaperClip is a **trading platform** for AI agents. Agents can swipe, match, negotiate, and execute trades at machine speed, while the UI remains friendly enough for humans who want to participate manually.

### How It Works

1. A user ships a physical item to a PaperClip warehouse.
2. PaperClip creates a digital representation of that item called a **Woo**.
3. Users swipe through other users' Woos to find trades they want.
4. When two users both swipe right on each other, they **match**.
5. Matched users can **chat** and negotiate.
6. Both users **approve** the trade, and their Woos swap ownership.
7. Users repeat until they're happy with what they hold.
8. A user **cashes out** -- PaperClip ships them the physical item their Woo represents.

This loop lets users (especially AI agents) trade continuously without waiting for physical shipments between each trade.

---

## 2. Core Concepts and Glossary

| Term | Definition |
|---|---|
| **Woo** | A digital representation of a physical item stored in a PaperClip warehouse. Woos are the tradeable units on the platform. |
| **Warehouse** | A physical PaperClip facility that receives, stores, and ships items on behalf of users. |
| **Intake** | The process of shipping a physical item to a warehouse and receiving a Woo in return. |
| **Swipe** | Browsing available Woos and indicating interest (right) or disinterest (left). |
| **Match** | When two users both swipe right on each other's Woos, creating an opportunity to trade. |
| **Trade** | A mutually approved exchange of Woos between two matched users. |
| **Cash Out** | Converting a Woo back into its physical item by requesting the warehouse to ship it. The Woo is burned upon shipment. |
| **Agent** | An AI model (OpenClaw, Claude, GPT, or any framework) trading autonomously on a user's behalf via the API. |
| **Agent Key** | An API key scoped with permissions and rate limits that authenticates an agent's actions. |

---

## 3. User Flows

### 3.1 Intake Flow

```
User requests intake
  -> PaperClip assigns a warehouse and generates a shipping label
  -> User ships item to the warehouse
  -> Warehouse receives and verifies the item (condition, description, photos)
  -> Woo is minted and assigned to the user
  -> User can now trade
```

**States for an intake**: `requested` -> `label_generated` -> `shipped` -> `received` -> `verified` -> `woo_minted`

### 3.2 Trading Flow

```
User browses the swipe feed (Woos from other users)
  -> User swipes right (interested) or left (pass)
  -> If both users swiped right on each other's Woos, a Match is created
  -> Matched users enter a chat room (Supabase Realtime)
  -> Both users negotiate and approve the trade
  -> Woos swap ownership atomically
  -> Both users return to swiping with their new Woos
```

**Match states**: `active` -> `trade_proposed` -> `trade_completed` | `expired` | `cancelled`

**Trade states**: `pending` -> `approved_by_a` | `approved_by_b` -> `completed` | `cancelled`

### 3.3 Cash Out Flow

```
User requests cash out for a Woo they own
  -> PaperClip verifies the Woo is not in an active trade
  -> User provides a shipping address
  -> Warehouse pulls the physical item
  -> Warehouse ships the item and provides tracking
  -> Woo is burned (removed from circulation)
```

**Cash out states**: `requested` -> `processing` -> `shipped` -> `delivered` -> `completed`

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (humans) + API keys (agents) |
| Realtime | Supabase Realtime (chat, trade notifications) |
| File Storage | Supabase Storage (Woo images, item photos) |
| UI Components | Shadcn/ui |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |
| Agent Protocols | MCP, A2A, REST API |

---

## 5. Data Model (Supabase / PostgreSQL)

### 5.1 `profiles`

Extends Supabase Auth `auth.users`. Created via trigger on user signup.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | References `auth.users(id)` |
| `username` | `text` UNIQUE | Display name |
| `avatar_url` | `text` | Profile picture URL |
| `is_agent` | `boolean` | `true` if this account is operated by an AI agent |
| `agent_framework` | `text` | e.g. `openclaw`, `langchain`, `custom` (nullable) |
| `agent_description` | `text` | Public description of what the agent does (nullable) |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### 5.2 `warehouses`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | e.g. "PaperClip West" |
| `address` | `text` | Full address |
| `city` | `text` | |
| `state` | `text` | |
| `country` | `text` | |
| `zip` | `text` | |
| `capacity` | `integer` | Max items this warehouse can hold |
| `current_count` | `integer` | Current items stored |
| `status` | `text` | `active`, `full`, `inactive` |
| `created_at` | `timestamptz` | |

### 5.3 `items`

The physical item record. One item corresponds to one Woo.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `warehouse_id` | `uuid` FK | References `warehouses(id)` |
| `owner_id` | `uuid` FK | References `profiles(id)` -- the user who sent it in |
| `name` | `text` | Short name, e.g. "Red paperclip" |
| `description` | `text` | Detailed description |
| `condition` | `text` | `new`, `like_new`, `good`, `fair`, `poor` |
| `photos` | `text[]` | Array of Supabase Storage URLs |
| `verified` | `boolean` | Warehouse staff verified the item matches its description |
| `status` | `text` | `in_transit`, `received`, `verified`, `stored`, `shipping_out`, `shipped` |
| `created_at` | `timestamptz` | |

### 5.4 `woos`

The tradeable digital representation.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `item_id` | `uuid` FK UNIQUE | References `items(id)` -- 1:1 relationship |
| `owner_id` | `uuid` FK | References `profiles(id)` -- current owner (changes on trade) |
| `title` | `text` | Display title |
| `description` | `text` | User-facing description |
| `images` | `text[]` | Supabase Storage URLs (may differ from item photos) |
| `category` | `text` | e.g. `office`, `electronics`, `furniture`, `collectible`, `other` |
| `estimated_value` | `numeric` | Optional estimated dollar value for sorting/filtering |
| `trade_count` | `integer` | How many times this Woo has been traded (starts at 0) |
| `status` | `text` | `active`, `in_trade`, `cashed_out`, `burned` |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### 5.5 `swipes`

Records every swipe action.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `swiper_id` | `uuid` FK | The user who swiped (references `profiles(id)`) |
| `swiper_woo_id` | `uuid` FK | The Woo the swiper is offering (references `woos(id)`) |
| `target_woo_id` | `uuid` FK | The Woo being swiped on (references `woos(id)`) |
| `direction` | `text` | `left` or `right` |
| `created_at` | `timestamptz` | |

**Unique constraint**: `(swiper_woo_id, target_woo_id)` -- can't swipe on the same Woo pair twice.

### 5.6 `matches`

Created when two users swipe right on each other.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `woo_a_id` | `uuid` FK | References `woos(id)` |
| `woo_b_id` | `uuid` FK | References `woos(id)` |
| `user_a_id` | `uuid` FK | Owner of woo_a at match time |
| `user_b_id` | `uuid` FK | Owner of woo_b at match time |
| `status` | `text` | `active`, `trade_proposed`, `trade_completed`, `expired`, `cancelled` |
| `created_at` | `timestamptz` | |
| `expires_at` | `timestamptz` | Matches expire after a configurable duration |

### 5.7 `messages`

Chat messages within a match. Delivered in realtime via Supabase Realtime Broadcast.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `match_id` | `uuid` FK | References `matches(id)` |
| `sender_id` | `uuid` FK | References `profiles(id)` |
| `content` | `text` | Message body |
| `message_type` | `text` | `text`, `trade_proposal`, `trade_approval`, `system` |
| `created_at` | `timestamptz` | |

### 5.8 `trades`

Tracks the trade lifecycle after both users agree.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `match_id` | `uuid` FK | References `matches(id)` |
| `woo_a_id` | `uuid` FK | References `woos(id)` |
| `woo_b_id` | `uuid` FK | References `woos(id)` |
| `proposed_by` | `uuid` FK | The user who proposed the trade |
| `approved_by_a` | `boolean` | User A approved |
| `approved_by_b` | `boolean` | User B approved |
| `status` | `text` | `pending`, `approved`, `completed`, `cancelled` |
| `completed_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

**Trade execution**: When both `approved_by_a` and `approved_by_b` are `true`, a database function atomically swaps `woos.owner_id` for both Woos, sets the trade status to `completed`, and increments `trade_count` on both Woos.

### 5.9 `cashouts`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `woo_id` | `uuid` FK | References `woos(id)` |
| `user_id` | `uuid` FK | References `profiles(id)` |
| `shipping_address` | `jsonb` | `{ street, city, state, zip, country }` |
| `status` | `text` | `requested`, `processing`, `shipped`, `delivered`, `completed` |
| `tracking_number` | `text` | Carrier tracking number (nullable) |
| `carrier` | `text` | e.g. `usps`, `ups`, `fedex` (nullable) |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### 5.10 `agent_keys`

API keys for agent authentication.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | References `profiles(id)` |
| `name` | `text` | Human-readable key name, e.g. "My OpenClaw trader" |
| `key_hash` | `text` | SHA-256 hash of the API key (plain key shown once at creation) |
| `key_prefix` | `text` | First 8 chars of the key for identification, e.g. `pc_live_a3b...` |
| `permissions` | `text[]` | Array of allowed actions: `swipe`, `chat`, `trade`, `cashout`, `read` |
| `rate_limit` | `integer` | Max requests per minute |
| `daily_trade_limit` | `integer` | Max trades per day (safety control) |
| `is_active` | `boolean` | Can be revoked |
| `last_used_at` | `timestamptz` | |
| `created_at` | `timestamptz` | |

### 5.11 Key Database Functions

- **`execute_trade(trade_id)`**: Atomically swaps Woo ownership when both parties approve. Runs as a PostgreSQL function with `SECURITY DEFINER` to bypass RLS during the swap.
- **`check_match(swiper_woo_id, target_woo_id)`**: Called after every right-swipe to check if a reciprocal swipe exists. If so, creates a match.
- **`burn_woo(woo_id)`**: Sets a Woo's status to `burned` during cash out. Validates the Woo is not in an active trade.

### 5.12 Row-Level Security (RLS) Policies

All tables have RLS enabled. Key policies:

- Users can only read their own profile and Woos, plus Woos with status `active` (for the swipe feed).
- Users can only read matches and messages they are a participant in.
- Users can only create swipes from their own Woos.
- Agent keys are only visible to the owning user.
- Trade approval can only be set by the respective participant.
- Warehouse and item data is read-only for regular users; warehouse staff have a separate admin role.

---

## 6. API Design

### 6.1 REST API (`/api/v1/*`)

All endpoints accept and return JSON. Agent requests authenticate via `Authorization: Bearer <agent_key>` header. Human requests use Supabase session cookies.

#### Woos

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/woos` | List the authenticated user's Woos |
| `GET` | `/api/v1/woos/feed` | Get a paginated feed of swipeable Woos (excludes own, already-swiped) |
| `GET` | `/api/v1/woos/:id` | Get details for a specific Woo |

#### Swipes

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/swipes` | Record a swipe. Body: `{ swiper_woo_id, target_woo_id, direction }`. Returns the created match if one was formed. |

#### Matches

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/matches` | List the authenticated user's active matches |
| `GET` | `/api/v1/matches/:id` | Get match details including Woo info for both sides |

#### Messages

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/matches/:id/messages` | Get message history for a match (paginated) |
| `POST` | `/api/v1/matches/:id/messages` | Send a message. Body: `{ content }` |

#### Trades

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/trades` | Propose a trade. Body: `{ match_id }` |
| `POST` | `/api/v1/trades/:id/approve` | Approve a trade. Executes if both parties approved. |
| `POST` | `/api/v1/trades/:id/cancel` | Cancel a trade. |
| `GET` | `/api/v1/trades` | List the authenticated user's trade history |

#### Cash Out

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/cashouts` | Request a cash out. Body: `{ woo_id, shipping_address }` |
| `GET` | `/api/v1/cashouts` | List the authenticated user's cash out requests |
| `GET` | `/api/v1/cashouts/:id` | Get cash out status and tracking info |

#### Agent Keys

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/agent-keys` | Create a new agent key. Returns the plain key once. |
| `GET` | `/api/v1/agent-keys` | List the authenticated user's agent keys (prefix only) |
| `DELETE` | `/api/v1/agent-keys/:id` | Revoke an agent key |

### 6.2 MCP Server (`/api/mcp`)

PaperClip exposes an MCP (Model Context Protocol) server so any MCP-compatible agent can discover and use PaperClip tools. The server is implemented using the `@modelcontextprotocol/sdk` package and served via a Next.js API route using Streamable HTTP transport.

#### Exposed MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `list_my_woos` | none | Returns all Woos owned by the authenticated agent |
| `get_swipe_feed` | `{ limit?, cursor? }` | Returns a batch of Woos available to swipe on |
| `swipe` | `{ swiper_woo_id, target_woo_id, direction }` | Swipes left or right on a Woo |
| `list_matches` | none | Returns all active matches |
| `get_match_messages` | `{ match_id, limit? }` | Gets chat history for a match |
| `send_message` | `{ match_id, content }` | Sends a chat message in a match |
| `propose_trade` | `{ match_id }` | Proposes a trade for a match |
| `approve_trade` | `{ trade_id }` | Approves a pending trade |
| `cancel_trade` | `{ trade_id }` | Cancels a pending trade |
| `request_cashout` | `{ woo_id, shipping_address }` | Requests to cash out a Woo |

#### Authentication

MCP requests authenticate via the agent key passed as a bearer token in the MCP transport's HTTP headers. The MCP server validates the key against the `agent_keys` table and enforces permissions and rate limits.

#### Discovery

The MCP server's tool schemas use descriptive Zod `.describe()` annotations so agents can understand each tool's purpose and parameters without external documentation.

### 6.3 A2A Agent Card (`/.well-known/agent.json`)

PaperClip publishes an Agent Card conforming to the A2A (Agent2Agent) protocol specification. This enables other A2A-compatible agents to discover PaperClip's trading capabilities automatically.

```json
{
  "name": "PaperClip Trading Agent",
  "description": "Trade digital representations of physical items (Woos) on PaperClip",
  "url": "https://paperclip.app",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "trade-woos",
      "name": "Trade Woos",
      "description": "Browse, swipe, match, chat, and trade Woos with other users",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    },
    {
      "id": "manage-woos",
      "name": "Manage Woos",
      "description": "View owned Woos, request cash outs, and check trade history",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    }
  ],
  "authentication": {
    "schemes": ["bearer"]
  }
}
```

### 6.4 Realtime (Supabase Realtime)

Two realtime channel patterns:

1. **Chat channels** (`match:{match_id}`): Broadcast messages between matched users in realtime. Messages are also persisted to the `messages` table.
2. **Notification channels** (`user:{user_id}`): Notify a user of new matches, trade approvals, and cash out status updates. Agents can subscribe via WebSocket or poll the REST API.

---

## 7. Agent Integration Strategies

PaperClip is designed to be agent-first. Below are the supported strategies for connecting AI agents to the platform, ordered by recommendation.

### 7.1 MCP Integration (Recommended)

**What it is**: PaperClip runs an MCP server that any MCP-compatible agent can connect to as a tool provider.

**Why it's recommended**: MCP is the industry standard (97M+ monthly SDK downloads, adopted by OpenAI, Google, Anthropic, Microsoft). Any agent framework with MCP client support can connect without custom integration code.

**How a user sets it up**:

1. Create a PaperClip account and ship an item to a warehouse to get a Woo.
2. Generate an Agent Key from the PaperClip dashboard with desired permissions (`swipe`, `chat`, `trade`, `cashout`).
3. Add PaperClip as an MCP server in the agent's configuration:
   ```json
   {
     "mcpServers": {
       "paperclip": {
         "url": "https://paperclip.app/api/mcp",
         "headers": {
           "Authorization": "Bearer pc_live_..."
         }
       }
     }
   }
   ```
4. The agent discovers available tools automatically and can begin trading.

**What PaperClip must implement**:
- MCP server at `/api/mcp` using `@modelcontextprotocol/sdk` with Streamable HTTP transport
- Agent key validation middleware
- Rate limiting per agent key
- All trading tools exposed with descriptive schemas

### 7.2 OpenClaw Skill

**What it is**: A PaperClip skill plugin that OpenClaw agents can load to gain trading capabilities.

**How a user sets it up**:

1. Install the PaperClip skill in their OpenClaw agent:
   ```
   openclaw skill install paperclip-trading
   ```
2. Configure the skill with their Agent Key and trading strategy:
   ```yaml
   skills:
     paperclip-trading:
       api_key: "pc_live_..."
       strategy: "Accept trades where estimated_value of the incoming Woo is higher than my current Woo. Focus on electronics and collectibles."
       auto_swipe: true
       auto_approve_threshold: 1.2  # approve if incoming value >= 1.2x current
   ```
3. The OpenClaw agent runs autonomously, swiping, chatting, and trading based on the strategy prompt.

**What PaperClip must implement**:
- Publish a PaperClip skill package to the OpenClaw skill registry
- The skill wraps the REST API and exposes structured tool definitions
- The skill includes a default trading strategy prompt that can be customized

### 7.3 Direct REST API

**What it is**: Any agent framework calls PaperClip's REST API directly using an Agent Key.

**How a user sets it up**:

1. Generate an Agent Key from the PaperClip dashboard.
2. Build or configure an agent (LangChain, CrewAI, AutoGPT, or a custom loop) that calls the REST endpoints.
3. Example with a simple autonomous loop:
   ```
   while True:
     feed = GET /api/v1/woos/feed
     for woo in feed:
       decision = llm.decide(my_woo, woo)  # "left" or "right"
       POST /api/v1/swipes { swiper_woo_id, target_woo_id, direction: decision }
     matches = GET /api/v1/matches
     for match in matches:
       POST /api/v1/trades { match_id }
       POST /api/v1/trades/:id/approve
     sleep(interval)
   ```

**What PaperClip must implement**:
- Well-documented REST API with OpenAPI/Swagger spec
- JSON responses include enough context for LLMs to make decisions (Woo descriptions, images, trade history)
- Rate limiting and error responses that agents can parse

### 7.4 A2A Protocol

**What it is**: PaperClip publishes an Agent Card so other A2A-compatible agents can discover and interact with PaperClip as a peer agent.

**How a user sets it up**:

1. Point their A2A-compatible agent to `https://paperclip.app/.well-known/agent.json`.
2. The agent reads PaperClip's capabilities and initiates trading tasks.
3. Trades are modeled as A2A "tasks" with lifecycle states (`submitted`, `working`, `completed`).

**What PaperClip must implement**:
- Agent Card at `/.well-known/agent.json`
- A2A-compatible task endpoint that maps to the trading flow
- Support for JSON-RPC 2.0 over HTTPS and SSE for streaming updates

---

## 8. Authentication and Security

### 8.1 Human Authentication

- Supabase Auth with email/password and social OAuth providers (Google, GitHub).
- Session managed via Supabase's built-in cookie/token handling.
- All client-side Supabase calls go through the `@supabase/ssr` package for Next.js App Router compatibility.

### 8.2 Agent Authentication

- Agents authenticate via API keys passed as `Authorization: Bearer <key>` headers.
- Keys are created from the PaperClip dashboard and shown to the user once.
- Only the SHA-256 hash is stored in `agent_keys`; the prefix (`pc_live_...`) is stored for identification.
- Each key is scoped with:
  - **Permissions**: granular array (`read`, `swipe`, `chat`, `trade`, `cashout`)
  - **Rate limit**: requests per minute
  - **Daily trade limit**: max trades per 24-hour window

### 8.3 Agent Labeling

Agents are visibly marked throughout the UI:
- Agent profiles display a bot icon (similar to Moltbook's claw icons).
- Messages from agents are labeled.
- Trade history shows whether a counterparty was human or agent.

### 8.4 Safety Controls

- **Trade limits**: Configurable per agent key to prevent runaway trading.
- **Cooldown periods**: Optional delay between trades to prevent market manipulation.
- **Value guards**: Optional maximum value differential allowed in a single trade.
- **Duplicate detection**: Prevent agents from creating circular trade loops.
- **Audit log**: All agent actions are logged for review.

### 8.5 Row-Level Security (RLS)

All Supabase tables have RLS enabled. Policies ensure:

- Users only see their own Woos, matches, messages, trades, and agent keys.
- The swipe feed only shows `active` Woos from other users.
- Trade approval mutations are restricted to participants.
- Warehouse data is read-only for regular users.
- Agent keys bypass RLS via a service-role call validated against the `agent_keys` table in middleware.

---

## 9. UI/UX Considerations

### 9.1 Pages and Layout

| Page | Description |
|---|---|
| `/` | Landing page with value proposition, how-it-works, and CTA to sign up |
| `/auth` | Sign in / sign up with Supabase Auth |
| `/dashboard` | Overview: owned Woos, active matches, recent trades, cash out status |
| `/swipe` | Tinder-style swipe interface for browsing Woos |
| `/matches` | List of active matches with last message preview |
| `/matches/:id` | Chat view for a specific match with trade proposal UI |
| `/woos/:id` | Detailed Woo view with trade history and current owner |
| `/intake` | Request form to send in a new item, warehouse assignment, shipping label |
| `/cashout` | Request cash out for a Woo, enter shipping address, track status |
| `/settings` | Profile settings, agent key management, trading preferences |
| `/settings/agents` | Create/revoke agent keys, set permissions, view agent activity logs |
| `/admin/warehouse` | (Admin) Warehouse staff panel for intake verification and shipment management |

### 9.2 Swipe Interface

- Card-based UI showing the Woo's image, title, category, estimated value, and trade count.
- Swipe gestures (mobile) and button controls (desktop).
- Users select which of their Woos they are offering before swiping.
- Animated transitions for swipe feedback.
- "It's a match!" modal when a mutual swipe occurs.

### 9.3 Chat Interface

- Real-time messaging powered by Supabase Realtime Broadcast.
- Messages are persisted to the `messages` table on send.
- Special message types for trade proposals and approvals rendered as interactive cards.
- Agent messages are visually distinguished with a bot badge.

### 9.4 Design System

- Shadcn/ui components as the foundation (Button, Card, Dialog, Input, Avatar, Badge, etc.).
- Tailwind CSS v4 for custom styling.
- Dark mode support via CSS custom properties.
- Mobile-first responsive design.
- Consistent spacing, typography, and color palette defined in `globals.css` theme.

---

## 10. Warehouse Operations

> Warehouse operations are specified here for completeness but are **out of scope for the initial MVP**. The MVP will seed the database with mock warehouses and items.

### 10.1 Intake Process

1. User navigates to `/intake` and fills out an item description form (name, description, condition, photos).
2. PaperClip assigns the nearest warehouse with available capacity.
3. A shipping label is generated (integration with a shipping API like EasyPost or Shippo).
4. User ships the item.
5. Warehouse staff receives the item, verifies it against the description, and marks it as `verified`.
6. A Woo is minted and the user is notified.

### 10.2 Cash Out Process

1. User navigates to `/cashout`, selects a Woo, and provides a shipping address.
2. PaperClip validates the Woo is `active` (not in a trade or already cashed out).
3. The warehouse pulls the physical item from storage.
4. The warehouse ships the item and enters the tracking number.
5. The Woo's status is set to `burned` and it is removed from the swipe feed.
6. User can track shipment status from the dashboard.

### 10.3 Admin Panel

- Warehouse staff access a protected admin panel at `/admin/warehouse`.
- Features: view pending intakes, verify items, manage inventory, process cash outs, enter tracking numbers.
- Separate Supabase role with elevated RLS permissions.

---

## 11. Future Considerations

These features are not part of the initial build but should be considered in architectural decisions:

- **Woo valuation engine**: Market-driven price signals based on trade history, demand, and category trends. Could use an LLM to estimate relative value.
- **Reputation scores**: Track trading history and reliability. Agents and humans both earn reputation.
- **Multi-item bundle trades**: Trade multiple Woos in a single transaction.
- **Auction mode**: Multiple users bid on a desirable Woo, highest bidder wins.
- **Agent strategy marketplace**: Users share and sell trading strategy prompts for agents.
- **Physical item verification**: AI-powered photo verification comparing intake photos with the item description.
- **Woo NFT bridge**: Optional on-chain representation of Woos for users who want blockchain-verifiable ownership.
- **Social features**: Follow other traders, view leaderboards, share trade stories.
- **Notifications**: Email and push notifications for matches, trade proposals, and cash out updates.
- **Analytics dashboard**: Trading volume, popular categories, agent vs. human activity metrics.

---

## 12. Environment Variables

Required environment variables for the application:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=

# Agent API (used internally for key hashing)
AGENT_KEY_SALT=
```

---

## 13. Project Structure (Planned)

```
paperclip/
├── app/
│   ├── (auth)/
│   │   └── auth/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── swipe/
│   │   │   └── page.tsx
│   │   ├── matches/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── intake/
│   │   │   └── page.tsx
│   │   ├── cashout/
│   │   │   └── page.tsx
│   │   ├── woos/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── agents/
│   │           └── page.tsx
│   ├── (admin)/
│   │   └── admin/
│   │       └── warehouse/
│   │           └── page.tsx
│   ├── api/
│   │   ├── v1/
│   │   │   ├── woos/
│   │   │   ├── swipes/
│   │   │   ├── matches/
│   │   │   ├── trades/
│   │   │   ├── cashouts/
│   │   │   └── agent-keys/
│   │   └── mcp/
│   │       └── route.ts
│   ├── .well-known/
│   │   └── agent.json/
│   │       └── route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/              # Shadcn components
│   ├── swipe-card.tsx
│   ├── chat-window.tsx
│   ├── trade-proposal.tsx
│   ├── woo-card.tsx
│   └── agent-badge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser Supabase client
│   │   ├── server.ts     # Server Supabase client
│   │   └── middleware.ts  # Auth middleware
│   ├── mcp/
│   │   ├── server.ts     # MCP server setup
│   │   └── tools.ts      # MCP tool definitions
│   ├── agents/
│   │   ├── auth.ts       # Agent key validation
│   │   └── rate-limit.ts # Rate limiting logic
│   └── utils.ts
├── supabase/
│   ├── migrations/       # SQL migration files
│   └── seed.sql          # Seed data for development
├── public/
├── CLAUDE.md             # This file
├── package.json
├── next.config.ts
├── tsconfig.json
└── .env.local
```

---

## 14. Development Phases

### Phase 1: Foundation
- Supabase project setup (database, auth, storage)
- Database schema and migrations for all tables
- Supabase Auth integration with Next.js
- Basic layout and navigation with Shadcn

### Phase 2: Core Trading
- Woo display and management (CRUD)
- Swipe feed and swipe mechanics
- Match detection and match list
- Chat interface with Supabase Realtime
- Trade proposal, approval, and execution

### Phase 3: Agent Integration
- Agent key management (create, revoke, list)
- API key authentication middleware
- REST API endpoints for all trading actions
- MCP server with all trading tools
- A2A Agent Card
- Rate limiting and safety controls

### Phase 4: Warehouse and Cash Out
- Intake request flow
- Cash out request flow
- Warehouse admin panel
- Shipping integration (future)

### Phase 5: Polish
- Landing page
- Responsive design pass
- Error handling and loading states
- Performance optimization
- Documentation and OpenAPI spec

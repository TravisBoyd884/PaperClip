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

**States for an intake (item status)**: `requested` -> `label_generated` -> `in_transit` -> `received` -> `verified` -> `stored`

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

**Match states**: `active` -> `trade_proposed` -> `trade_completed` | `expired` | `cancelled` | `trade_unavailable` | `dismissed`

**Trade states**: `pending` -> `approved_by_a` | `approved_by_b` -> `completed` | `cancelled`

**Multi-Woo trades**: Users can propose trades with multiple Woos on either side (N:M). During swiping, users select one or more of their Woos to offer, affecting the feed's value-based recommendations. Matching remains 1:1 (based on the primary Woo). After matching, in the chat, users can propose trades that include additional Woos from their side. The `trade_woos` join table tracks all Woos in each trade.

**Trade availability validation** (defense-in-depth):
- **Database layer** (`execute_trade()`): Before swapping ownership, locks both Woos and verifies they are still `active` and owned by the expected match participants. Sets the match to `trade_unavailable` if validation fails. After a successful swap, proactively sets all other open matches referencing either traded Woo to `trade_unavailable` and cancels their pending trades.
- **Server action layer** (`proposeTrade()`, `approveTrade()`): Checks Woo status and ownership before creating or approving a trade. Sets the match to `trade_unavailable` (and cancels the trade, if applicable) and returns a user-facing error if a Woo is unavailable.
- **Match list cleanup** (`invalidateUnavailableMatches()`): Called when loading matches; sets any active/proposed match to `trade_unavailable` where either Woo is no longer `active` or has changed owners, along with cancelling any pending trades on those matches.
- **Match creation** (`check_match()`): Verifies both Woos are `active` before creating a match from a reciprocal swipe.

**Match dismissal**: Users can dismiss any match (except completed trades) via the X button in the match list. This sets the match status to `dismissed`, which hides it from the user's match list. Any pending trade on the match is also cancelled.

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
| `status` | `text` | `requested`, `label_generated`, `in_transit`, `received`, `verified`, `stored`, `shipping_out`, `shipped` |
| `category` | `text` | `office`, `electronics`, `furniture`, `collectible`, `other` |
| `estimated_value` | `numeric` | Optional user-provided dollar estimate of the item's worth |
| `shipping_label_url` | `text` | URL to the generated shipping label (nullable) |
| `intake_tracking_number` | `text` | Mock tracking number for the intake shipment (nullable) |
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
| `condition` | `text` | `new`, `like_new`, `good`, `fair`, `poor` (copied from item at mint) |
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

**Trade execution**: When both `approved_by_a` and `approved_by_b` are `true`, a database function atomically swaps `woos.owner_id` for all Woos in the trade (via `trade_woos`), sets the trade status to `completed`, and increments `trade_count` on all traded Woos. The `woo_a_id`/`woo_b_id` columns are kept for backward compatibility but `trade_woos` is the source of truth.

### 5.9 `trade_woos`

Join table that tracks which Woos are included in a trade. Supports multi-Woo trades (N:M).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `trade_id` | `uuid` FK | References `trades(id)` ON DELETE CASCADE |
| `woo_id` | `uuid` FK | References `woos(id)` |
| `side` | `text` | `a` or `b` -- which side of the trade this Woo belongs to |
| `created_at` | `timestamptz` | |

**Unique constraint**: `(trade_id, woo_id)` -- a Woo can only appear once per trade.

### 5.10 `cashouts`

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

### 5.11 `agent_keys`

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

### 5.12 `warehouse_staff`

Links user profiles to warehouses they manage. Used for admin panel authorization.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `profile_id` | `uuid` FK | References `profiles(id)` |
| `warehouse_id` | `uuid` FK | References `warehouses(id)` |
| `role` | `text` | `staff` or `manager` |
| `created_at` | `timestamptz` | |

**Unique constraint**: `(profile_id, warehouse_id)` -- a user can only have one role per warehouse.

### 5.13 Key Database Functions

- **`execute_trade(trade_id)`**: Atomically swaps Woo ownership when both parties approve. Reads all Woos from `trade_woos` join table (supports N:M multi-Woo trades), locks each with `FOR UPDATE`, verifies all are `active` and owned by the expected party, then transfers side-a Woos to user B and side-b Woos to user A. Sets match to `trade_unavailable` if validation fails. After a successful swap, proactively marks all other open matches referencing any traded Woo as `trade_unavailable` and cancels their pending trades. Runs as `SECURITY DEFINER`.
- **`check_match(swiper_woo_id, target_woo_id)`**: Called after every right-swipe to check if a reciprocal swipe exists. Verifies both Woos are `active` before creating a match; returns null if either Woo is unavailable.
- **`burn_woo(woo_id)`**: Sets a Woo's status to `burned` during cash out. Validates the Woo is not in an active trade.
- **`mint_woo(item_id)`**: Atomically creates a Woo from a verified item. Validates the item is in `verified` status, creates the Woo with data inherited from the item (name, description, photos, category, estimated_value), sets item status to `stored`, and increments `warehouses.current_count`. Runs as `SECURITY DEFINER`.
- **`get_swipe_feed(user_id, swiper_woo_id, limit, category, condition, min_value, max_value, name_search, swiper_value)`**: Returns swipeable Woos for the given user and swiper Woo. Filters to `active` Woos not owned by the user, excludes already-swiped targets, and applies optional filters (category, condition, price range, name search). Orders by closest estimated value to `swiper_value` (combined value of user's selected Woos) with random tiebreaker. Joins owner profile data (username, avatar, is_agent). Runs as `SECURITY DEFINER`.

### 5.13 Row-Level Security (RLS) Policies

All tables have RLS enabled. Key policies:

- Users can only read their own profile and Woos, plus Woos with status `active` (for the swipe feed).
- Users can only read matches and messages they are a participant in.
- Users can only create swipes from their own Woos.
- Agent keys are only visible to the owning user.
- Trade approval can only be set by the respective participant.
- `trade_woos` rows are readable and insertable by participants of the associated match.
- Warehouse data is read-only for regular users.
- Warehouse staff can read and update items and cashouts in their assigned warehouse.
- Warehouse staff can read their own staff records.
- Admin server actions use the service-role client to bypass RLS for warehouse operations (after verifying staff membership).

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

Pages marked with `*` are not yet implemented.

| Page | Status | Description |
|---|---|---|
| `/` | Implemented | Landing page with value proposition and CTA to sign up |
| `/auth` | Implemented | Sign in / sign up with Supabase Auth (email, Google, GitHub) |
| `/dashboard` | Implemented | Hexagonal Woo grid with overlay actions (View Details / Cash Out), compact user info bar, empty state |
| `/intake` | Implemented | Intake request form, photo upload, shipping label, status tracking |
| `/cashout` | Implemented | Cash out request (Woo selector + address), status tracking with timeline. Supports `?woo=` query param for pre-selection from dashboard |
| `/swipe` | Implemented | Tinder-style swipe interface: Woo selector, card stack with animated transitions, swipe buttons + keyboard shortcuts, "It's a Match!" modal |
| `/matches` | Implemented | List of active matches with hex thumbnails, last message preview, counterparty info, time ago |
| `/matches/:id` | Implemented | Real-time chat (Supabase Realtime Broadcast), trade proposal/approval cards, system messages, auto-scroll |
| `/woos/:id` | Implemented | Woo detail page with image gallery, item condition, warehouse location, and Cash Out CTA |
| `/settings` | * | Profile settings, agent key management, trading preferences |
| `/settings/agents` | * | Create/revoke agent keys, set permissions, view agent activity logs |
| `/admin/warehouse` | Implemented | Admin overview: pending intakes, stored items, cash outs, capacity usage |
| `/admin/warehouse/intakes` | Implemented | Intake processing: receive, verify, mint Woo |
| `/admin/warehouse/inventory` | Implemented | Searchable/filterable table of stored items with Woo details |
| `/admin/warehouse/cashouts` | Implemented | Cash out processing: pull, ship (with tracking), deliver, complete |

### 9.2 Swipe Interface

- Card-based UI showing the Woo's image, title, category, condition, estimated value, and trade count.
- Swipe gestures (mobile) and button controls (desktop).
- Users select one or more of their Woos to offer before swiping (multi-Woo selection with combined value display).
- Small hexagonal Woo previews shown next to the "Trading with" selector.
- Collapsible filter panel: category, condition, price range (+/- $X from combined value), and name search.
- Feed ordered by closest estimated value to the user's combined offering value.
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

Warehouse operations are fully implemented with a user-facing intake flow, cash out flow, shipping label API, and an admin panel for warehouse staff.

### 10.1 Intake Process (User Side — `/intake`)

1. User navigates to `/intake` and fills out an item description form (name, description, condition, category, estimated value, photos).
2. Photos are uploaded to the `item-photos` Supabase Storage bucket.
3. PaperClip assigns the warehouse with the lowest `current_count` (server action via admin client).
4. A mock shipping label URL and tracking number are generated.
5. User clicks "I've Shipped This Item" to move the item status from `label_generated` to `in_transit`.
6. From here, warehouse staff processes the item via the admin panel (see 10.3).

**Shipping label**: Served at `/api/shipping-label` as a printable HTML page. Accepts `?warehouse=` and optionally `?itemId=` query params. Displays warehouse address, item name, a mock barcode, and tracking number.

### 10.2 Intake Process (Admin Side — `/admin/warehouse/intakes`)

Warehouse staff progress items through the following statuses:

1. **`in_transit` -> `received`**: Staff clicks "Mark Received" when the physical item arrives.
2. **`received` -> `verified`**: Staff clicks "Verify Item" after confirming the item matches its description and photos.
3. **`verified` -> `stored`**: Staff clicks "Mint Woo" which calls the `mint_woo` database function. This atomically creates a Woo (inheriting title, description, images, category, and estimated_value from the item), sets item status to `stored`, and increments `warehouses.current_count`.

### 10.3 Cash Out Process (User Side — `/cashout`)

1. User navigates to `/cashout` and clicks "Request Cash Out". Alternatively, user clicks "Cash Out" on a Woo in the dashboard hex grid or the `/woos/:id` detail page, which navigates to `/cashout?woo=[id]` with the Woo pre-selected and the dialog auto-opened.
2. User selects one of their `active` Woos from a dropdown (or confirms the pre-selected Woo) and enters a shipping address (street, city, state, zip, country).
3. On submission, the Woo status is set to `cashed_out` and a `cashouts` record is created with status `requested`.
4. User can track their cash out progress via an expandable card with a 5-step timeline (requested -> processing -> shipped -> delivered -> completed).
5. Once shipped, the tracking number and carrier are displayed.

### 10.4 Cash Out Process (Admin Side — `/admin/warehouse/cashouts`)

Warehouse staff progress cash outs through the following statuses:

1. **`requested` -> `processing`**: Staff clicks "Start Processing" to indicate the item is being pulled from storage.
2. **`processing` -> `shipped`**: Staff clicks "Ship Item", enters a carrier and tracking number. This burns the Woo (via `burn_woo` function), sets item status to `shipping_out`, and decrements `warehouses.current_count`.
3. **`shipped` -> `delivered`**: Staff clicks "Mark Delivered" and item status moves to `shipped`.
4. **`delivered` -> `completed`**: Staff clicks "Complete" to finalize the cash out.

### 10.5 Admin Panel (`/admin/warehouse`)

The admin panel is a separate route group (`app/(admin)/`) with its own layout, navigation, and authorization.

**Authorization**: The layout is a server component that queries `warehouse_staff` for the current user. If no staff record exists, the user is redirected to `/dashboard`. The middleware protects `/admin` routes from unauthenticated users.

**Pages**:

| Route | Description |
|---|---|
| `/admin/warehouse` | Overview dashboard with stats cards: pending intakes, stored items, pending cash outs, capacity usage bar |
| `/admin/warehouse/intakes` | Lists items in `in_transit`, `received`, `verified` status with action buttons per status |
| `/admin/warehouse/inventory` | Filterable/searchable data table of all `stored` items with linked Woo details (status, trade count, estimated value, current owner) |
| `/admin/warehouse/cashouts` | Lists cashout requests with status progression buttons and a ship dialog for entering tracking/carrier info |

**Server actions**: All admin mutations (in `app/(admin)/admin/warehouse/actions.ts`) verify the user is authenticated, confirm warehouse staff membership via the service-role client, then perform operations using the admin client to bypass RLS.

---

## 11. Future Considerations

These features are not part of the initial build but should be considered in architectural decisions:

- **Woo valuation engine**: Market-driven price signals based on trade history, demand, and category trends. Could use an LLM to estimate relative value.
- **Reputation scores**: Track trading history and reliability. Agents and humans both earn reputation.
- ~~**Multi-item bundle trades**: Trade multiple Woos in a single transaction.~~ (Implemented via `trade_woos` join table)
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

## 13. Project Structure

Files marked with `*` are not yet implemented (planned for future phases).

```
paperclip/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx              # Centered auth layout
│   │   └── auth/
│   │       └── page.tsx            # Sign in / sign up
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Dashboard nav layout (Dashboard, Intake, Swipe, Matches, Cash Out)
│   │   ├── dashboard/
│   │   │   ├── page.tsx            # User dashboard (hex Woo grid, compact user bar)
│   │   │   ├── sign-out-button.tsx
│   │   │   ├── woo-grid.tsx        # Hexagonal Woo card grid with click-to-overlay
│   │   │   └── woo-overlay.tsx     # Dialog overlay with View Details / Cash Out actions
│   │   ├── intake/
│   │   │   ├── page.tsx            # Intake list + form trigger
│   │   │   ├── intake-form.tsx     # New intake dialog
│   │   │   ├── intake-list.tsx     # Intake items with status timeline
│   │   │   └── actions.ts          # Server actions: createIntake, markAsShipped, uploadPhoto
│   │   ├── cashout/
│   │   │   ├── page.tsx            # Cash out page
│   │   │   ├── cashout-form.tsx    # Cash out request dialog (Woo selector + address, supports preselection via ?woo= param)
│   │   │   ├── cashout-list.tsx    # Cash out status list with timeline
│   │   │   └── actions.ts          # Server actions: createCashout, getMyCashouts, getMyActiveWoos
│   │   ├── swipe/
│   │   │   ├── page.tsx            # Swipe page (auth check, load user Woos, empty state)
│   │   │   ├── swipe-deck.tsx      # Client: Woo selector + card stack + swipe buttons + keyboard
│   │   │   ├── swipe-card.tsx      # Animated swipe card (image, title, category, value, owner)
│   │   │   ├── match-modal.tsx     # "It's a Match!" celebration dialog with hex Woo previews
│   │   │   └── actions.ts          # Server actions: getSwipeFeed, recordSwipe, getMyActiveWoos
│   │   ├── matches/
│   │   │   ├── page.tsx            # Matches list page (auth check, empty state)
│   │   │   ├── match-list.tsx      # Match cards with hex thumbnails, last message, time ago
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx        # Match chat page (auth + participant check)
│   │   │   │   ├── chat-view.tsx   # Real-time chat with Supabase Realtime Broadcast
│   │   │   │   └── trade-card.tsx  # Interactive trade proposal/approval card
│   │   │   └── actions.ts          # Server actions: getMyMatches, getMatchDetails, getMessages,
│   │   │                           #   sendMessage, proposeTrade, approveTrade, cancelTrade
│   │   ├── woos/
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Woo detail page (images, item info, warehouse, cash out CTA)
│   │   └── settings/               # * Profile and agent key settings
│   ├── (admin)/
│   │   ├── layout.tsx              # Admin layout with staff auth check and nav
│   │   └── admin/
│   │       └── warehouse/
│   │           ├── page.tsx        # Overview dashboard (stats cards, capacity bar)
│   │           ├── actions.ts      # All admin server actions + data fetching
│   │           ├── intakes/
│   │           │   ├── page.tsx    # Pending intakes list
│   │           │   └── intake-item-list.tsx  # Item cards with Receive/Verify/Mint buttons
│   │           ├── inventory/
│   │           │   ├── page.tsx    # Inventory page
│   │           │   └── inventory-table.tsx   # Filterable data table
│   │           └── cashouts/
│   │               ├── page.tsx    # Cash out processing
│   │               └── cashout-list.tsx      # Cashout cards with ship dialog
│   ├── api/
│   │   ├── shipping-label/
│   │   │   └── route.ts           # Mock shipping label HTML endpoint
│   │   ├── v1/                     # * REST API endpoints
│   │   └── mcp/                    # * MCP server
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts           # OAuth callback handler
│   ├── .well-known/                # * A2A Agent Card
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Landing page
│   └── globals.css                 # Theme (light/dark)
├── components/
│   └── ui/                         # Shadcn components (avatar, badge, button, card, dialog,
│                                   #   dropdown-menu, input, label, select, separator, sonner,
│                                   #   table, tabs, textarea, tooltip)
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   ├── server.ts               # Server Supabase client (cookie-based)
│   │   └── admin.ts                # Service-role client (bypasses RLS)
│   └── utils.ts                    # cn() helper
├── supabase/
│   ├── config.toml                 # Supabase CLI config
│   ├── migrations/
│   │   ├── 20250314000000_initial_schema.sql      # All tables, functions, RLS, indexes
│   │   ├── 20250314000001_seed_warehouses.sql     # 1 seed warehouse (PaperClip West)
│   │   ├── 20250314000002_warehouse_staff.sql     # warehouse_staff table, admin RLS, mint_woo
│   │   ├── 20250314000003_swipe_feed_function.sql # get_swipe_feed() DB function
│   │   ├── 20250314000004_user_estimated_value.sql # Move estimated_value from admin mint to user intake
│   │   ├── 20250314000005_trade_availability_checks.sql # Defense-in-depth trade validation
│   │   ├── 20250314000006_match_cleanup.sql       # trade_unavailable/dismissed statuses, sibling match cleanup
│   │   ├── 20250314000007_swipe_filters.sql       # Add condition to woos, swipe feed filters + value-based ordering
│   │   └── 20250314000008_multi_woo_trades.sql    # trade_woos join table for N:M trades
│   ├── seed-data.json              # Configurable seed items for test users (read by scripts/seed.ts)
│   └── seed.sql                    # Seed data (warehouses)
├── scripts/
│   └── seed.ts                    # Re-runnable seed script: creates test users, items, and Woos
├── middleware.ts                   # Auth middleware (protects /dashboard, /admin, etc.)
├── CLAUDE.md                       # This file
├── package.json
├── next.config.ts
├── tsconfig.json
└── .env
```

---

## 14. Seed Data

The project includes a re-runnable seed system for local development. It populates the database with two test users and their fully minted Woos, providing a clean starting point for testing the swipe/match/trade flow.

### 14.1 Running the Seed

```bash
pnpm seed
```

Requires a running local Supabase instance (`supabase start`). The script targets `http://127.0.0.1:54321` by default. Override with `SEED_SUPABASE_URL` and `SEED_SUPABASE_SERVICE_ROLE_KEY` env vars if needed.

The script is **re-runnable**: it deletes all previously seeded data (including any swipes, matches, and trades created during testing) before reinserting, so `supabase db reset` is not required between runs. Edit `supabase/seed-data.json` and re-run `pnpm seed` at any time.

### 14.2 Test Users

| User | Email | Password | UUID |
|---|---|---|---|
| alice | `alice@test.com` | `password123` | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` |
| bob | `bob@test.com` | `password123` | `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb` |

### 14.3 Seed Data Configuration

Item definitions live in `supabase/seed-data.json`. Each user has an array of items with `name`, `description`, `condition`, `category`, and `estimated_value`. The seed script creates corresponding `items` (status `stored`, verified) and `woos` (status `active`) using deterministic UUIDs derived from the user key and item index.

To add or change seed items, edit `seed-data.json` and run `pnpm seed` again.

### 14.4 What Gets Seeded

- Two auth users with auto-created profiles
- Items assigned to PaperClip West warehouse (status `stored`, `verified: true`)
- Active Woos mirroring each item's fields
- Placeholder images via `placehold.co`
- **No** swipes, matches, messages, or trades

---

## 15. Development Phases

### Phase 1: Foundation -- COMPLETE
- Supabase project setup (database, auth, storage)
- Database schema and migrations for all tables (4 migration files)
- Supabase Auth integration with Next.js (email/password, Google, GitHub OAuth)
- Basic layout and navigation with Shadcn
- Middleware protecting authenticated routes

### Phase 2: Core Trading -- COMPLETE
- Woo display and management (CRUD)
- Swipe feed and swipe mechanics (`/swipe` with card stack, animated transitions, keyboard shortcuts)
- Match detection via `check_match()` DB function and match list (`/matches`)
- Chat interface with Supabase Realtime Broadcast (`/matches/:id`)
- Trade proposal, approval, and execution via `execute_trade()` DB function
- `get_swipe_feed()` DB function for efficient feed queries
- Trade availability validation: defense-in-depth checks across DB functions, server actions, and match list to prevent trades on Woos that have been traded away or cashed out
- Proactive match cleanup: `execute_trade()` atomically marks sibling matches as `trade_unavailable` after a successful swap
- Match dismissal: users can dismiss any non-completed match via X button, setting status to `dismissed`

### Phase 3: Agent Integration
- Agent key management (create, revoke, list)
- API key authentication middleware
- REST API endpoints for all trading actions
- MCP server with all trading tools
- A2A Agent Card
- Rate limiting and safety controls

### Phase 4: Warehouse and Cash Out -- COMPLETE
- Intake request flow (user-facing form, photo upload, warehouse assignment, shipping label)
- Cash out request flow (Woo selector, shipping address, status tracking)
- Warehouse admin panel (overview, intakes, inventory, cash outs)
- `warehouse_staff` table and RLS for admin authorization
- `mint_woo` database function for atomic Woo creation
- Mock shipping label API at `/api/shipping-label`

### Phase 5: Seed Data -- COMPLETE
- Re-runnable TypeScript seed script (`scripts/seed.ts`) with deterministic UUIDs
- JSON-configurable item definitions (`supabase/seed-data.json`)
- Two test users (alice, bob) with 3-5 minted Woos each
- `pnpm seed` script for quick re-seeding without `supabase db reset`

### Phase 6: Polish
- Landing page (basic version exists)
- Responsive design pass
- Error handling and loading states
- Performance optimization
- Documentation and OpenAPI spec

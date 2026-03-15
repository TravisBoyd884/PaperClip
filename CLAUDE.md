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
| **Subject Value** | A user's personal preferences for what they find valuable. Different users value different categories of items (e.g., one user values Pokemon cards while another values MTG cards). Agents use subject value preferences to decide which items to swipe right on, what to chat about, and which trades to approve. |

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
| Embeddings | Supabase pgvector + OpenAI text-embedding-3-small |
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
| `agent_preferences` | `jsonb` | Structured agent config: `{ wants, willing_to_trade, personality, swipe_model, chat_model }` |
| `preference_embedding` | `vector(1536)` | pgvector embedding of agent preferences for semantic feed ranking (generated when preferences are saved) |
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
| `embedding` | `vector(1536)` | pgvector embedding for semantic search/ranking (generated at mint time via OpenAI text-embedding-3-small) |
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
- **`mint_woo(item_id)`**: Atomically creates a Woo from a verified item. Validates the item is in `verified` status, creates the Woo with data inherited from the item (name, description, photos, category, condition, estimated_value), sets item status to `stored`, and increments `warehouses.current_count`. Runs as `SECURITY DEFINER`.
- **`get_swipe_feed(user_id, swiper_woo_id, limit, category, condition, min_value, max_value, name_search, swiper_value, wants_embedding)`**: Returns swipeable Woos for the given user and swiper Woo. Filters to `active` Woos not owned by the user, excludes already-swiped targets, and applies optional filters (category, condition, price range, name search). When `wants_embedding` is provided and Woos have embeddings, orders by cosine similarity (semantic relevance) first, then by value proximity with random tiebreaker. Returns a `similarity_score` column (0-1, null when embeddings unavailable). Runs as `SECURITY DEFINER`.
- **`match_woos_by_embedding(query_embedding, match_count)`**: Returns Woos ordered by cosine similarity to the query embedding. Used for semantic item discovery independent of the swipe flow.

### 5.14 Row-Level Security (RLS) Policies

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

### 5.15 Storage Buckets

| Bucket | Public | Purpose |
|---|---|---|
| `item-photos` | Yes | Photos uploaded during intake |
| `avatars` | Yes | User profile avatars |

**Avatars RLS**: Authenticated users upload to `avatars/{user_id}/`, anyone can view, users can delete their own.

### 5.16 Shared Trading Logic (`lib/trading.ts`)

Core trading functions are extracted into `lib/trading.ts`, parameterised by `userId` and using the admin client (service-role) to bypass RLS. This allows both the UI's server actions and the MCP server's tool handlers to share the same business logic:

- Server actions (`app/(dashboard)/swipe/actions.ts`, `app/(dashboard)/matches/actions.ts`) extract `userId` from the cookie session and delegate to `lib/trading.ts`.
- MCP tool handlers (`app/api/mcp/route.ts`) extract `userId` from the agent key's associated user and delegate to the same functions.

Functions: `getActiveWoos`, `getSwipeFeed`, `recordSwipe`, `getMatches`, `getMatchDetails`, `getMessages`, `sendMessage`, `proposeTrade`, `approveTrade`, `cancelTrade`, `dismissMatch`, `getActiveWoosForTrade`.

### 5.17 Agent Key Authentication (`lib/agent-auth.ts`)

- `validateAgentKey(key)`: SHA-256 hashes the key with `AGENT_KEY_SALT`, looks up `agent_keys` where `key_hash` matches and `is_active = true`. Returns `{ userId, keyId, permissions, rateLimit, dailyTradeLimit }` or null. Updates `last_used_at` on successful validation.
- `createAgentKey(userId, name, permissions)`: Generates a random key with `pc_live_` prefix, hashes and stores it. Returns the plain key (shown once).
- `extractBearerToken(header)`: Parses `Authorization: Bearer <token>` header.

### 5.18 Embedding Generation (`lib/embeddings.ts`)

Utilities for generating and storing pgvector embeddings using OpenAI's `text-embedding-3-small` model (1536 dimensions). All functions gracefully return `null` when `OPENAI_API_KEY` is unset or the API call fails.

- `generateEmbedding(text)`: Calls OpenAI's `/v1/embeddings` endpoint via raw `fetch` (no npm dependency). Returns `number[] | null`.
- `generateEmbeddings(texts)`: Batch version for multiple texts in a single API call.
- `buildWooEmbeddingText(woo)`: Concatenates `title + description + category + condition` into embedding input text.
- `buildPreferenceEmbeddingText(prefs)`: Concatenates `wants + willing_to_trade + personality` into embedding input text.
- `storeWooEmbedding(wooId, embedding)`: Updates `woos.embedding` column via admin client.
- `storePreferenceEmbedding(userId, embedding)`: Updates `profiles.preference_embedding` column via admin client.
- `vectorToSql(embedding)`: Converts a `number[]` to pgvector's SQL string format `[x,y,z,...]`.

**Embedding generation points**:
- Woo embeddings are generated in `mintWoo()` (admin warehouse actions) after the Woo is created.
- Preference embeddings are generated in `updateAgentConfig()` (settings actions) after preferences are saved.
- Both are also generated during seed runs (`scripts/seed.ts`) when `OPENAI_API_KEY` is available.

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

**Implementation** (complete):
- MCP server at `app/api/mcp/route.ts` using `@modelcontextprotocol/sdk` with `WebStandardStreamableHTTPServerTransport` (stateless mode)
- Agent key validation via `lib/agent-auth.ts` — extracts bearer token, hashes with SHA-256 + salt, validates against `agent_keys` table
- User identity passed to tool handlers via the MCP SDK's `authInfo.extra.userId` mechanism
- All 9 trading tools registered with Zod-described input schemas: `list_my_woos`, `get_swipe_feed`, `swipe`, `list_matches`, `get_match_messages`, `send_message`, `propose_trade`, `approve_trade`, `cancel_trade`
- Tools call shared core logic in `lib/trading.ts` (same business logic as the UI's server actions)

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

**Implementation** (complete):
- Skill manifest at `openclaw-skill/skill.md` with YAML frontmatter (name, version, permissions, config schema)
- Default trading strategy at `openclaw-skill/default-strategy.md` with swipe criteria, chat style, and trade approval rules
- Setup instructions at `openclaw-skill/README.md`
- The skill connects to PaperClip's MCP server — since OpenClaw skills ARE MCP servers, no separate code is needed
- Configuration supports: `api_key`, `paperclip_url`, `strategy` (custom prompt), `auto_swipe`, `auto_approve_threshold`

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
| `/settings` | Implemented | Profile settings (avatar, username), AI agent config (framework, personality, wants, willing_to_trade, model selection) |
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

# Agent Demo — LLM API Keys (set in .agents.env)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=              # Also used for embedding generation (text-embedding-3-small)
GOOGLE_AI_API_KEY=
GROQ_API_KEY=
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
│   │   ├── layout.tsx              # Dashboard nav layout (Dashboard, Intake, Swipe, Matches, Cash Out, Settings)
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
│   │   ├── settings/
│   │   │   ├── page.tsx            # Settings page (profile + agent config)
│   │   │   ├── profile-form.tsx    # Profile form (avatar upload, username)
│   │   │   ├── agent-config-form.tsx # Agent config form (framework, personality, wants, models)
│   │   │   └── actions.ts          # Server actions: updateProfile, uploadAvatar, updateAgentConfig
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
│   │   ├── mcp/
│   │   │   └── route.ts           # MCP server (Streamable HTTP, stateless, agent key auth)
│   │   └── v1/                     # * REST API endpoints
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
│   ├── trading.ts                  # Core trading logic (shared by server actions + MCP tools)
│   ├── embeddings.ts               # pgvector embedding generation (OpenAI text-embedding-3-small) and storage
│   ├── agent-auth.ts               # Agent key validation and creation
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
│   │   ├── 20250314000008_multi_woo_trades.sql    # trade_woos join table for N:M trades
│   │   ├── 20250314000009_drop_old_swipe_feed.sql # Drop old 3-param get_swipe_feed overload
│   │   ├── 20250315000001_agent_preferences.sql  # agent_preferences jsonb column + avatars storage bucket
│   │   └── 20250315000002_pgvector_embeddings.sql # pgvector extension, embedding columns, HNSW index, semantic swipe feed
│   ├── seed-data.json              # Themed seed items (Pokemon, MTG, sports, electronics) with real images and user preferences
│   └── seed.sql                    # Seed data (warehouses)
├── agents/
│   ├── runner.ts                  # Main orchestrator: launches browsers in parallel, auto-detected quarter-screen layout, concurrent trading rounds, embedding similarity + keyword fallback, auto-approve
│   ├── config.ts                  # Agent configuration: DB preferences + embeddings -> seed-data.json fallback, tiered model selection
│   ├── llm-adapter.ts             # Common LLM interface + split system/user prompt builders (compact + full preferences)
│   ├── browser-agent.ts           # Playwright page interaction helpers (DOM reading for Woos, chat, trade state)
│   └── adapters/
│       ├── claude.ts              # Anthropic Claude adapter
│       ├── openai.ts              # OpenAI GPT adapter
│       ├── gemini.ts              # Google Gemini adapter
│       └── groq.ts                # Groq/Llama adapter (OpenAI-compatible)
├── openclaw-skill/
│   ├── skill.md                   # OpenClaw skill manifest (YAML frontmatter + instructions)
│   ├── default-strategy.md        # Default trading strategy prompt
│   └── README.md                  # Setup instructions for OpenClaw users
├── scripts/
│   └── seed.ts                    # Re-runnable seed script: discovers profiles, seeds items and Woos
│                                  #   --create-users flag: creates 4 demo agent accounts + agent keys
├── middleware.ts                   # Auth middleware (protects /dashboard, /admin, etc.)
├── CLAUDE.md                       # This file
├── package.json
├── next.config.ts
├── tsconfig.json
└── .env
```

---

## 14. Seed Data

The project includes a re-runnable seed system that populates the remote database with fully minted Woos for existing users, providing a clean starting point for testing and demoing the swipe/match/trade flow.

### 14.1 Running the Seed

```bash
pnpm seed
```

The script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the `.env` file (via `dotenv`) and connects to the remote Supabase database.

The script is **re-runnable**: it deletes all previously seeded data (including any swipes, matches, and trades created during testing) before reinserting. Edit `supabase/seed-data.json` and re-run `pnpm seed` at any time to reset to a clean state.

### 14.2 How It Works

1. The script auto-discovers all profiles in the `profiles` table, ordered by `created_at`.
2. It matches each profile to an item group from `supabase/seed-data.json` in order (first profile gets the first group, second gets the second, etc.).
3. It deletes any previously seeded items, woos, swipes, matches, messages, and trades for those users.
4. It inserts items (status `stored`, `verified: true`) and woos (status `active`) with deterministic UUIDs derived from each user's real UUID.

### 14.3 Seed Data Configuration

Item definitions live in `supabase/seed-data.json` as an `item_groups` array (4 groups for 4 users). Each group has a `label` (for console output) and an `items` array. Each item has `name`, `description`, `condition`, `category`, `estimated_value`, and an optional `image_url` for real product images (falls back to `placehold.co` text placeholder if not provided).

The file also contains a `demo_users` array with email, password, username, agent_framework, agent_description, and `preferences` for 4 demo agent accounts. These are used when running `pnpm seed:demo`.

#### Subject Value and Trading Pairs

Seed items are designed around **subject value** — each user owns items they don't personally value and wants items from categories they do value. This creates natural trading pairs:

| Agent | Owns (willing to trade) | Wants (subject value) |
|---|---|---|
| ClaudeTrader | MTG cards (Black Lotus, Lightning Bolt, Sol Ring) | Pokemon cards |
| GPTTrader | Pokemon cards (Charizard, Blastoise, Venusaur, Mewtwo) | MTG cards |
| GeminiTrader | Sports memorabilia (Jordan, Babe Ruth, Brady cards) | Vintage electronics |
| LlamaTrader | Vintage electronics (Macintosh, Atari, Game Boy, TI-84) | Sports memorabilia |

Each user also has one "prized possession" from their valued category that they'd prefer not to trade (e.g., ClaudeTrader's Pikachu Base Set, GPTTrader's Mox Pearl).

#### User Preferences Object

Each `demo_user` in `seed-data.json` has a `preferences` object:

```json
{
  "wants": ["pokemon cards", "pokemon collectibles"],
  "willing_to_trade": ["magic the gathering cards", "MTG cards"],
  "personality": "Passionate Pokemon collector who believes Pokemon cards will appreciate in value..."
}
```

Preferences are loaded by `agents/config.ts` at startup with a priority chain: **DB `profiles.agent_preferences`** -> **seed-data.json** -> **empty defaults**. Users can configure preferences via the `/settings` page, which persists to the `agent_preferences` jsonb column. The seed-data.json file serves as a fallback for demo accounts.

#### Item Images

Each seed item has an `image_url` field pointing to a real product image:
- **Pokemon cards**: Pokemon TCG API (`images.pokemontcg.io`)
- **MTG cards**: Scryfall API (`cards.scryfall.io`)
- **Sports memorabilia**: Wikimedia Commons
- **Vintage electronics**: Wikimedia Commons

The seed script uses `image_url` when provided, falling back to `placehold.co` text placeholders.

To add or change seed items, edit `seed-data.json` and run `pnpm seed` again.

### 14.4 Demo Mode (`pnpm seed:demo`)

Running `pnpm seed:demo` (equivalent to `tsx scripts/seed.ts --create-users`) does everything `pnpm seed` does plus:

- Creates 4 demo user accounts via `supabase.auth.admin.createUser()` if they don't already exist
- Sets `is_agent: true` and `agent_framework` on each profile
- Creates an agent key for each user and prints them to the console (shown once)
- The 4 demo users are: ClaudeTrader, GPTTrader, GeminiTrader, LlamaTrader

### 14.5 What Gets Seeded

- Items assigned to PaperClip West warehouse (status `stored`, `verified: true`)
- Active Woos mirroring each item's fields
- Real product images from Pokemon TCG API, Scryfall, and Wikimedia Commons (or `placehold.co` fallback)
- **No** swipes, matches, messages, or trades (these are cleaned up on each run)
- (Demo mode only) 4 agent user accounts with agent keys

---

## 15. Agent Demo

The agent demo launches 4 browser windows in parallel, each occupying one quarter of the screen and logged into a different PaperClip user with a different LLM model making trading decisions. All agents run simultaneously — browser initialization, login, and each trading round execute in parallel via `Promise.allSettled`. Screen resolution is auto-detected at runtime (`getScreenSize()`) to dynamically size and position windows. Each agent is driven by **subject value preferences** — personal interests that determine which items they want and which they're willing to trade away.

### 15.1 Architecture

```
Agent Runner (agents/runner.ts)
├── Browser 1 — ClaudeTrader (Anthropic Claude) — wants Pokemon, trades MTG
├── Browser 2 — GPTTrader (OpenAI GPT-4o) — wants MTG, trades Pokemon
├── Browser 3 — GeminiTrader (Google Gemini 2.5) — wants vintage electronics, trades sports
└── Browser 4 — LlamaTrader (Groq/Llama 3.3) — wants sports memorabilia, trades electronics
```

Each agent has:
- A Playwright browser instance (headful, auto-sized to one screen quarter via `getScreenSize()`)
- An LLM adapter that implements `decideSwipe()`, `decideBatchSwipe()`, `generateMessage()`, and `decideTrade()`
- A phase state machine: swipe -> matches -> chat -> repeat
- **Subject value preferences** loaded from DB (with seed-data.json fallback) and injected into all LLM prompts
- **Tiered models**: cheap classification model for swipe/trade, smarter generation model for chat

All 4 agents execute their phases in parallel each round via `Promise.allSettled`. Browsers are initialized and logged in concurrently. Log output includes timestamps (`[HH:MM:SS]`) for readability with interleaved parallel output.

### 15.2 Subject Value and Preference-Driven Trading

Agents incorporate the user's **subject value** into every decision:

- **Swipe**: Embedding similarity pre-filtering first computes cosine similarity between the card embedding and the agent's preference embedding. If similarity >= 0.75, auto-RIGHT; if <= 0.3, auto-LEFT. Falls back to keyword matching when embeddings are unavailable. Only ambiguous cards go to the LLM, using compact preferences (~15 tokens) in the system prompt.
- **Chat**: Agents discuss WHY they want the other party's item, referencing their full personality. The LLM generates natural, preference-aware conversation using the smarter chat model.
- **Trade approval**: Embedding similarity auto-approves when the incoming item embedding is >= 0.75 similar to the agent's preference embedding. Falls back to keyword matching, then LLM for ambiguous cases.

### 15.3 Chat-Driven Trade Proposals

Instead of immediately proposing a trade after the first message, agents now:

1. Read actual chat messages from the DOM (via `browser-agent.ts`)
2. Pass full chat history and preferences to the LLM
3. The LLM signals trade readiness by appending `[PROPOSE]` to its message
4. Only propose when the LLM determines both parties seem ready
5. Auto-propose after 4+ messages as a fallback to keep the demo moving

### 15.4 Token Optimizations

Several strategies reduce LLM API costs by ~90-95%:

- **pgvector embedding similarity**: Preference embeddings and Woo embeddings enable cosine similarity-based auto-swipe and auto-approve, replacing most LLM classification calls with sub-millisecond vector math. Similarity >= 0.75 = auto-RIGHT/approve, <= 0.3 = auto-LEFT. Uses OpenAI `text-embedding-3-small` (1536 dimensions, ~$0.02/1M tokens). Embeddings are generated once per Woo at mint time and once per preference update, making query-time cost effectively zero.
- **Semantic feed ranking**: `get_swipe_feed()` accepts an optional `p_wants_embedding` parameter. When provided, Woos are ordered by cosine distance to the preference embedding, surfacing the most relevant items first and reducing total swipes needed.
- **System prompt caching**: Prompt builders return `{ system, user }` instead of a single string. The system message (role + preferences) is static across sequential calls for the same agent, enabling Anthropic's automatic prompt caching (90% cost reduction on cached tokens).
- **Compact preferences**: Swipe/trade prompts use a concise format (`"Wants: X. Trading away: Y."` ~15 tokens) instead of the full personality (~80 tokens). Chat prompts use the full format.
- **Stripped descriptions**: Swipe prompts omit item descriptions — title + category + condition + value is sufficient for classification. Saves ~20-40 tokens per call.
- **Tiered models**: Each adapter has a `classificationModel` (cheap) and `generationModel` (smart). Swipe and trade decisions use the classification model; chat uses the generation model.
- **Keyword pre-filtering** (fallback): When embeddings are unavailable, check card text against `wants` (auto-RIGHT) and `willing_to_trade` (auto-LEFT) keywords. Eliminates ~70-80% of swipe LLM calls.
- **Auto-approve trades**: Embedding similarity or keyword matching auto-approves trades, skipping the LLM trade decision entirely.
- **Lower maxTokens**: Chat responses capped at 100 tokens (1-2 sentences); swipe/trade at 10.
- **Graceful degradation**: All embedding operations fail silently. When `OPENAI_API_KEY` is unset or embedding generation fails, the system falls back to keyword pre-filtering and LLM classification with identical behavior to the pre-embedding architecture.

| Adapter | Classification Model | Generation Model |
|---|---|---|
| Claude | claude-haiku-4-20250514 | claude-sonnet-4-20250514 |
| OpenAI | gpt-4o-mini | gpt-4o |
| Gemini | gemini-2.0-flash-lite | gemini-2.5-flash |
| Groq | llama-3.1-8b-instant | llama-3.3-70b-versatile |

Model selection is configurable per user via `/settings` (persisted in `profiles.agent_preferences`).

### 15.5 Running the Demo

```bash
# 1. Seed the database with 4 demo users and items
pnpm seed:demo

# 2. Start the Next.js dev server
pnpm dev

# 3. Install Playwright browsers (first time only)
npx playwright install chromium

# 4. Create .agents.env with your LLM API keys
cp .agents.env.example .agents.env
# Edit .agents.env and add your keys

# 5. Launch the demo
pnpm agents
```

### 15.6 LLM Adapters

Each adapter implements the `AgentLLM` interface from `agents/llm-adapter.ts`:

- `decideSwipe(myWoo, targetWoo, preferences)` → `"left"` or `"right"` (uses classification model)
- `decideBatchSwipe(myWoo, targets[], preferences)` → `("left" | "right")[]` (uses classification model)
- `generateMessage(chatContext)` → chat message string (may end with `[PROPOSE]`, uses generation model)
- `decideTrade(tradeContext)` → `true` (approve) or `false` (decline, uses classification model)

All methods receive the agent's `AgentPreferences` and use split system/user prompts built by shared functions (`buildSwipeMessages`, `buildChatMessages`, `buildTradeMessages`). Each adapter accepts `generationModel` and `classificationModel` in its constructor, with sensible defaults.

| Adapter | Provider | Classification Model | Generation Model | Package |
|---|---|---|---|---|
| `ClaudeAdapter` | Anthropic | claude-haiku-4-20250514 | claude-sonnet-4-20250514 | `@anthropic-ai/sdk` |
| `OpenAIAdapter` | OpenAI | gpt-4o-mini | gpt-4o | `openai` |
| `GeminiAdapter` | Google | gemini-2.0-flash-lite | gemini-2.5-flash | `@google/generative-ai` |
| `GroqAdapter` | Groq | llama-3.1-8b-instant | llama-3.3-70b-versatile | `openai` (compatible API) |

---

## 16. Development Phases

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
- Swipe feed filters: category, condition, price range, name search, and value-based ordering
- `condition` column on woos (copied from item at mint)
- Multi-Woo trades: `trade_woos` join table for N:M trades, updated `execute_trade()` and chat/trade UI

### Phase 3: Agent Integration -- IN PROGRESS
- ~~Agent key management (create, revoke, list)~~ Core create/validate implemented in `lib/agent-auth.ts`; UI settings page pending
- ~~API key authentication middleware~~ Implemented in MCP route handler (`Authorization: Bearer` validation)
- REST API endpoints for all trading actions (pending -- MCP server covers agent access)
- ~~MCP server with all trading tools~~ Implemented at `app/api/mcp/route.ts` with 9 tools
- ~~OpenClaw skill~~ Implemented at `openclaw-skill/` with manifest, strategy, and README
- ~~Core trading logic extraction~~ `lib/trading.ts` with shared business logic used by both server actions and MCP
- ~~Browser automation demo~~ `agents/` with Playwright runner (parallel execution, auto-detected quarter-screen layout), 4 LLM adapters (Claude, GPT, Gemini, Groq/Llama)
- ~~Subject value preferences~~ Agents load per-user preferences from `seed-data.json` and inject them into all LLM prompts (swipe, chat, trade)
- ~~Chat-driven trade proposals~~ Agents read chat messages from the DOM, pass full context to the LLM, and only propose trades when the LLM signals readiness (or after 4+ messages as fallback)
- ~~Real Woo/chat DOM reading~~ Agents read actual Woo info (title, value) and chat messages from the page instead of using placeholders
- ~~Token optimization~~ System prompt caching, tiered models (classification vs generation), keyword pre-filtering, auto-approve, compact preferences, stripped descriptions, lower maxTokens
- ~~pgvector embeddings~~ Supabase pgvector for semantic Woo/preference embeddings (OpenAI text-embedding-3-small). Embedding-based swipe pre-filtering and semantic feed ranking replace keyword matching with cosine similarity thresholds
- ~~User settings page~~ `/settings` page for profile (avatar, username) and AI agent configuration (framework, personality, wants, willing_to_trade, model selection)
- ~~DB-backed preferences~~ `profiles.agent_preferences` jsonb column, loaded by agents with seed-data.json fallback
- ~~Avatars storage~~ `avatars` Supabase Storage bucket with RLS
- A2A Agent Card (pending)
- Rate limiting and safety controls (pending)

### Phase 4: Warehouse and Cash Out -- COMPLETE
- Intake request flow (user-facing form, photo upload, warehouse assignment, shipping label)
- Cash out request flow (Woo selector, shipping address, status tracking)
- Warehouse admin panel (overview, intakes, inventory, cash outs)
- `warehouse_staff` table and RLS for admin authorization
- `mint_woo` database function for atomic Woo creation
- Mock shipping label API at `/api/shipping-label`

### Phase 5: Seed Data -- COMPLETE
- Re-runnable TypeScript seed script (`scripts/seed.ts`) targeting remote Supabase via `.env`
- Auto-discovers existing profiles and seeds items/Woos for each
- JSON-configurable item definitions (`supabase/seed-data.json`) with positional item groups
- Deterministic UUIDs derived from real user UUIDs for clean delete-then-reinsert
- `pnpm seed` script for quick re-seeding (cleans up swipes, matches, trades between runs)
- Subject-value-themed seed items: Pokemon cards, MTG cards, sports memorabilia, vintage electronics
- Real product images from Pokemon TCG API, Scryfall, and Wikimedia Commons
- Per-user `preferences` object (wants, willing_to_trade, personality) loaded by agents at runtime

### Phase 6: Polish
- Landing page (basic version exists)
- Responsive design pass
- Error handling and loading states
- Performance optimization
- Documentation and OpenAPI spec

---

## 17. Coding Conventions

### React: Dialog/Modal Initialization

Never call `setState` directly in the render body to respond to prop changes. This triggers the React error "Cannot update a component while rendering a different component." Instead, use `useEffect` keyed on the relevant prop:

```tsx
// Bad -- setState during render
const [lastOpen, setLastOpen] = useState(false);
if (open && !lastOpen) {
  setLastOpen(true);
  setData(...);
}

// Good -- useEffect
useEffect(() => {
  if (!open) return;
  setData(...);
}, [open]);
```

This applies to all dialogs, modals, and drawers that need to reset state or fetch data when opened.

### Radix UI: No Select Inside Dialog

Radix `Select` must not be used inside a Radix `Dialog`. Both components use portals and modal focus/pointer-event trapping that conflict -- the Dialog's modal overlay blocks pointer events on the Select's portaled dropdown, making items unclickable. Use `DropdownMenu` instead, which does not have this conflict. See `swipe-deck.tsx` and `chat-view.tsx` for the established pattern.

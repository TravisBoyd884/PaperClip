Yes — generative AI is central to PaperClip. We use it in two distinct ways:

### 1. Embedding Generation (OpenAI text-embedding-3-small)

We use OpenAI's **text-embedding-3-small** model to generate 1536-dimensional vector embeddings for every tradeable item (Woo) and every user's preference profile. These embeddings are stored in Supabase via **pgvector** and power:

- **Semantic feed ranking** — The swipe feed orders items by cosine similarity to the user's preference embedding, surfacing the most relevant items first.
- **Agent auto-swiping** — When a Woo embedding has >= 0.75 cosine similarity to an agent's preference embedding, the agent auto-swipes right without any LLM call. Below 0.3, it auto-swipes left. Only ambiguous items go to the LLM for a decision.
- **Trade approval** — Same similarity thresholds auto-approve or auto-reject trade proposals.

This replaced ~90% of what would have been expensive LLM classification calls with sub-millisecond vector math.

### 2. Multi-LLM Agent Trading (Claude, GPT-4o, Gemini, Llama)

Our live agent demo runs 4 AI agents simultaneously, each powered by a different LLM:

| Agent | Classification Model | Chat Model |
|-------|---------------------|------------|
| ClaudeTrader | Claude Haiku | Claude Sonnet |
| GPTTrader | GPT-4o-mini | GPT-4o |
| GeminiTrader | Gemini 2.0 Flash Lite | Gemini 2.5 Flash |
| LlamaTrader | Llama 3.1 8B (Groq) | Llama 3.3 70B (Groq) |

Each agent uses generative AI to:

- **Decide swipes** — For items where embedding similarity is ambiguous, the LLM classifies whether to swipe left or right based on the agent's preferences.
- **Chat and negotiate** — Agents generate natural, personality-driven conversation explaining why they want the other party's item and what they're willing to trade.
- **Signal trade readiness** — The LLM reads the full chat history and decides when both parties seem ready, appending `[PROPOSE]` to trigger a trade proposal.

We use **tiered models** (cheap for classification, smart for chat), **prompt caching**, and **compact preference injection** to reduce token costs by ~90-95% compared to naive LLM-for-everything approaches.

### Why we used it

The core premise of PaperClip is that AI agents can barter at machine speed. Generative AI enables agents to make subjective value judgments ("Is this Pokemon card worth trading my MTG card for?"), negotiate in natural language, and drive the entire trading loop autonomously. Embeddings make this economically viable by handling the bulk of decisions through vector similarity rather than expensive LLM inference.

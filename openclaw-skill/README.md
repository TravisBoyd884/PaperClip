# PaperClip Trading Skill for OpenClaw

Trade digital representations of physical items (Woos) on PaperClip using your OpenClaw agent.

## Setup

### 1. Get a PaperClip Account

Sign up at your PaperClip instance and ship an item to a warehouse to receive a Woo.

### 2. Generate an Agent Key

From the PaperClip dashboard, generate an Agent Key with the permissions you want
(`swipe`, `chat`, `trade`, `cashout`).

### 3. Install the Skill

```bash
openclaw skill install paperclip-trading
```

### 4. Configure

Add to your OpenClaw agent's configuration:

```yaml
skills:
  paperclip-trading:
    api_key: "pc_live_your_key_here"
    paperclip_url: "https://your-paperclip-instance.vercel.app"
    auto_swipe: true
    auto_approve_threshold: 1.0
    strategy: "" # Leave empty for default, or provide a custom strategy
```

### 5. Run

Start your OpenClaw agent and it will begin trading automatically:

```bash
openclaw start
```

Or trigger manually:

```bash
openclaw run /trade
```

## Custom Strategies

You can provide a custom trading strategy by setting the `strategy` config option.
This replaces the default strategy prompt and gives you full control over how your
agent makes trading decisions.

Example:

```yaml
skills:
  paperclip-trading:
    api_key: "pc_live_..."
    strategy: |
      Only trade for electronics and collectibles.
      Never accept trades below $20 in value.
      Be extremely enthusiastic in chat messages, use lots of exclamation marks.
      Always propose trades within 30 seconds of matching.
```

## How It Works

This skill connects to PaperClip's MCP server, which exposes tools for:

- Browsing the swipe feed
- Swiping left/right on items
- Managing matches and chat
- Proposing and approving trades

The skill uses your configured strategy (or the default) to make autonomous trading
decisions through these tools.

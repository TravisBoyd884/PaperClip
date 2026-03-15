import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { validateAgentKey, extractBearerToken } from "@/lib/agent-auth";
import * as trading from "@/lib/trading";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function getUserId(extra: Extra): string {
  return extra.authInfo?.extra?.userId as string;
}

function createPaperClipMcpServer() {
  const server = new McpServer(
    { name: "PaperClip Trading", version: "1.0.0" },
    {
      instructions:
        "PaperClip is a bartering platform where AI agents trade digital representations of physical items called Woos. " +
        "Use the tools below to browse items, swipe, match, chat, negotiate, and execute trades.",
    }
  );

  server.registerTool("list_my_woos", {
    title: "List My Woos",
    description:
      "Returns all active Woos owned by the authenticated agent. Use this to see what you currently own and can offer in trades.",
    inputSchema: {},
  }, async (_args, extra) => {
    const woos = await trading.getActiveWoos(getUserId(extra));
    return { content: [{ type: "text" as const, text: JSON.stringify(woos, null, 2) }] };
  });

  server.registerTool("get_swipe_feed", {
    title: "Get Swipe Feed",
    description:
      "Returns a batch of Woos available to swipe on. These are items other users are offering that you haven't swiped on yet. " +
      "Swipe right on items you want to trade for, left to pass.",
    inputSchema: {
      swiper_woo_id: z.string().describe("The ID of your Woo that you're offering to trade"),
      limit: z.number().optional().describe("Max number of Woos to return (default 20)"),
      category: z.string().optional().describe("Filter by category: office, electronics, furniture, collectible, other"),
      condition: z.string().optional().describe("Filter by condition: new, like_new, good, fair, poor"),
      min_value: z.number().optional().describe("Minimum estimated value in dollars"),
      max_value: z.number().optional().describe("Maximum estimated value in dollars"),
    },
  }, async (args, extra) => {
    const result = await trading.getSwipeFeed(getUserId(extra), args.swiper_woo_id, {
      category: args.category,
      condition: args.condition,
      minValue: args.min_value,
      maxValue: args.max_value,
    }, args.limit ?? 20);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("swipe", {
    title: "Swipe on a Woo",
    description:
      "Swipe right (interested in trading) or left (pass) on a Woo. " +
      "If both users swipe right on each other, a match is created and you can begin negotiating a trade.",
    inputSchema: {
      swiper_woo_id: z.string().describe("The ID of your Woo that you're offering"),
      target_woo_id: z.string().describe("The ID of the Woo you're swiping on"),
      direction: z.enum(["left", "right"]).describe("Swipe direction: 'right' = interested, 'left' = pass"),
    },
  }, async (args, extra) => {
    const result = await trading.recordSwipe(getUserId(extra), args.swiper_woo_id, args.target_woo_id, args.direction);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("list_matches", {
    title: "List Matches",
    description:
      "Returns all active matches. A match is created when both users swipe right on each other. " +
      "Use this to find matches where you can propose trades.",
    inputSchema: {},
  }, async (_args, extra) => {
    const result = await trading.getMatches(getUserId(extra));
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get_match_messages", {
    title: "Get Match Messages",
    description: "Gets chat history for a match. Use this to read the conversation and understand negotiation context.",
    inputSchema: {
      match_id: z.string().describe("The match ID to get messages for"),
      limit: z.number().optional().describe("Max messages to return (default 100)"),
    },
  }, async (args, extra) => {
    const result = await trading.getMessages(getUserId(extra), args.match_id, args.limit ?? 100);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("send_message", {
    title: "Send Message",
    description: "Sends a chat message in a match conversation. Use this to negotiate trade terms with the other user.",
    inputSchema: {
      match_id: z.string().describe("The match ID to send the message in"),
      content: z.string().describe("The message text to send"),
    },
  }, async (args, extra) => {
    const result = await trading.sendMessage(getUserId(extra), args.match_id, args.content);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("propose_trade", {
    title: "Propose Trade",
    description:
      "Proposes a trade for a match. The proposer automatically approves; the other user must also approve for the trade to execute. " +
      "Optionally specify additional Woo IDs from your side for a multi-Woo trade.",
    inputSchema: {
      match_id: z.string().describe("The match ID to propose a trade for"),
      woo_ids: z.array(z.string()).optional().describe("Optional: your Woo IDs to include in the trade (for multi-Woo trades)"),
    },
  }, async (args, extra) => {
    const result = await trading.proposeTrade(getUserId(extra), args.match_id, args.woo_ids);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("approve_trade", {
    title: "Approve Trade",
    description:
      "Approves a pending trade. When both parties have approved, the Woos are swapped automatically. " +
      "Review the trade details carefully before approving.",
    inputSchema: {
      trade_id: z.string().describe("The trade ID to approve"),
    },
  }, async (args, extra) => {
    const result = await trading.approveTrade(getUserId(extra), args.trade_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("cancel_trade", {
    title: "Cancel Trade",
    description: "Cancels a pending trade. The match returns to active status so a new trade can be proposed.",
    inputSchema: {
      trade_id: z.string().describe("The trade ID to cancel"),
    },
  }, async (args, extra) => {
    const result = await trading.cancelTrade(getUserId(extra), args.trade_id);
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

async function authenticateRequest(
  request: Request
): Promise<{ userId: string; token: string } | Response> {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header. Use: Authorization: Bearer <agent_key>" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const keyInfo = await validateAgentKey(token);
  if (!keyInfo) {
    return new Response(
      JSON.stringify({ error: "Invalid or revoked agent key" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return { userId: keyInfo.userId, token };
}

export async function POST(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const server = createPaperClipMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: {
      token: authResult.token,
      clientId: authResult.userId,
      scopes: ["trade"],
      extra: { userId: authResult.userId },
    },
  });
}

export async function GET(request: Request) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof Response) return authResult;

  const server = createPaperClipMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  return transport.handleRequest(request, {
    authInfo: {
      token: authResult.token,
      clientId: authResult.userId,
      scopes: ["trade"],
      extra: { userId: authResult.userId },
    },
  });
}

export async function DELETE() {
  return new Response(null, { status: 200 });
}

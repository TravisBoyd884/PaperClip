import type { Page } from "playwright";
import type { WooInfo } from "./llm-adapter.js";

const SLOW_MO = 300;

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function login(page: Page, appUrl: string, email: string, password: string) {
  await page.goto(`${appUrl}/auth`, { waitUntil: "networkidle" });
  await wait(500);

  const signInTab = page.locator('[value="sign-in"]');
  if (await signInTab.count()) {
    await signInTab.click();
    await wait(300);
  }

  await page.fill("#signin-email", email);
  await page.fill("#signin-password", password);
  await page.click('button[type="submit"]:has-text("Sign In")');

  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await wait(500);
}

export async function navigateToSwipe(page: Page, appUrl: string) {
  await page.goto(`${appUrl}/swipe`, { waitUntil: "networkidle" });
  await wait(1000);
}

export async function navigateToMatches(page: Page, appUrl: string) {
  await page.goto(`${appUrl}/matches`, { waitUntil: "networkidle" });
  await wait(1000);
}

export async function selectWoo(page: Page) {
  // The Woo selector is a DropdownMenu with a Button trigger containing the Woo name or placeholder
  const trigger = page.locator('[role="combobox"]').first();
  const dropdownTrigger = page.locator('button:has-text("Select a Woo")').first();
  const activeTrigger = (await trigger.count()) ? trigger : dropdownTrigger;
  if (!(await activeTrigger.count())) return;

  const currentText = await activeTrigger.textContent();
  if (currentText && !currentText.includes("Select a Woo")) return;

  await activeTrigger.click();
  await wait(300);

  const menuItem = page.locator('[role="menuitem"]').first();
  const option = page.locator('[role="option"]').first();
  const firstItem = (await menuItem.count()) ? menuItem : option;
  if (await firstItem.count()) {
    await firstItem.click();
    await wait(1000);
  }
}

export async function readSelectedWooInfo(page: Page): Promise<WooInfo | null> {
  const badge = page.locator('[data-slot="badge"]').first();
  if (!(await badge.count())) return null;

  const badgeText = await badge.textContent().catch(() => null);
  if (!badgeText) return null;

  // Greedy match: capture everything before the price suffix
  const titleMatch = badgeText.match(/^(.+?)\s*\(\$[\d.]+\)/);
  const valueMatch = badgeText.match(/\$([\d.]+)/);
  // If the price-pattern regex didn't match, the whole text (minus trailing whitespace) is the title
  const title = titleMatch?.[1]?.trim() ?? badgeText.replace(/\s*\u00d7?\s*$/, "").trim();
  const value = valueMatch ? parseFloat(valueMatch[1]) : null;

  // Fallback: read the "Your Woo" label under the swipe buttons
  // The element uses responsive classes (text-[10px] sm:text-xs) so match by structure
  const yourWooLabel = page.locator("p.font-medium.line-clamp-1").first();
  const labelText = await yourWooLabel.textContent().catch(() => null);

  return {
    id: "",
    title: labelText?.trim() || title,
    description: null,
    category: "collectible",
    condition: "good",
    estimated_value: value,
    trade_count: 0,
  };
}

export async function readCurrentCard(page: Page): Promise<WooInfo | null> {
  const card = page.locator(".absolute.inset-0.rounded-3xl.overflow-hidden.bg-card.shadow-md").first();
  if (!(await card.count())) return null;

  const title = await card.locator("h3").first().textContent().catch(() => null);
  if (!title) return null;

  const valueText = await card.locator("text=/\\$\\d/").first().textContent().catch(() => null);
  const value = valueText ? parseFloat(valueText.replace(/[^0-9.]/g, "")) : null;

  const badges = await card.locator('[class*="Badge"], [data-slot="badge"]').allTextContents().catch(() => []);
  const category = badges.find((b) =>
    ["Office", "Electronics", "Furniture", "Collectible", "Other"].includes(b)
  ) ?? "";
  const condition = badges.find((b) =>
    ["New", "Like New", "Good", "Fair", "Poor"].includes(b)
  ) ?? "";

  const desc = await card.locator("p.text-muted-foreground").first().textContent().catch(() => null);

  return {
    id: "",
    title: title.trim(),
    description: desc?.trim() ?? null,
    category: category.toLowerCase(),
    condition: condition.toLowerCase().replace(" ", "_"),
    estimated_value: value,
    trade_count: 0,
  };
}

async function dismissAnyDialog(page: Page) {
  const overlay = page.locator('[data-slot="dialog-overlay"]').first();
  if (await overlay.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await wait(500);
  }
}

export async function clickSwipe(page: Page, direction: "left" | "right") {
  await dismissAnyDialog(page);

  const selector = direction === "left"
    ? "button.rounded-full.text-destructive"
    : "button.rounded-full.text-accent";

  const btn = page.locator(selector).first();
  if (await btn.count()) {
    try {
      await btn.click({ timeout: 3000 });
    } catch {
      await dismissAnyDialog(page);
      try {
        await btn.click({ timeout: 3000 });
      } catch {
        return;
      }
    }
    await wait(SLOW_MO);
  }
  await wait(500);
}

export async function checkMatchModal(page: Page): Promise<boolean> {
  await wait(500);
  const modal = page.locator("text=It's a Match").first();
  const visible = await modal.isVisible().catch(() => false);

  if (visible) {
    await wait(1000);
    await page.keyboard.press("Escape");
    await wait(500);
    return true;
  }

  const overlay = page.locator('[data-slot="dialog-overlay"]').first();
  if (await overlay.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await wait(500);
    return true;
  }

  return false;
}

export async function readMatchList(page: Page): Promise<{ id: string; counterparty: string; status: string }[]> {
  const matches: { id: string; counterparty: string; status: string }[] = [];

  const links = page.locator('a[href*="/matches/"]');
  const count = await links.count();

  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    const href = await link.getAttribute("href");
    if (!href) continue;
    const id = href.split("/matches/").pop() ?? "";

    const text = await link.textContent();
    const counterparty = text?.split("\n").find((t) => t.trim())?.trim() ?? "Unknown";

    matches.push({ id, counterparty, status: "active" });
  }

  return matches;
}

export async function openMatch(page: Page, appUrl: string, matchId: string) {
  await page.goto(`${appUrl}/matches/${matchId}`, { waitUntil: "networkidle" });
  await wait(1000);
}

export async function readWooInfoFromChat(page: Page): Promise<{
  myWoo: WooInfo;
  theirWoo: WooInfo;
  theirUsername: string;
}> {
  const wooLine = page.locator("p.text-muted-foreground.truncate").first();
  const wooText = await wooLine.textContent().catch(() => null);

  let myTitle = "My Item";
  let theirTitle = "Their Item";

  if (wooText && wooText.includes("⇄")) {
    const parts = wooText.split("⇄").map((s) => s.trim());
    theirTitle = parts[0] || theirTitle;
    myTitle = parts[1] || myTitle;
  }

  const usernameEl = page.locator("span.font-medium.truncate").first();
  const theirUsername = await usernameEl.textContent().catch(() => "Counterparty");

  return {
    myWoo: {
      id: "",
      title: myTitle,
      description: null,
      category: "collectible",
      condition: "good",
      estimated_value: null,
      trade_count: 0,
    },
    theirWoo: {
      id: "",
      title: theirTitle,
      description: null,
      category: "collectible",
      condition: "good",
      estimated_value: null,
      trade_count: 0,
    },
    theirUsername: theirUsername?.trim() ?? "Counterparty",
  };
}

export async function readChatState(page: Page): Promise<{
  tradeState: "none" | "pending_my_approval" | "pending_their_approval" | "completed";
  hasTradeCard: boolean;
  messages: { sender: string; content: string; isMe: boolean }[];
}> {
  const messages: { sender: string; content: string; isMe: boolean }[] = [];

  const msgContainer = page.locator(".flex-1.overflow-y-auto");
  if (await msgContainer.count()) {
    const allBubbles = msgContainer.locator(":scope > div.flex > div.rounded-2xl");
    const bubbleCount = await allBubbles.count();

    for (let i = 0; i < bubbleCount; i++) {
      const bubble = allBubbles.nth(i);
      const parent = bubble.locator("..");

      const parentClasses = await parent.getAttribute("class").catch(() => "");
      const isMe = parentClasses?.includes("justify-end") ?? false;

      const textEl = bubble.locator("p.whitespace-pre-wrap").first();
      const content = await textEl.textContent().catch(() => null);
      if (!content) continue;

      let sender = "Me";
      if (!isMe) {
        const senderEl = bubble.locator("span.font-medium").first();
        sender = await senderEl.textContent().catch(() => "Them") ?? "Them";
      }

      messages.push({ sender: sender.trim(), content: content.trim(), isMe });
    }
  }

  const tradeProposalCard = page.locator('[data-slot="card"]:has-text("Trade Proposal")').first();
  const completedCard = page.locator('[data-slot="card"]:has-text("Trade Completed")').first();
  const completedFooter = page.locator('text=/Trade completed.*Woos have been swapped/').first();
  const approveBtn = tradeProposalCard.locator('button:has-text("Approve")').first();
  const waitingText = tradeProposalCard.locator('text=/Waiting for the other party/').first();

  let tradeState: "none" | "pending_my_approval" | "pending_their_approval" | "completed" = "none";
  const hasTradeCard = await tradeProposalCard.count() > 0;

  if ((await completedCard.isVisible().catch(() => false)) || (await completedFooter.isVisible().catch(() => false))) {
    tradeState = "completed";
  } else if (await approveBtn.isVisible().catch(() => false)) {
    tradeState = "pending_my_approval";
  } else if (await waitingText.isVisible().catch(() => false)) {
    tradeState = "pending_their_approval";
  }

  return { tradeState, hasTradeCard, messages };
}

export async function typeMessage(page: Page, text: string) {
  const input = page.locator('input[placeholder*="message"], textarea[placeholder*="message"], input[type="text"]').last();
  if (!(await input.count())) return;

  await input.fill(text);
  await wait(200);

  const sendBtn = page.locator('button:has-text("Send"), button[type="submit"]').last();
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click();
  } else {
    await input.press("Enter");
  }
  await wait(500);
}

export async function clickProposeTrade(page: Page) {
  await dismissAnyDialog(page);

  const btn = page.locator('button:has-text("Propose Trade")').first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();

    const dialogBtn = page.locator('[role="dialog"] button:has-text("Propose Trade")').first();
    try {
      await dialogBtn.waitFor({ state: "visible", timeout: 5000 });
      await wait(300);
      await dialogBtn.click();
      await wait(2000);
    } catch {
      // Dialog may not have appeared — press Escape to dismiss any partial state
      await page.keyboard.press("Escape");
      await wait(500);
    }
  }
}

export async function clickApproveTrade(page: Page) {
  await dismissAnyDialog(page);

  const card = page.locator('[data-slot="card"]:has-text("Trade Proposal")').first();
  const btn = card.locator('button:has-text("Approve")').first();
  if (await btn.isVisible().catch(() => false)) {
    try {
      await btn.click({ timeout: 5000 });
      await wait(2000);
    } catch {
      await dismissAnyDialog(page);
      try {
        await btn.click({ timeout: 5000 });
        await wait(2000);
      } catch {
        return;
      }
    }
  }
}

export async function waitForFeedLoad(page: Page) {
  const spinner = page.locator(".animate-spin").first();
  for (let i = 0; i < 15; i++) {
    if (await spinner.isVisible().catch(() => false)) {
      await wait(500);
      continue;
    }
    const card = page.locator(".absolute.inset-0.rounded-3xl.overflow-hidden.bg-card").first();
    if ((await card.count()) > 0) return;
    const noMore = page.locator("text=No more Woos to swipe on").first();
    if (await noMore.isVisible().catch(() => false)) return;
    await wait(500);
  }
}

export async function hasSwipeCards(page: Page): Promise<boolean> {
  const card = page.locator(".absolute.inset-0.rounded-3xl.overflow-hidden.bg-card").first();
  if ((await card.count()) > 0) return true;

  const noMore = page.locator("text=No more Woos to swipe on").first();
  if (await noMore.isVisible().catch(() => false)) return false;

  return false;
}

export async function isOnPage(page: Page, urlPart: string): Promise<boolean> {
  return page.url().includes(urlPart);
}

import type { Page } from "playwright";
import type { WooInfo, ChatContext } from "./llm-adapter.js";

const SLOW_MO = 300;

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function login(page: Page, appUrl: string, email: string, password: string) {
  await page.goto(`${appUrl}/auth`, { waitUntil: "networkidle" });
  await wait(500);

  // Make sure "Sign In" tab is active
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
  // The swipe page has a select for choosing which Woo to offer.
  // If a Woo is already selected (selector has a value), skip.
  const trigger = page.locator('[role="combobox"]').first();
  if (!(await trigger.count())) return;

  const currentText = await trigger.textContent();
  if (currentText && !currentText.includes("Select a Woo")) return;

  await trigger.click();
  await wait(300);

  // Pick the first option
  const firstOption = page.locator('[role="option"]').first();
  if (await firstOption.count()) {
    await firstOption.click();
    await wait(1000);
  }
}

export async function readCurrentCard(page: Page): Promise<WooInfo | null> {
  // The swipe card contains the item info in a specific structure
  const card = page.locator(".absolute.inset-0.rounded-2xl.overflow-hidden.bg-card.border.shadow-lg").first();
  if (!(await card.count())) return null;

  const title = await card.locator("h3").first().textContent().catch(() => null);
  if (!title) return null;

  // Try to extract value from the card
  const valueText = await card.locator("text=/\\$\\d/").first().textContent().catch(() => null);
  const value = valueText ? parseFloat(valueText.replace(/[^0-9.]/g, "")) : null;

  // Extract category badge
  const badges = await card.locator('[class*="Badge"], [data-slot="badge"]').allTextContents().catch(() => []);
  const category = badges.find((b) =>
    ["Office", "Electronics", "Furniture", "Collectible", "Other"].includes(b)
  ) ?? "";
  const condition = badges.find((b) =>
    ["New", "Like New", "Good", "Fair", "Poor"].includes(b)
  ) ?? "";

  // Extract description
  const desc = await card.locator("p.text-sm.text-muted-foreground").first().textContent().catch(() => null);

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

export async function clickSwipe(page: Page, direction: "left" | "right") {
  if (direction === "left") {
    // Red X button
    const btn = page.locator("button.rounded-full.border-destructive").first();
    if (await btn.count()) {
      await btn.click();
      await wait(SLOW_MO);
    }
  } else {
    // Pink heart button
    const btn = page.locator("button.rounded-full.border-pink-500").first();
    if (await btn.count()) {
      await btn.click();
      await wait(SLOW_MO);
    }
  }
  await wait(500);
}

export async function checkMatchModal(page: Page): Promise<boolean> {
  // The match modal shows "It's a Match!" text
  const modal = page.locator("text=It's a Match").first();
  const visible = await modal.isVisible().catch(() => false);

  if (visible) {
    await wait(1500);
    // Close the modal - look for close button or overlay
    const closeBtn = page.locator('[role="dialog"] button').last();
    if (await closeBtn.count()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await wait(500);
    return true;
  }
  return false;
}

export async function readMatchList(page: Page): Promise<{ id: string; counterparty: string; status: string }[]> {
  const matches: { id: string; counterparty: string; status: string }[] = [];

  // Match list items are links to /matches/[id]
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

export async function readChatState(page: Page): Promise<{
  tradeState: "none" | "pending_my_approval" | "pending_their_approval" | "completed";
  hasTradeCard: boolean;
  messages: { sender: string; content: string; isMe: boolean }[];
}> {
  const messages: { sender: string; content: string; isMe: boolean }[] = [];

  // Read chat messages from the message area
  const msgElements = page.locator('[class*="flex"][class*="gap"]').filter({ has: page.locator("p") });
  const msgCount = await msgElements.count();

  // Check for trade card
  const approveBtn = page.locator('button:has-text("Approve Trade")').first();
  const proposeBtn = page.locator('button:has-text("Propose Trade")').first();
  const completedText = page.locator('text=/Trade completed|Woos have been swapped/').first();

  let tradeState: "none" | "pending_my_approval" | "pending_their_approval" | "completed" = "none";
  const hasTradeCard = (await approveBtn.count()) > 0 || (await proposeBtn.count()) > 0;

  if (await completedText.isVisible().catch(() => false)) {
    tradeState = "completed";
  } else if (await approveBtn.isVisible().catch(() => false)) {
    tradeState = "pending_my_approval";
  } else if (hasTradeCard) {
    tradeState = "pending_their_approval";
  }

  return { tradeState, hasTradeCard, messages };
}

export async function typeMessage(page: Page, text: string) {
  const input = page.locator('input[placeholder*="message"], textarea[placeholder*="message"], input[type="text"]').last();
  if (!(await input.count())) return;

  await input.fill(text);
  await wait(200);

  // Click send button or press Enter
  const sendBtn = page.locator('button:has-text("Send"), button[type="submit"]').last();
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.click();
  } else {
    await input.press("Enter");
  }
  await wait(500);
}

export async function clickProposeTrade(page: Page) {
  const btn = page.locator('button:has-text("Propose Trade")').first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await wait(1000);
  }
}

export async function clickApproveTrade(page: Page) {
  const btn = page.locator('button:has-text("Approve Trade")').first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await wait(1000);
  }
}

export async function hasSwipeCards(page: Page): Promise<boolean> {
  const noMore = page.locator("text=No more Woos to swipe on").first();
  if (await noMore.isVisible().catch(() => false)) return false;

  const card = page.locator(".absolute.inset-0.rounded-2xl.overflow-hidden.bg-card.border.shadow-lg").first();
  return (await card.count()) > 0;
}

export async function isOnPage(page: Page, urlPart: string): Promise<boolean> {
  return page.url().includes(urlPart);
}

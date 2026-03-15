import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const WAREHOUSE_ID = "a1b2c3d4-0001-4000-8000-000000000001";

interface SeedItem {
  name: string;
  description: string;
  condition: string;
  category: string;
  estimated_value: number;
}

interface SeedData {
  item_groups: { label: string; items: SeedItem[] }[];
}

function itemUuid(userUuid: string, index: number): string {
  const suffix = userUuid.split("-").pop()!;
  const idx = String(index + 1).padStart(4, "0");
  return `11111111-${idx}-4000-8000-${suffix}`;
}

function wooUuid(userUuid: string, index: number): string {
  const suffix = userUuid.split("-").pop()!;
  const idx = String(index + 1).padStart(4, "0");
  return `22222222-${idx}-4000-8000-${suffix}`;
}

function placeholderUrl(name: string): string {
  const encoded = encodeURIComponent(name).replace(/%20/g, "+");
  return `https://placehold.co/600x400/EEE/31343C?font=montserrat&text=${encoded}`;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env"
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const seedPath = resolve(__dirname, "..", "supabase", "seed-data.json");
  const seedData: SeedData = JSON.parse(readFileSync(seedPath, "utf-8"));

  // Auto-discover existing profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username")
    .order("created_at", { ascending: true });

  if (profilesError) {
    console.error("Failed to fetch profiles:", profilesError.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.error("No profiles found in the database. Create users first.");
    process.exit(1);
  }

  const groupCount = seedData.item_groups.length;
  if (profiles.length < groupCount) {
    console.warn(
      `Found ${profiles.length} profile(s) but seed-data.json has ${groupCount} item group(s). ` +
        `Only the first ${profiles.length} group(s) will be seeded.`
    );
  }

  const pairCount = Math.min(profiles.length, groupCount);
  const pairedUsers = profiles.slice(0, pairCount);

  console.log(`Discovered ${profiles.length} profile(s), seeding ${pairCount}:`);
  for (let i = 0; i < pairCount; i++) {
    console.log(
      `  ${seedData.item_groups[i].label} -> ${pairedUsers[i].username} (${pairedUsers[i].id})`
    );
  }

  // Compute deterministic IDs for all paired users
  const userIds = pairedUsers.map((p) => p.id);
  const allItemIds: string[] = [];
  const allWooIds: string[] = [];
  for (let g = 0; g < pairCount; g++) {
    const userId = pairedUsers[g].id;
    const items = seedData.item_groups[g].items;
    for (let i = 0; i < items.length; i++) {
      allItemIds.push(itemUuid(userId, i));
      allWooIds.push(wooUuid(userId, i));
    }
  }

  console.log("\nCleaning up previous seed data...");

  // Delete trades/messages on matches involving discovered users
  const { data: seedMatches } = await supabase
    .from("matches")
    .select("id")
    .or(`user_a_id.in.(${userIds.join(",")}),user_b_id.in.(${userIds.join(",")})`);

  if (seedMatches && seedMatches.length > 0) {
    const matchIds = seedMatches.map((m: { id: string }) => m.id);
    await supabase.from("trades").delete().in("match_id", matchIds);
    await supabase.from("messages").delete().in("match_id", matchIds);
    await supabase.from("matches").delete().in("id", matchIds);
    console.log(`  Deleted ${matchIds.length} match(es) and related trades/messages`);
  }

  // Delete swipes by discovered users
  await supabase.from("swipes").delete().in("swiper_id", userIds);

  // Delete swipes targeting seed woos
  if (allWooIds.length > 0) {
    await supabase.from("swipes").delete().in("target_woo_id", allWooIds);
  }

  // Delete cashouts referencing seed woos
  if (allWooIds.length > 0) {
    await supabase.from("cashouts").delete().in("woo_id", allWooIds);
  }

  // Delete seed woos and items
  if (allWooIds.length > 0) {
    await supabase.from("woos").delete().in("id", allWooIds);
  }
  if (allItemIds.length > 0) {
    await supabase.from("items").delete().in("id", allItemIds);
  }

  console.log("  Cleanup complete");

  console.log("\nSeeding items and woos...");

  let totalItems = 0;

  for (let g = 0; g < pairCount; g++) {
    const userId = pairedUsers[g].id;
    const username = pairedUsers[g].username;
    const items = seedData.item_groups[g].items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const iId = itemUuid(userId, i);
      const wId = wooUuid(userId, i);
      const imageUrl = placeholderUrl(item.name);

      const { error: itemError } = await supabase.from("items").insert({
        id: iId,
        warehouse_id: WAREHOUSE_ID,
        owner_id: userId,
        name: item.name,
        description: item.description,
        condition: item.condition,
        category: item.category,
        estimated_value: item.estimated_value,
        photos: [imageUrl],
        verified: true,
        status: "stored",
      });

      if (itemError) {
        console.error(`  Failed to insert item "${item.name}": ${itemError.message}`);
        process.exit(1);
      }

      const { error: wooError } = await supabase.from("woos").insert({
        id: wId,
        item_id: iId,
        owner_id: userId,
        title: item.name,
        description: item.description,
        images: [imageUrl],
        category: item.category,
        condition: item.condition,
        estimated_value: item.estimated_value,
        trade_count: 0,
        status: "active",
      });

      if (wooError) {
        console.error(`  Failed to insert woo "${item.name}": ${wooError.message}`);
        process.exit(1);
      }

      totalItems++;
      console.log(`  ${username}: ${item.name} ($${item.estimated_value})`);
    }
  }

  // Update warehouse current_count
  const { error: warehouseError } = await supabase
    .from("warehouses")
    .update({ current_count: totalItems })
    .eq("id", WAREHOUSE_ID);

  if (warehouseError) {
    console.warn(`  Warning updating warehouse count: ${warehouseError.message}`);
  }

  console.log("\n--- Seed Complete ---");
  console.log(`Profiles seeded: ${pairCount}`);
  console.log(`Items seeded:    ${totalItems}`);
  console.log(`Woos minted:     ${totalItems}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

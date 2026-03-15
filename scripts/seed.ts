import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q";

const WAREHOUSE_ID = "a1b2c3d4-0001-4000-8000-000000000001";

const USER_CONFIG: Record<string, { uuid: string; email: string; username: string }> = {
  alice: {
    uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "alice@test.com",
    username: "alice",
  },
  bob: {
    uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "bob@test.com",
    username: "bob",
  },
};

const PASSWORD = "password123";

interface SeedItem {
  name: string;
  description: string;
  condition: string;
  category: string;
  estimated_value: number;
}

interface SeedData {
  users: Record<string, { items: SeedItem[] }>;
}

function userSuffix(userKey: string): string {
  return USER_CONFIG[userKey].uuid.split("-").pop()!;
}

function itemUuid(userKey: string, index: number): string {
  const idx = String(index + 1).padStart(4, "0");
  return `11111111-${idx}-4000-8000-${userSuffix(userKey)}`;
}

function wooUuid(userKey: string, index: number): string {
  const idx = String(index + 1).padStart(4, "0");
  return `22222222-${idx}-4000-8000-${userSuffix(userKey)}`;
}

function placeholderUrl(name: string): string {
  const encoded = encodeURIComponent(name).replace(/%20/g, "+");
  return `https://placehold.co/600x400/EEE/31343C?font=montserrat&text=${encoded}`;
}

async function main() {
  const supabaseUrl = process.env.SEED_SUPABASE_URL || LOCAL_SUPABASE_URL;
  const supabaseKey = process.env.SEED_SUPABASE_SERVICE_ROLE_KEY || LOCAL_SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const seedPath = resolve(__dirname, "..", "supabase", "seed-data.json");
  const seedData: SeedData = JSON.parse(readFileSync(seedPath, "utf-8"));

  const userKeys = Object.keys(seedData.users);
  const userIds = userKeys.map((k) => USER_CONFIG[k].uuid);

  const allItemIds: string[] = [];
  const allWooIds: string[] = [];
  for (const userKey of userKeys) {
    const items = seedData.users[userKey].items;
    for (let i = 0; i < items.length; i++) {
      allItemIds.push(itemUuid(userKey, i));
      allWooIds.push(wooUuid(userKey, i));
    }
  }

  console.log("Cleaning up previous seed data...");

  // Delete trades on matches involving seed users
  const { data: seedMatches } = await supabase
    .from("matches")
    .select("id")
    .or(`user_a_id.in.(${userIds.join(",")}),user_b_id.in.(${userIds.join(",")})`);

  if (seedMatches && seedMatches.length > 0) {
    const matchIds = seedMatches.map((m: { id: string }) => m.id);
    await supabase.from("trades").delete().in("match_id", matchIds);
    await supabase.from("messages").delete().in("match_id", matchIds);
    await supabase.from("matches").delete().in("id", matchIds);
  }

  // Delete swipes by seed users
  await supabase.from("swipes").delete().in("swiper_id", userIds);

  // Delete swipes targeting seed woos (from other users)
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

  // Delete seed auth users (cascades to profiles)
  for (const userKey of userKeys) {
    const { error } = await supabase.auth.admin.deleteUser(USER_CONFIG[userKey].uuid);
    if (error && !error.message.includes("not found")) {
      console.warn(`  Warning deleting ${userKey}: ${error.message}`);
    }
  }

  console.log("Creating test users...");

  for (const userKey of userKeys) {
    const config = USER_CONFIG[userKey];
    const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${config.username}`;

    const { error } = await supabase.auth.admin.createUser({
      id: config.uuid,
      email: config.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        user_name: config.username,
        avatar_url: avatarUrl,
      },
    });

    if (error) {
      console.error(`  Failed to create ${userKey}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  Created ${config.username} (${config.email})`);
  }

  console.log("Seeding items and woos...");

  let totalItems = 0;

  for (const userKey of userKeys) {
    const userId = USER_CONFIG[userKey].uuid;
    const items = seedData.users[userKey].items;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const iId = itemUuid(userKey, i);
      const wId = wooUuid(userKey, i);
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
        estimated_value: item.estimated_value,
        trade_count: 0,
        status: "active",
      });

      if (wooError) {
        console.error(`  Failed to insert woo "${item.name}": ${wooError.message}`);
        process.exit(1);
      }

      totalItems++;
      console.log(`  ${USER_CONFIG[userKey].username}: ${item.name} ($${item.estimated_value})`);
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
  console.log(`Users created: ${userKeys.length}`);
  console.log(`Items seeded:  ${totalItems}`);
  console.log(`Woos minted:   ${totalItems}`);
  console.log("\nTest credentials:");
  for (const userKey of userKeys) {
    const config = USER_CONFIG[userKey];
    console.log(`  ${config.username}: ${config.email} / ${PASSWORD}`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

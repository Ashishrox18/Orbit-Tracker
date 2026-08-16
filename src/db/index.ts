import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

export const db = drizzle(neon(url), { schema });
export { schema };

/**
 * This app is single-user by design (see the note on `users`). Every request
 * resolves the one row here, creating it on first run so a fresh database
 * boots straight into onboarding rather than erroring.
 */
export async function getLocalUser() {
  const existing = await db.select().from(schema.users).limit(1);
  if (existing[0]) return existing[0];

  const created = await db
    .insert(schema.users)
    .values({ name: "there" })
    .returning();

  const user = created[0];
  if (!user) throw new Error("Could not create the local user row.");
  return user;
}

export async function getUserById(id: string) {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return rows[0] ?? null;
}

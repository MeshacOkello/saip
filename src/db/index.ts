import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

/**
 * Next.js reloads modules in development, so the client is cached on globalThis to
 * avoid exhausting Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  saipSql?: ReturnType<typeof postgres>;
};

const client = globalForDb.saipSql ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.saipSql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
export type Db = typeof db;

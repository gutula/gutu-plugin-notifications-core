import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { createDbClient, executeSql, type PlatformDatabaseClient } from "@platform/db-drizzle";

import {
  buildNotificationsMigrationSql,
  buildNotificationsRollbackSql,
  getNotificationsEndpointIdempotencyIndexName,
  getNotificationsMessageIdempotencyIndexName
} from "../../src/postgres";

const postgresUrl =
  process.env.TEST_POSTGRES_URL ?? process.env.DATABASE_TEST_URL ?? process.env.DATABASE_URL;

const describeIfPostgres = postgresUrl ? describe : describe.skip;

describeIfPostgres("notifications-core postgres invariants", () => {
  let adminClient: PlatformDatabaseClient | null = null;

  beforeAll(() => {
    if (!postgresUrl) {
      return;
    }

    adminClient = createDbClient({
      engine: "postgres",
      connectionString: postgresUrl,
      maxConnections: 1,
      role: "app_migrator"
    });
  });

  afterAll(async () => {
    await adminClient?.close();
  });

  it("applies and rolls back the communication tables and idempotency indexes", async () => {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const schemaName = `notifications_${suffix}`;

    await applySql(adminClient, buildNotificationsMigrationSql({ schemaName }));

    try {
      const tables = await queryRows(
        adminClient,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schemaName}' ORDER BY table_name;`
      );

      expect(tables).toEqual([
        { table_name: "delivery_endpoints" },
        { table_name: "delivery_preferences" },
        { table_name: "message_attempts" },
        { table_name: "messages" }
      ]);

      const indexes = await queryRows(
        adminClient,
        `SELECT indexname FROM pg_indexes WHERE schemaname = '${schemaName}' ORDER BY indexname;`
      );

      expect(indexes.map((row) => row.indexname)).toContain(getNotificationsEndpointIdempotencyIndexName());
      expect(indexes.map((row) => row.indexname)).toContain(getNotificationsMessageIdempotencyIndexName());
    } finally {
      await applySql(adminClient, buildNotificationsRollbackSql({ schemaName }));
    }
  });
});

async function applySql(client: PlatformDatabaseClient | null, statements: string[]): Promise<void> {
  if (!client) {
    throw new Error("missing postgres client");
  }

  for (const statement of statements) {
    await executeSql(client, statement);
  }
}

async function queryRows(
  client: PlatformDatabaseClient | null,
  statement: string
): Promise<Array<Record<string, string>>> {
  if (!client || client.engine !== "postgres") {
    throw new Error("postgres client is required");
  }

  return await client.raw.unsafe(statement);
}

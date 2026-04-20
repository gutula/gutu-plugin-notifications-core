export type NotificationsSqlOptions = {
  schemaName?: string;
  dropSchema?: boolean;
};

export function buildNotificationsMigrationSql(options: NotificationsSqlOptions = {}): string[] {
  const schemaName = normalizeIdentifier(options.schemaName ?? "notifications", "schemaName");
  const endpointsTable = `${schemaName}.delivery_endpoints`;
  const preferencesTable = `${schemaName}.delivery_preferences`;
  const messagesTable = `${schemaName}.messages`;
  const attemptsTable = `${schemaName}.message_attempts`;

  return [
    `CREATE SCHEMA IF NOT EXISTS ${schemaName};`,
    `CREATE TABLE IF NOT EXISTS ${endpointsTable} (` +
      "id text PRIMARY KEY, " +
      "tenant_id text NOT NULL, " +
      "recipient_ref text NOT NULL, " +
      "channel text NOT NULL, " +
      "label text NOT NULL, " +
      "destination_kind text NOT NULL, " +
      "address text NOT NULL, " +
      "provider_route text NOT NULL, " +
      "status text NOT NULL, " +
      "actor_id text NOT NULL, " +
      "reason text NULL, " +
      "created_at timestamptz NOT NULL DEFAULT now(), " +
      "updated_at timestamptz NOT NULL DEFAULT now()" +
    ");",
    `CREATE TABLE IF NOT EXISTS ${preferencesTable} (` +
      "id text PRIMARY KEY, " +
      "tenant_id text NOT NULL, " +
      "subject_ref text NOT NULL, " +
      "channel text NOT NULL, " +
      "enabled boolean NOT NULL, " +
      "digest_enabled boolean NOT NULL, " +
      "actor_id text NOT NULL, " +
      "reason text NULL, " +
      "created_at timestamptz NOT NULL DEFAULT now(), " +
      "updated_at timestamptz NOT NULL DEFAULT now()" +
    ");",
    `CREATE TABLE IF NOT EXISTS ${messagesTable} (` +
      "id text PRIMARY KEY, " +
      "tenant_id text NOT NULL, " +
      "actor_id text NOT NULL, " +
      "channel text NOT NULL, " +
      "recipient_ref text NOT NULL, " +
      "endpoint_id text NULL, " +
      "template_id text NULL, " +
      "template_props jsonb NULL, " +
      "direct_address text NULL, " +
      "title text NULL, " +
      "body_text text NULL, " +
      "data jsonb NULL, " +
      "delivery_mode text NOT NULL, " +
      "priority text NOT NULL, " +
      "provider_route text NOT NULL, " +
      "destination_snapshot jsonb NULL, " +
      "idempotency_key text NOT NULL, " +
      "status text NOT NULL, " +
      "send_at timestamptz NULL, " +
      "reason text NULL, " +
      "failure_code text NULL, " +
      "failure_message text NULL, " +
      "provider_message_id text NULL, " +
      "created_at timestamptz NOT NULL DEFAULT now(), " +
      "updated_at timestamptz NOT NULL DEFAULT now()" +
    ");",
    `CREATE TABLE IF NOT EXISTS ${attemptsTable} (` +
      "id text PRIMARY KEY, " +
      `message_id text NOT NULL REFERENCES ${messagesTable}(id) ON DELETE CASCADE, ` +
      "tenant_id text NOT NULL, " +
      "attempt_number integer NOT NULL, " +
      "provider_route text NOT NULL, " +
      "status text NOT NULL, " +
      "outcome_category text NOT NULL, " +
      "provider_message_id text NULL, " +
      "callback_token text NULL, " +
      "error_code text NULL, " +
      "error_message text NULL, " +
      "occurred_at timestamptz NOT NULL DEFAULT now(), " +
      "updated_at timestamptz NOT NULL DEFAULT now()" +
    ");",
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getNotificationsEndpointIdempotencyIndexName()} ` +
      `ON ${endpointsTable} (tenant_id, recipient_ref, channel, address);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ${getNotificationsMessageIdempotencyIndexName()} ` +
      `ON ${messagesTable} (tenant_id, idempotency_key);`,
    `CREATE INDEX IF NOT EXISTS ${getNotificationsPreferenceLookupIndexName()} ` +
      `ON ${preferencesTable} (tenant_id, subject_ref, channel);`,
    `CREATE INDEX IF NOT EXISTS ${getNotificationsAttemptLookupIndexName()} ` +
      `ON ${attemptsTable} (message_id, attempt_number);`
  ];
}

export function buildNotificationsRollbackSql(options: NotificationsSqlOptions = {}): string[] {
  const schemaName = normalizeIdentifier(options.schemaName ?? "notifications", "schemaName");
  const dropSchema = options.dropSchema ?? schemaName !== "notifications";

  return [
    `DROP TABLE IF EXISTS ${schemaName}.message_attempts CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.messages CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.delivery_preferences CASCADE;`,
    `DROP TABLE IF EXISTS ${schemaName}.delivery_endpoints CASCADE;`,
    ...(dropSchema ? [`DROP SCHEMA IF EXISTS ${schemaName} CASCADE;`] : [])
  ];
}

export function getNotificationsEndpointIdempotencyIndexName(): string {
  return "delivery_endpoints_tenant_recipient_address_idx";
}

export function getNotificationsMessageIdempotencyIndexName(): string {
  return "messages_tenant_idempotency_idx";
}

export function getNotificationsPreferenceLookupIndexName(): string {
  return "delivery_preferences_lookup_idx";
}

export function getNotificationsAttemptLookupIndexName(): string {
  return "message_attempts_lookup_idx";
}

function normalizeIdentifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error(`${label} must use simple alphanumeric or underscore SQL identifiers`);
  }

  return value.toLowerCase();
}

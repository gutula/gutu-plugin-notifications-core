/** Recent notification deliveries for a record.
 *
 *  Mountable as a `RichDetailRailModule` on any detail page; shows the
 *  last N deliveries that fired for this record across all rules and
 *  channels, with status pills, error messages, and quick replay /
 *  suppress actions for admins.
 *
 *  Backend: GET /api/notification-rules/:resource/:recordId/deliveries
 *           POST /api/notification-rules/_deliveries/:id/replay
 *           POST /api/notification-rules/_deliveries/:id/suppress */

import * as React from "react";
import { Bell, Mail, Webhook, Smartphone, RefreshCcw, X, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/admin-primitives/Card";
import { Badge } from "@/primitives/Badge";
import { Button } from "@/primitives/Button";
import { Spinner } from "@/primitives/Spinner";
import { authStore } from "@/runtime/auth";

interface Delivery {
  id: string;
  ruleId: string;
  channel: "in-app" | "email" | "webhook" | "sms";
  status: "pending" | "sent" | "failed" | "suppressed";
  attempts: number;
  lastError: string | null;
  payload: { subject?: string; body?: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  resource: string;
  recordId: string;
  /** Show admin actions (replay/suppress). Defaults to true; pass false
   *  for read-only roles. */
  adminActions?: boolean;
}

function apiBase(): string {
  const base =
    (typeof import.meta !== "undefined"
      ? (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE
      : undefined) ?? "/api";
  return base.toString().replace(/\/+$/, "");
}

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (authStore.token) h.Authorization = `Bearer ${authStore.token}`;
  if (authStore.activeTenant?.id) h["x-tenant"] = authStore.activeTenant.id;
  return h;
}

const channelIcon = (k: Delivery["channel"]) => {
  switch (k) {
    case "in-app":
      return <Bell className="h-3.5 w-3.5" />;
    case "email":
      return <Mail className="h-3.5 w-3.5" />;
    case "webhook":
      return <Webhook className="h-3.5 w-3.5" />;
    case "sms":
      return <Smartphone className="h-3.5 w-3.5" />;
  }
};

const statusIntent = (s: Delivery["status"]) => {
  switch (s) {
    case "sent":
      return "success" as const;
    case "failed":
      return "danger" as const;
    case "suppressed":
      return "neutral" as const;
    case "pending":
      return "warning" as const;
  }
};

export function NotificationDeliveriesCard({
  resource,
  recordId,
  adminActions = true,
}: Props): React.JSX.Element {
  const [rows, setRows] = React.useState<Delivery[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(
        `${apiBase()}/notification-rules/${encodeURIComponent(resource)}/${encodeURIComponent(recordId)}/deliveries`,
        { headers: authHeaders(false), credentials: "include" },
      );
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setRows([]);
        return;
      }
      const j = (await res.json()) as { rows: Delivery[] };
      setRows(j.rows ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows([]);
    }
  }, [resource, recordId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Periodic refresh — if we have any pending deliveries, recheck every
  // few seconds so the UI shows the dispatcher's progress without the
  // user having to refresh.
  React.useEffect(() => {
    if (!rows) return;
    if (!rows.some((r) => r.status === "pending")) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [rows, load]);

  const replay = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(
        `${apiBase()}/notification-rules/_deliveries/${encodeURIComponent(id)}/replay`,
        { method: "POST", headers: authHeaders(), credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const suppress = async (id: string) => {
    if (!confirm("Suppress this delivery (it won't fire)?")) return;
    setBusy(id);
    try {
      const res = await fetch(
        `${apiBase()}/notification-rules/_deliveries/${encodeURIComponent(id)}/suppress`,
        {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: JSON.stringify({ reason: "Suppressed from detail page" }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (rows === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="py-6 flex items-center justify-center text-text-muted text-xs">
          <Spinner size={12} />
          <span className="ml-2">Loading…</span>
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-text-muted" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 text-xs text-text-muted">
          No notifications fired for this record yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-text-muted" />
          Notifications
          <span className="text-xs text-text-muted">({rows.length})</span>
        </CardTitle>
        <Button size="xs" variant="ghost" onClick={() => void load()} title="Refresh">
          <RefreshCcw className="h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-0 max-h-72 overflow-auto">
        {error ? (
          <div className="px-3 py-2 text-xs text-intent-danger flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </div>
        ) : null}
        <ul className="divide-y divide-border-subtle">
          {rows.map((r) => {
            const subject = r.payload?.subject ?? "(no subject)";
            return (
              <li key={r.id} className="px-3 py-2 text-xs flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-text-muted shrink-0">{channelIcon(r.channel)}</span>
                  <span className="text-text-primary truncate flex-1 min-w-0">{subject}</span>
                  <Badge intent={statusIntent(r.status)} className="font-normal text-[10px]">
                    {r.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-text-muted">
                  <span className="font-mono">{r.channel}</span>
                  {r.attempts > 0 ? (
                    <span>· {r.attempts} attempt{r.attempts === 1 ? "" : "s"}</span>
                  ) : null}
                  <span className="ml-auto">{relativeTime(r.updatedAt)}</span>
                </div>
                {r.lastError ? (
                  <div className="text-[11px] text-intent-danger break-words">
                    {r.lastError}
                  </div>
                ) : null}
                {adminActions && (r.status === "failed" || r.status === "pending") ? (
                  <div className="flex items-center gap-1 pt-1">
                    {r.status === "failed" ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => void replay(r.id)}
                        disabled={busy === r.id}
                        loading={busy === r.id}
                        iconLeft={<RefreshCcw className="h-3 w-3" />}
                      >
                        Retry
                      </Button>
                    ) : null}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void suppress(r.id)}
                      disabled={busy === r.id}
                      iconLeft={<X className="h-3 w-3" />}
                    >
                      Suppress
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

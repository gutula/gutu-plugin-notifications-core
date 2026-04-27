/** Settings → Notification rules page.
 *
 *  Per-resource event-driven rules. UI lets the user pick a resource, the
 *  event ('create' | 'update' | 'submit' | 'cancel' | 'value-change' |
 *  'days-after' | 'days-before' | 'cron'), an optional condition tree
 *  (one leaf at a time — the form encodes "field {op} value" rows joined
 *  by AND), one or more channels (in-app, email, webhook, sms), and a
 *  Jinja-like body template (same engine as print formats).
 *
 *  Backend: admin-panel/backend/src/routes/notification-rules.ts. */

import * as React from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  AlertTriangle,
  Bell,
  Power,
  X,
  Send,
} from "lucide-react";

import { PageHeader } from "@/admin-primitives/PageHeader";
import { Card, CardContent } from "@/admin-primitives/Card";
import { EmptyState } from "@/admin-primitives/EmptyState";
import { useUiResources } from "@/runtime/useUiMetadata";
import { Button } from "@/primitives/Button";
import { Input } from "@/primitives/Input";
import { Label } from "@/primitives/Label";
import { Badge } from "@/primitives/Badge";
import { Spinner } from "@/primitives/Spinner";
import { Textarea } from "@/primitives/Textarea";
import { Switch } from "@/primitives/Switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/primitives/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/primitives/Select";
import {
  type NotificationRule,
  type NotificationEvent,
  type ChannelDescriptor,
  type ConditionExpression,
  type ConditionLeaf,
  useNotificationRules,
  bumpNotificationRules,
  createNotificationRuleApi,
  updateNotificationRuleApi,
  deleteNotificationRuleApi,
  testNotificationRule,
} from "@/runtime/useCustomizationApi";
import { cn } from "@/lib/cn";

const RESOURCES: ReadonlyArray<{ id: string; label: string; category: string }> = [
  { id: "sales.quote", label: "Quotations", category: "Sales" },
  { id: "sales.order", label: "Sales orders", category: "Sales" },
  { id: "sales.deal", label: "Deals", category: "Sales" },
  { id: "accounting.invoice", label: "Invoices", category: "Accounting" },
  { id: "accounting.payment", label: "Payments", category: "Accounting" },
  { id: "procurement.po", label: "Purchase orders", category: "Procurement" },
  { id: "inventory.delivery", label: "Delivery notes", category: "Inventory" },
  { id: "ops.ticket", label: "Tickets", category: "Operations" },
  { id: "ops.project", label: "Projects", category: "Operations" },
  { id: "hr.employee", label: "Employees", category: "People" },
  { id: "crm.lead", label: "Leads", category: "Sales" },
  { id: "crm.opportunity", label: "Opportunities", category: "Sales" },
];

const EVENTS: ReadonlyArray<{ value: NotificationEvent; label: string; description: string }> = [
  { value: "create",       label: "On create",       description: "Fires when a new record is inserted." },
  { value: "update",       label: "On update",       description: "Fires on any update to the record." },
  { value: "submit",       label: "On submit",       description: "Fires when status moves to 'submitted'." },
  { value: "cancel",       label: "On cancel",       description: "Fires when status moves to 'cancelled'." },
  { value: "value-change", label: "On value change", description: "Fires whenever any value changes (you can match the changed field via condition on `previous.<field>` vs current)." },
  { value: "days-after",   label: "Days after date", description: "Schedule: fires N days after a date field." },
  { value: "days-before",  label: "Days before date",description: "Schedule: fires N days before a date field." },
  { value: "cron",         label: "Cron",            description: "Schedule: fires per cron expression." },
];

const COND_OPS: ReadonlyArray<{ value: ConditionLeaf["op"]; label: string }> = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "in", label: "in" },
  { value: "truthy", label: "is truthy" },
  { value: "falsy", label: "is falsy" },
];

function resourceRail(active: string, onPick: (id: string) => void) {
  return <ResourceRailImpl active={active} onPick={onPick} />;
}

function ResourceRailImpl({
  active,
  onPick,
}: {
  active: string;
  onPick: (id: string) => void;
}) {
  const { data: uiResources } = useUiResources();
  // Live registry comes first; fall back to the seeded list when no
  // plugin has registered yet (cold start). Filter writable resources
  // — read-only ones can't have notification rules anyway.
  type Row = { id: string; label: string; category: string };
  const fromRegistry: Row[] = React.useMemo(
    () => uiResources
      .filter((r) => (r.actions ?? []).includes("write"))
      .map((r) => ({
        id: r.id,
        label: r.label ?? r.id,
        category: r.group ?? "Other",
      })),
    [uiResources],
  );
  const merged: Row[] = React.useMemo(() => {
    const seen = new Set(fromRegistry.map((r) => r.id));
    const fallback = RESOURCES.filter((r) => !seen.has(r.id));
    return [...fromRegistry, ...fallback].sort((a, b) =>
      (a.category + a.label).localeCompare(b.category + b.label),
    );
  }, [fromRegistry]);
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(
      (r) => r.id.toLowerCase().includes(q) || r.label.toLowerCase().includes(q),
    );
  }, [merged, search]);
  const byCat = new Map<string, Row[]>();
  for (const r of filtered) {
    const list = byCat.get(r.category) ?? [];
    byCat.set(r.category, [...list, r]);
  }
  return (
    <aside className="flex flex-col gap-2 min-h-0">
      <Input
        prefix={<Search className="h-3.5 w-3.5" />}
        placeholder="Search resources…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
      />
      <div className="flex flex-col gap-0.5 overflow-y-auto -mr-2 pr-2 min-h-0">
        {[...byCat.entries()].map(([cat, list]) => (
          <div key={cat} className="flex flex-col gap-0.5">
            <div className="text-[11px] uppercase tracking-wider text-text-muted px-2 pt-2 mb-0.5">
              {cat}
            </div>
            {list.map((r) => {
              const isActive = r.id === active;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors min-w-0",
                    isActive
                      ? "bg-accent-subtle text-accent font-medium"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 truncate">{r.label}</span>
                  <code className={cn("font-mono text-[10px] truncate shrink-0", isActive ? "text-accent/70" : "text-text-muted")}>
                    {r.id}
                  </code>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}

interface ChannelRowProps {
  channel: ChannelDescriptor;
  onChange: (next: ChannelDescriptor) => void;
  onRemove: () => void;
}

function ChannelRow({ channel, onChange, onRemove }: ChannelRowProps) {
  const cfg = channel.config ?? {};
  return (
    <div className="rounded-md border border-border-subtle bg-surface-1/30 p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Select
          value={channel.kind}
          onValueChange={(v) =>
            onChange({ kind: v as ChannelDescriptor["kind"], config: {} })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in-app">In-app</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={onRemove}
          title="Remove channel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {channel.kind === "in-app" ? (
        <Input
          placeholder='Recipients ("owner", "tenant", or "user:<id>" comma-separated)'
          value={
            Array.isArray(cfg.recipients)
              ? (cfg.recipients as string[]).join(", ")
              : ""
          }
          onChange={(e) =>
            onChange({
              ...channel,
              config: {
                ...cfg,
                recipients: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              },
            })
          }
        />
      ) : channel.kind === "email" ? (
        <>
          <Input
            placeholder="Recipients (comma-separated emails)"
            value={Array.isArray(cfg.to) ? (cfg.to as string[]).join(", ") : ""}
            onChange={(e) =>
              onChange({
                ...channel,
                config: {
                  ...cfg,
                  to: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                },
              })
            }
          />
          <Input
            placeholder='Or pull from a record field (e.g. "email")'
            value={typeof cfg.fromField === "string" ? cfg.fromField : ""}
            onChange={(e) => onChange({ ...channel, config: { ...cfg, fromField: e.target.value } })}
          />
        </>
      ) : channel.kind === "webhook" ? (
        <Input
          placeholder="https://example.com/webhook"
          value={typeof cfg.url === "string" ? cfg.url : ""}
          onChange={(e) => onChange({ ...channel, config: { ...cfg, url: e.target.value } })}
        />
      ) : (
        <Input
          placeholder="Recipients (comma-separated phone numbers)"
          value={Array.isArray(cfg.to) ? (cfg.to as string[]).join(", ") : ""}
          onChange={(e) =>
            onChange({
              ...channel,
              config: {
                ...cfg,
                to: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              },
            })
          }
        />
      )}
    </div>
  );
}

interface ConditionsRowProps {
  leaf: ConditionLeaf;
  onChange: (next: ConditionLeaf) => void;
  onRemove: () => void;
}

function ConditionRow({ leaf, onChange, onRemove }: ConditionsRowProps) {
  const needsValue = leaf.op !== "truthy" && leaf.op !== "falsy";
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="field (e.g. status, total, customer.id)"
        value={leaf.field}
        onChange={(e) => onChange({ ...leaf, field: e.target.value })}
        className="font-mono text-xs flex-1 min-w-0"
      />
      <Select value={leaf.op} onValueChange={(v) => onChange({ ...leaf, op: v as never })}>
        <SelectTrigger className="w-24 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COND_OPS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue ? (
        <Input
          placeholder='value (string, number, or JSON for "in")'
          value={
            leaf.value === undefined || leaf.value === null
              ? ""
              : typeof leaf.value === "string"
                ? leaf.value
                : JSON.stringify(leaf.value)
          }
          onChange={(e) => {
            const raw = e.target.value;
            let v: unknown = raw;
            if (raw === "true") v = true;
            else if (raw === "false") v = false;
            else if (raw !== "" && Number.isFinite(Number(raw)) && /^-?\d/.test(raw)) v = Number(raw);
            else if (raw.startsWith("[") || raw.startsWith("{")) {
              try { v = JSON.parse(raw); } catch { /* tolerate */ }
            }
            onChange({ ...leaf, value: v });
          }}
          className="flex-1 min-w-0"
        />
      ) : null}
      <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface DialogProps {
  resource: string;
  initial: NotificationRule | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}

function RuleDialog({ resource, initial, open, onOpenChange, onSaved }: DialogProps) {
  const [name, setName] = React.useState("");
  const [event, setEvent] = React.useState<NotificationEvent>("create");
  const [enabled, setEnabled] = React.useState(true);
  const [conditions, setConditions] = React.useState<ConditionLeaf[]>([]);
  const [channels, setChannels] = React.useState<ChannelDescriptor[]>([]);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [testResult, setTestResult] = React.useState<null | {
    matched: boolean;
    subject: string | null;
    body: string;
    errors: Array<{ message: string; near: string }>;
  }>(null);
  const [testRecordRaw, setTestRecordRaw] = React.useState<string>(
    `{"customer_name": "Acme Corp", "total": 1250, "status": "submitted"}`,
  );

  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setEvent(initial.event);
      setEnabled(initial.enabled);
      setConditions(flattenCondition(initial.condition));
      setChannels(initial.channels);
      setSubject(initial.subject ?? "");
      setBody(initial.bodyTemplate);
    } else {
      setName("");
      setEvent("create");
      setEnabled(true);
      setConditions([]);
      setChannels([{ kind: "in-app", config: { recipients: ["owner"] } }]);
      setSubject("");
      setBody("Record {{ name | default(id) }} just changed.");
    }
    setApiError(null);
    setTestResult(null);
  }, [open, initial]);

  const buildCondition = (): ConditionExpression | null => {
    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0]!;
    return { op: "and", args: conditions };
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const payload = {
        name: name.trim(),
        event,
        enabled,
        condition: buildCondition(),
        channels,
        subject: subject.trim() || null,
        bodyTemplate: body,
      };
      if (initial) {
        await updateNotificationRuleApi(resource, initial.id, payload as never);
      } else {
        await createNotificationRuleApi(resource, payload as never);
      }
      bumpNotificationRules(resource);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const runTest = async () => {
    if (!initial) {
      setApiError("Save the rule once before testing.");
      return;
    }
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(testRecordRaw);
    } catch {
      setApiError("Test record must be valid JSON.");
      return;
    }
    try {
      const res = await testNotificationRule(resource, initial.id, { record });
      setTestResult(res);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    }
  };

  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    body.trim().length > 0 &&
    channels.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit notification rule" : "New notification rule"}</DialogTitle>
          <DialogDescription>
            Fire deliveries when an event matches. Body is rendered with the same template
            engine as print formats.
          </DialogDescription>
        </DialogHeader>

        {apiError ? (
          <div className="rounded-md border border-intent-danger/40 bg-intent-danger-bg/30 px-3 py-2 text-sm text-intent-danger flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="flex-1">{apiError}</span>
          </div>
        ) : null}

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="nr-name" required>Name</Label>
            <Input
              id="nr-name"
              placeholder="Notify owner on big invoice"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Event</Label>
            <Select value={event} onValueChange={(v) => setEvent(v as NotificationEvent)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENTS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    <div className="flex flex-col">
                      <span>{e.label}</span>
                      <span className="text-xs text-text-muted">{e.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <div className="flex items-center justify-between">
              <Label>Conditions (joined by AND)</Label>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setConditions((c) => [...c, { op: "eq", field: "", value: "" }])
                }
                iconLeft={<Plus className="h-3 w-3" />}
              >
                Add condition
              </Button>
            </div>
            {conditions.length === 0 ? (
              <span className="text-xs text-text-muted">
                No conditions — rule fires on every matching event.
              </span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {conditions.map((c, i) => (
                  <ConditionRow
                    key={i}
                    leaf={c}
                    onChange={(next) =>
                      setConditions((list) => list.map((x, idx) => (idx === i ? next : x)))
                    }
                    onRemove={() =>
                      setConditions((list) => list.filter((_, idx) => idx !== i))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <div className="flex items-center justify-between">
              <Label required>Channels</Label>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setChannels((c) => [...c, { kind: "email", config: {} }])
                }
                iconLeft={<Plus className="h-3 w-3" />}
              >
                Add channel
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {channels.map((ch, i) => (
                <ChannelRow
                  key={i}
                  channel={ch}
                  onChange={(next) =>
                    setChannels((list) => list.map((x, idx) => (idx === i ? next : x)))
                  }
                  onRemove={() =>
                    setChannels((list) => list.filter((_, idx) => idx !== i))
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="nr-subject">Subject (email/in-app title)</Label>
            <Input
              id="nr-subject"
              placeholder="Invoice {{ name }} created — {{ grand_total | currency }}"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="nr-body" required>Body template</Label>
            <Textarea
              id="nr-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface-1 px-3 py-2 sm:col-span-3">
            <div className="flex flex-col">
              <Label htmlFor="nr-enabled" className="cursor-pointer">Enabled</Label>
              <span className="text-xs text-text-muted">
                Disable to keep the rule but stop firing it.
              </span>
            </div>
            <Switch id="nr-enabled" checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
          </div>

          {/* Test panel */}
          {initial ? (
            <div className="rounded-md border border-border-subtle bg-surface-1/40 p-3 flex flex-col gap-2 sm:col-span-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Test against a sample record
                </span>
                <Button size="xs" variant="ghost" onClick={runTest} iconLeft={<Send className="h-3 w-3" />}>
                  Run test
                </Button>
              </div>
              <Textarea
                rows={3}
                value={testRecordRaw}
                onChange={(e) => setTestRecordRaw(e.target.value)}
                className="font-mono text-xs"
              />
              {testResult ? (
                <div className="rounded-md border border-border bg-surface-1 p-2 text-xs flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Badge intent={testResult.matched ? "success" : "neutral"}>
                      {testResult.matched ? "Condition matched" : "Did not match"}
                    </Badge>
                    {testResult.errors.length > 0 ? (
                      <Badge intent="warning">{testResult.errors.length} render warning(s)</Badge>
                    ) : null}
                  </div>
                  {testResult.subject ? (
                    <div>
                      <span className="text-text-muted">subject:</span>{" "}
                      <span className="font-mono">{testResult.subject}</span>
                    </div>
                  ) : null}
                  <pre className="bg-surface-2 rounded p-2 overflow-auto whitespace-pre-wrap text-text-secondary">
                    {testResult.body}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={submitting}>
            {initial ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function flattenCondition(expr: ConditionExpression | null): ConditionLeaf[] {
  if (!expr) return [];
  if ("args" in expr) {
    if (expr.op === "and") return expr.args.flatMap(flattenCondition);
    // OR conditions can't be expressed flat; show first branch.
    return expr.args.length > 0 ? flattenCondition(expr.args[0]!) : [];
  }
  return [expr];
}

export function NotificationRulesPage() {
  const [active, setActive] = React.useState<string>(RESOURCES[0]!.id);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NotificationRule | null>(null);
  const [busyDelete, setBusyDelete] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { rows, loading, refresh } = useNotificationRules(active);

  const handleDelete = async (r: NotificationRule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    setBusyDelete(r.id);
    try {
      await deleteNotificationRuleApi(active, r.id);
      bumpNotificationRules(active);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDelete(null);
    }
  };

  const toggleEnabled = async (r: NotificationRule) => {
    try {
      await updateNotificationRuleApi(active, r.id, { enabled: !r.enabled });
      bumpNotificationRules(active);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <PageHeader
        title="Notification rules"
        description="Event-driven rules that fire when records change. Channels: in-app, email, webhook, SMS."
        actions={
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            New rule
          </Button>
        }
      />

      {error ? (
        <div className="rounded-md border border-intent-danger/40 bg-intent-danger-bg/30 px-3 py-2 text-sm text-intent-danger flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="text-xs underline opacity-80 hover:opacity-100" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[260px_1fr] min-h-0">
        {resourceRail(active, setActive)}
        <main className="flex flex-col gap-3 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-text-primary truncate">
              {RESOURCES.find((r) => r.id === active)?.label ?? active}
            </h2>
            {rows.length > 0 ? (
              <span className="text-xs text-text-muted">{rows.length} rules</span>
            ) : null}
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center text-sm text-text-muted">
                <Spinner size={14} />
                <span className="ml-2">Loading…</span>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={<Bell className="h-5 w-5" />}
                  title="No notification rules yet"
                  description="Create a rule to email/in-app/webhook on resource events. Bodies use the same Jinja-like template engine as print formats."
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      iconLeft={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                      }}
                    >
                      New rule
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-1 border-b border-border text-xs uppercase tracking-wider text-text-muted">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Name</th>
                      <th className="text-left py-2 font-medium">Event</th>
                      <th className="text-left py-2 font-medium">Channels</th>
                      <th className="text-left py-2 font-medium w-24">Status</th>
                      <th className="text-right py-2 pr-3 font-medium w-44">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border-subtle last:border-b-0 hover:bg-surface-1 transition-colors"
                      >
                        <td className="py-2 px-3 align-middle">
                          <div className="flex items-center gap-2">
                            <Bell className="h-3.5 w-3.5 text-text-muted shrink-0" />
                            <span className="text-text-primary">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-2 align-middle">
                          <Badge intent="accent" className="font-normal">{r.event}</Badge>
                        </td>
                        <td className="py-2 align-middle">
                          <div className="flex items-center gap-1 flex-wrap">
                            {r.channels.map((ch, i) => (
                              <Badge key={i} intent="info" className="font-normal">
                                {ch.kind}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 align-middle">
                          {r.enabled ? (
                            <Badge intent="success" className="font-normal">Enabled</Badge>
                          ) : (
                            <Badge intent="neutral" className="font-normal">Disabled</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 align-middle">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => toggleEnabled(r)}
                              iconLeft={<Power className="h-3 w-3" />}
                            >
                              {r.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setEditing(r);
                                setDialogOpen(true);
                              }}
                              iconLeft={<Pencil className="h-3 w-3" />}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => handleDelete(r)}
                              iconLeft={<Trash2 className="h-3 w-3" />}
                              loading={busyDelete === r.id}
                              className="text-intent-danger hover:bg-intent-danger-bg/30"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      <RuleDialog
        resource={active}
        initial={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

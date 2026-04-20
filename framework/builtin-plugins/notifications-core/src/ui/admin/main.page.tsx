import React from "react";

function CommunicationsPageFrame(props: {
  title: string;
  description: string;
  sections: Array<{ heading: string; body: string }>;
  dataPluginPage: string;
}) {
  return (
    <section data-plugin-page={props.dataPluginPage} style={{ display: "grid", gap: "1rem" }}>
      <header style={{ display: "grid", gap: "0.4rem" }}>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </header>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {props.sections.map((section) => (
          <article
            key={section.heading}
            style={{
              border: "1px solid rgba(15, 23, 42, 0.12)",
              borderRadius: "0.9rem",
              padding: "1rem",
              background: "rgba(248, 250, 252, 0.8)"
            }}
          >
            <h2 style={{ marginBottom: "0.35rem" }}>{section.heading}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CommunicationsMessagesAdminPage() {
  return (
    <CommunicationsPageFrame
      dataPluginPage="communications-messages"
      title="Communication Messages"
      description="Queued, scheduled, accepted, delivered, failed, blocked, cancelled, and dead-lettered outbound communication records."
      sections={[
        {
          heading: "Lifecycle Truth",
          body: "Review the canonical message record, delivery mode, provider route, destination snapshot, and correlation state."
        },
        {
          heading: "Operator Actions",
          body: "Queue test sends, retry transient failures, cancel queued work, and trace provider callbacks without leaving the admin workbench."
        }
      ]}
    />
  );
}

export function CommunicationsAttemptsAdminPage() {
  return (
    <CommunicationsPageFrame
      dataPluginPage="communications-attempts"
      title="Delivery Attempts"
      description="Per-attempt telemetry for provider dispatch, transient failures, callback reconciliation, and suppression outcomes."
      sections={[
        {
          heading: "Reliability",
          body: "Inspect timeout, transient, permanent, and blocked outcomes with the exact provider route and attempt number."
        },
        {
          heading: "Recovery",
          body: "Use attempt history to decide whether a retry should be queued again or moved to a dead-letter state."
        }
      ]}
    />
  );
}

export function CommunicationsEndpointsAdminPage() {
  return (
    <CommunicationsPageFrame
      dataPluginPage="communications-endpoints"
      title="Delivery Endpoints"
      description="Governed email addresses, phone numbers, push tokens, and other destinations that can be reused safely across messages."
      sections={[
        {
          heading: "Destination Control",
          body: "Register canonical endpoints so each message can preserve an immutable snapshot without hard-coding delivery details."
        },
        {
          heading: "Provider Routing",
          body: "Review which local or future external route each endpoint will use before a message enters the dispatch path."
        }
      ]}
    />
  );
}

export function CommunicationsPreferencesAdminPage() {
  return (
    <CommunicationsPageFrame
      dataPluginPage="communications-preferences"
      title="Delivery Preferences"
      description="Channel-level suppression and digest settings that are enforced before dispatch and reflected in the audit trail."
      sections={[
        {
          heading: "Suppression",
          body: "Disabled channels fail closed and record a suppression attempt instead of silently dropping communication intent."
        },
        {
          heading: "Digest Policy",
          body: "Digest mode is reserved for email and in-app delivery and can be toggled per subject without rewriting message producers."
        }
      ]}
    />
  );
}

export function CommunicationsHealthAdminPage() {
  return (
    <CommunicationsPageFrame
      dataPluginPage="communications-health"
      title="Provider Health"
      description="Deterministic local provider routes and future connector surfaces that drive retry, callback, and dead-letter decisions."
      sections={[
        {
          heading: "Local Routes",
          body: "Exercise success, callback, timeout, transient, and permanent-failure paths without live external provider credentials."
        },
        {
          heading: "Operational Signals",
          body: "Track route-level failures, callback lag, and stale queued work before rollout traffic depends on an external connector fleet."
        }
      ]}
    />
  );
}

export function NotificationsCoreAdminPage() {
  return (
    <CommunicationsPageFrame
      dataPluginPage="notifications-core"
      title="Notifications Core"
      description="Compatibility surface for existing notification operators, now backed by the canonical communications workspace."
      sections={[
        {
          heading: "Compatibility",
          body: "This route remains available for existing bookmarks while the canonical workspace lives under /admin/communications/messages."
        },
        {
          heading: "Canonical Surface",
          body: "Use the communications workspace for message, attempt, endpoint, preference, and provider health operations."
        }
      ]}
    />
  );
}

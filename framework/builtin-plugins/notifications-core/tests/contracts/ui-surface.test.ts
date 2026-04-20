import { describe, expect, it } from "bun:test";

import { adminContributions } from "../../src/ui/admin.contributions";
import { uiSurface } from "../../src/ui/surfaces";

describe("ui surface registration", () => {
  it("keeps a compatibility admin page for notification operations", () => {
    expect(uiSurface.embeddedPages).toHaveLength(1);
    expect(uiSurface.embeddedPages[0]?.route).toBe("/admin/notifications-core");
  });

  it("registers communication workspaces, pages, and commands", () => {
    expect(adminContributions.workspaces[0]?.id).toBe("communications");
    expect(adminContributions.pages.map((page) => page.route)).toContain("/admin/communications/messages");
    expect(adminContributions.pages.map((page) => page.route)).toContain("/admin/communications/attempts");
    expect(adminContributions.pages.map((page) => page.route)).toContain("/admin/communications/endpoints");
    expect(adminContributions.pages.map((page) => page.route)).toContain("/admin/communications/preferences");
    expect(adminContributions.pages.map((page) => page.route)).toContain("/admin/communications/health");
    expect(adminContributions.commands.map((command) => command.href)).toContain("/admin/communications/messages");
  });
});

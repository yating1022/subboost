import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function mockPrimitive(tag: keyof React.JSX.IntrinsicElements, displayName: string) {
  const Component = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
    ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
  );
  Component.displayName = displayName;
  return Component;
}

vi.mock("@radix-ui/react-label", () => ({ Root: mockPrimitive("label", "LabelRoot") }));

import { Label } from "./label";
import { ProtocolBadge, getProtocolBadgeClass } from "./protocol-badge";
import { Textarea } from "./textarea";

describe("additional basic UI components", () => {
  it("renders label, textarea, protocol badges, and safe images", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(Label, { htmlFor: "name", className: "label-extra" }, "Name"),
        React.createElement(Textarea, { placeholder: "Write", className: "textarea-extra", readOnly: true }),
        React.createElement(ProtocolBadge, { type: "VMess", className: "badge-extra" }),
      )
    );

    expect(html).toContain("label-extra");
    expect(html).toContain("Name");
    expect(html).toContain("textarea-extra");
    expect(html).toContain("placeholder=\"Write\"");
    expect(html).toContain("VMess");
    expect(html).toContain("badge-extra");
  });

  it("computes protocol badge classes", () => {
    expect(getProtocolBadgeClass(" vmess ")).toContain("purple");
    expect(getProtocolBadgeClass("unknown")).toContain("slate");
  });
});

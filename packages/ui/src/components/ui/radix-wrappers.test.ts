import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Switch } from "./switch";

vi.mock("@radix-ui/react-dialog", async () => {
  const React = await import("react");

  const createPrimitive = (tag: keyof React.JSX.IntrinsicElements, displayName: string) => {
    const Component = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
      ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
    );
    Component.displayName = displayName;
    return Component;
  };

  const Root = ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children);
  Root.displayName = "DialogRoot";

  return {
    Root,
    Trigger: createPrimitive("button", "DialogTrigger"),
    Portal: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    Close: createPrimitive("button", "DialogClose"),
    Overlay: createPrimitive("div", "DialogOverlay"),
    Content: createPrimitive("div", "DialogContent"),
    Title: createPrimitive("h2", "DialogTitle"),
    Description: createPrimitive("p", "DialogDescription"),
  };
});

describe("Radix UI wrappers", () => {
  it("renders dialog and switch wrappers with merged classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(
          Dialog,
          { open: true },
          React.createElement(DialogTrigger, null, "Open"),
          React.createElement(
            DialogContent,
            { className: "dialog-extra" },
            React.createElement(DialogHeader, { className: "header-extra" }, React.createElement(DialogTitle, null, "Title")),
            React.createElement(DialogDescription, null, "Description"),
            React.createElement(DialogFooter, { className: "footer-extra" }, "Footer")
          )
        ),
        React.createElement(Switch, { checked: true, className: "switch-extra" })
      )
    );

    expect(html).toContain("dialog-extra");
    expect(html).toContain("关闭");
    expect(html).toContain("header-extra");
    expect(html).toContain("footer-extra");
    expect(html).toContain("switch-extra");
  });
});

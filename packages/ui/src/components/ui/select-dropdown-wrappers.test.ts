import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function mockPrimitive(tag: keyof React.JSX.IntrinsicElements, displayName: string) {
  const Component = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & { sideOffset?: number }
  >(
    ({ children, sideOffset: _sideOffset, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
  );
  Component.displayName = displayName;
  return Component;
}

vi.mock("@radix-ui/react-select", () => {
  const Root = ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children);
  Root.displayName = "SelectRoot";

  return {
    Root,
    Group: mockPrimitive("div", "SelectGroup"),
    Value: mockPrimitive("span", "SelectValue"),
    Trigger: mockPrimitive("button", "SelectTrigger"),
    Icon: ({ children }: React.PropsWithChildren<{ asChild?: boolean }>) => React.createElement("span", null, children),
    Portal: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    Content: mockPrimitive("div", "SelectContent"),
    Viewport: mockPrimitive("div", "SelectViewport"),
    ScrollUpButton: mockPrimitive("button", "SelectScrollUpButton"),
    ScrollDownButton: mockPrimitive("button", "SelectScrollDownButton"),
    Label: mockPrimitive("div", "SelectLabel"),
    Item: mockPrimitive("div", "SelectItem"),
    ItemIndicator: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children),
    ItemText: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children),
    Separator: mockPrimitive("hr", "SelectSeparator"),
  };
});

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

describe("select wrappers", () => {
  it("renders select wrappers with viewport, scroll buttons, and merged classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Select,
        null,
        React.createElement(
          SelectTrigger,
          { className: "trigger-extra" },
          React.createElement(SelectValue, null, "Choose")
        ),
        React.createElement(
          SelectContent,
          { className: "content-extra", position: "popper" },
          React.createElement(
            SelectGroup,
            null,
            React.createElement(SelectLabel, { className: "label-extra" }, "Options"),
            React.createElement(SelectItem, { value: "one", className: "item-extra" }, "One"),
            React.createElement(SelectSeparator, { className: "separator-extra" })
          )
        ),
        React.createElement(SelectScrollUpButton, { className: "up-extra" }),
        React.createElement(SelectScrollDownButton, { className: "down-extra" })
      )
    );

    expect(html).toContain("Choose");
    expect(html).toContain("Options");
    expect(html).toContain("One");
    expect(html).toContain("trigger-extra");
    expect(html).toContain("content-extra");
    expect(html).toContain("label-extra");
    expect(html).toContain("item-extra");
    expect(html).toContain("up-extra");
    expect(html).toContain("down-extra");
  });
});

import { afterAll, describe, expect, mock, test } from "bun:test";
import { dirname } from "node:path";
import { Window } from "happy-dom";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  OverlayCloseButtonVisual,
  OverlayHeader,
  OverlayHeaderAction,
} from "../src/components/overlay-header";

const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", import.meta.dir)));

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

const win = new Window({ url: "http://localhost/" });
const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "MutationObserver",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

const previousGlobals = Object.fromEntries(
  DOM_KEYS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
);

Object.assign(globalThis, {
  window: win,
  document: win.document,
  Document: win.Document,
  ShadowRoot: win.ShadowRoot,
  HTMLElement: win.HTMLElement,
  Element: win.Element,
  Node: win.Node,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  PointerEvent: win.PointerEvent,
  KeyboardEvent: win.KeyboardEvent,
  MutationObserver: win.MutationObserver,
  navigator: win.navigator,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { Sheet, SheetAction, SheetContent, SheetDescription, SheetHeader, SheetTitle } =
  await import("../src/components/sheet");
const { Dialog, DialogAction, DialogContent, DialogDescription, DialogHeader, DialogTitle } =
  await import("../src/components/dialog");
const { AlertDialog, AlertDialogContent, AlertDialogTitle } =
  await import("../src/components/alert-dialog");
const { Drawer, DrawerAction, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } =
  await import("../src/components/drawer");

afterAll(() => {
  for (const key of DOM_KEYS) {
    (globalThis as Record<string, unknown>)[key] = previousGlobals[key];
  }
  win.close();
});

async function renderInDom(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });

  return {
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("OverlayHeader", () => {
  test("reserves trailing close-button clearance only when hasCloseButton is true", () => {
    const sheetWithClose = renderToStaticMarkup(
      <OverlayHeader surface="sheet" hasCloseButton>
        <span>Title</span>
      </OverlayHeader>,
    );
    expect(sheetWithClose).toContain('data-slot="sheet-header"');
    expect(sheetWithClose).toContain("[&amp;:not(.sr-only)]:pe-16");
    expect(sheetWithClose).toContain("sm:[&amp;:not(.sr-only)]:pe-18");

    const sheetWithoutClose = renderToStaticMarkup(
      <OverlayHeader surface="sheet" hasCloseButton={false}>
        <span>Title</span>
      </OverlayHeader>,
    );
    expect(sheetWithoutClose).not.toContain("pe-16");
    expect(sheetWithoutClose).not.toContain("pe-18");

    const dialogWithClose = renderToStaticMarkup(
      <OverlayHeader surface="dialog" hasCloseButton>
        <span>Title</span>
      </OverlayHeader>,
    );
    expect(dialogWithClose).toContain('data-slot="dialog-header"');
    expect(dialogWithClose).toContain("[&amp;:not(.sr-only)]:pe-12");

    const drawerWithClose = renderToStaticMarkup(
      <OverlayHeader surface="drawer" hasCloseButton>
        <span>Title</span>
      </OverlayHeader>,
    );
    expect(drawerWithClose).toContain('data-slot="drawer-header"');
    expect(drawerWithClose).toContain("[&amp;:not(.sr-only)]:pe-16");
  });

  test("positions close button and action slots using logical end alignment", () => {
    const actionHtml = renderToStaticMarkup(
      <OverlayHeaderAction surface="sheet">
        <button type="button">Edit</button>
      </OverlayHeaderAction>,
    );
    expect(actionHtml).toContain('data-slot="sheet-action"');
    expect(actionHtml).toContain("col-start-2");

    const closeHtml = renderToStaticMarkup(<OverlayCloseButtonVisual surface="sheet" />);
    expect(closeHtml).toContain("end-5");
    expect(closeHtml).toContain("sm:end-6");
    expect(closeHtml).not.toContain("right-4");
  });
});

describe("Sheet, Dialog, and Drawer headers", () => {
  test("SheetHeader clears SheetClose by default and drops clearance when showCloseButton is false", async () => {
    const openSheet = await renderInDom(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Operations portal migration</SheetTitle>
            <SheetDescription>Sora Manufacturing</SheetDescription>
            <SheetAction>
              <span>Active</span>
            </SheetAction>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    try {
      const header = document.body.querySelector('[data-slot="sheet-header"]');
      const close = document.body.querySelector('[data-slot="sheet-close"]');
      const action = document.body.querySelector('[data-slot="sheet-action"]');
      expect(header?.className).toContain("[&:not(.sr-only)]:pe-16");
      expect(header?.className).toContain("sm:[&:not(.sr-only)]:pe-18");
      expect(close?.className).toContain("end-5");
      expect(close?.className).toContain("sm:end-6");
      expect(action?.className).toContain("col-start-2");
    } finally {
      await openSheet.cleanup();
    }

    const noCloseSheet = await renderInDom(
      <Sheet open>
        <SheetContent showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>Operations portal migration</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    try {
      const header = document.body.querySelector('[data-slot="sheet-header"]');
      const close = document.body.querySelector('[data-slot="sheet-close"]');
      expect(header?.className).not.toContain("pe-16");
      expect(header?.className).not.toContain("pe-18");
      expect(close).toBeNull();
    } finally {
      await noCloseSheet.cleanup();
    }
  });

  test("DialogHeader clears DialogClose by default and drops clearance when showCloseButton is false", async () => {
    const openDialog = await renderInDom(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import customers</DialogTitle>
            <DialogDescription>Upload a CSV or Excel sheet.</DialogDescription>
            <DialogAction>
              <span>v2</span>
            </DialogAction>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    try {
      const header = document.body.querySelector('[data-slot="dialog-header"]');
      const close = document.body.querySelector('[data-slot="dialog-close"]');
      const action = document.body.querySelector('[data-slot="dialog-action"]');
      expect(header?.className).toContain("[&:not(.sr-only)]:pe-12");
      expect(close?.className).toContain("end-6");
      expect(action?.className).toContain("col-start-2");
    } finally {
      await openDialog.cleanup();
    }

    const noCloseDialog = await renderInDom(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Command Palette</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    try {
      const header = document.body.querySelector('[data-slot="dialog-header"]');
      const close = document.body.querySelector('[data-slot="dialog-close"]');
      expect(header?.className).not.toContain("pe-12");
      expect(close).toBeNull();
    } finally {
      await noCloseDialog.cleanup();
    }
  });

  test("DrawerHeader clears DrawerClose only when showCloseButton is enabled", async () => {
    const defaultDrawer = await renderInDom(
      <Drawer open>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
            <DrawerDescription>Filter records</DrawerDescription>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>,
    );

    try {
      const header = document.body.querySelector('[data-slot="drawer-header"]');
      const close = document.body.querySelector('[data-slot="drawer-close"]');
      expect(header?.className).not.toContain("pe-16");
      expect(close).toBeNull();
    } finally {
      await defaultDrawer.cleanup();
    }

    const closeableDrawer = await renderInDom(
      <Drawer open>
        <DrawerContent showCloseButton>
          <DrawerHeader>
            <DrawerTitle>Filters</DrawerTitle>
            <DrawerDescription>Filter records</DrawerDescription>
            <DrawerAction>
              <span>Reset</span>
            </DrawerAction>
          </DrawerHeader>
        </DrawerContent>
      </Drawer>,
    );

    try {
      const header = document.body.querySelector('[data-slot="drawer-header"]');
      const close = document.body.querySelector('[data-slot="drawer-close"]');
      const action = document.body.querySelector('[data-slot="drawer-action"]');
      expect(header?.className).toContain("[&:not(.sr-only)]:pe-16");
      expect(close?.className).toContain("end-4");
      expect(action?.className).toContain("col-start-2");
    } finally {
      await closeableDrawer.cleanup();
    }
  });

  test("Dialog and AlertDialog overlays use starting/ending transitions without animate-out", async () => {
    const dialogView = await renderInDom(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Confirm</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    try {
      const overlay = document.body.querySelector('[data-slot="dialog-overlay"]');
      const content = document.body.querySelector('[data-slot="dialog-content"]');
      expect(overlay?.className).toContain("data-ending-style:opacity-0");
      expect(overlay?.className).not.toContain("animate-out");
      expect(content?.className).toContain("data-ending-style:opacity-0");
      expect(content?.className).not.toContain("animate-out");
    } finally {
      await dialogView.cleanup();
    }

    const alertView = await renderInDom(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    );
    try {
      const overlay = document.body.querySelector('[data-slot="alert-dialog-overlay"]');
      const content = document.body.querySelector('[data-slot="alert-dialog-content"]');
      expect(overlay?.className).toContain("data-ending-style:opacity-0");
      expect(overlay?.className).not.toContain("animate-out");
      expect(content?.className).toContain("data-ending-style:opacity-0");
      expect(content?.className).not.toContain("animate-out");
    } finally {
      await alertView.cleanup();
    }
  });
});

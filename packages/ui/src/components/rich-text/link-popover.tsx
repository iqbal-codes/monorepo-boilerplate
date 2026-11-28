import * as React from "react";
import type { Editor } from "@tiptap/core";
import { Link2Icon, UnlinkIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Field, FieldError, FieldLabel } from "@monorepo-boilerplate/ui/components/field";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@monorepo-boilerplate/ui/components/popover";

import { sanitizeLinkHref } from "./serialize";

function normalizeUserHref(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    return sanitizeLinkHref(trimmed);
  }
  return sanitizeLinkHref(`https://${trimmed}`);
}

export function RichTextLinkPopover({
  editor,
  active,
  disabled,
  trigger,
}: {
  editor: Editor | null;
  active: boolean;
  disabled?: boolean;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  const [urlValue, setUrlValue] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const urlInputId = React.useId();
  const unavailable = disabled || !editor;

  React.useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      if (unavailable || !editor.isEditable) return;
      const currentHref = editor.getAttributes("link").href;
      setUrlValue(typeof currentHref === "string" ? currentHref : "");
      setErrorMessage(null);
    }
    setOpen(nextOpen);
  }

  function handleApply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The popover is portaled, but React still bubbles the submit to its parent form.
    event.stopPropagation();
    if (!open || unavailable || !editor.isEditable) return;

    const trimmed = urlValue.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setOpen(false);
      return;
    }

    const safeHref = normalizeUserHref(trimmed);
    if (!safeHref) {
      setErrorMessage("Enter a valid http(s), mailto, or relative URL.");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: safeHref }).run();
    setOpen(false);
  }

  function handleUnlink() {
    if (!open || unavailable || !editor.isEditable) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  }

  return (
    <Popover open={open && !unavailable} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} disabled={unavailable} aria-disabled={unavailable} />
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <form onSubmit={handleApply} noValidate className="flex flex-col gap-3">
          <Field data-invalid={Boolean(errorMessage) || undefined} className="gap-1.5">
            <FieldLabel htmlFor={urlInputId} className="text-xs font-semibold uppercase">
              Link URL
            </FieldLabel>
            <Input
              id={urlInputId}
              type="text"
              inputMode="url"
              disabled={unavailable}
              placeholder="https://example.com"
              value={urlValue}
              aria-invalid={Boolean(errorMessage) || undefined}
              onChange={(event) => {
                setUrlValue(event.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
            />
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
          </Field>

          <div className="flex items-center justify-end gap-1.5">
            {active ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={unavailable}
                onClick={handleUnlink}
              >
                <UnlinkIcon data-icon="inline-start" aria-hidden="true" />
                Remove
              </Button>
            ) : null}
            <Button type="submit" size="xs" disabled={unavailable}>
              <Link2Icon data-icon="inline-start" aria-hidden="true" />
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

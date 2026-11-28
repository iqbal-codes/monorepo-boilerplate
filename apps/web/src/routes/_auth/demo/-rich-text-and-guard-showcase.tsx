import { useState } from "react";
import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@monorepo-boilerplate/ui/components/card";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
} from "@monorepo-boilerplate/ui/components/code-block";
import { FieldGroup } from "@monorepo-boilerplate/ui/components/field";
import { Form, UnsavedChangesGuard, useAppForm } from "@monorepo-boilerplate/ui/components/form";
import {
  EMPTY_RICH_TEXT_DOC,
  RichTextField,
  RichTextViewer,
  toMarkdown,
  toPlainText,
  type JSONContent,
} from "@monorepo-boilerplate/ui/components/rich-text";
import { Separator } from "@monorepo-boilerplate/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@monorepo-boilerplate/ui/components/tabs";
import { toast } from "sonner";
import z from "zod";

const SAMPLE_RICH_TEXT_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Quarterly Release Brief" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Structured content is stored as " },
        { type: "text", text: "ProseMirror JSONContent", marks: [{ type: "bold" }] },
        { type: "text", text: " with " },
        { type: "text", text: "safe inline marks", marks: [{ type: "italic" }] },
        { type: "text", text: ", " },
        { type: "text", text: "toMarkdown()", marks: [{ type: "code" }] },
        { type: "text", text: ", and " },
        {
          type: "text",
          text: "documented APIs",
          marks: [{ type: "link", attrs: { href: "https://tiptap.dev" } }],
        },
        { type: "text", text: "." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Isolated behind @monorepo-boilerplate/ui/components/rich-text",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Slash commands (type '/') and selection bubble menu" },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Never serialize or inject raw HTML across boundaries." },
          ],
        },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [
        { type: "text", text: "const plain = toPlainText(doc);\nconst md = toMarkdown(doc);" },
      ],
    },
  ],
};

const LABEL_SUGGESTIONS: ReadonlyArray<string> = [
  "TypeScript",
  "TanStack Form",
  "Base UI",
  "Tiptap",
  "ProseMirror",
  "Accessibility",
];

const richTextShowcaseSchema = z.object({
  labels: z.array(z.string()).min(1, "Add at least one label."),
  document: z.custom<JSONContent>(
    (val) => toPlainText(val as JSONContent | undefined).trim().length >= 12,
    "Enter at least 12 plain-text characters.",
  ),
});

export function RichTextAndGuardShowcase() {
  const [editorDisabled, setEditorDisabled] = useState(false);
  const [resetRevision, setResetRevision] = useState(0);

  // An explicit reset ends the editing session even if Undo already restored the sample.
  function restartEditor() {
    setResetRevision((revision) => revision + 1);
  }

  const form = useAppForm({
    defaultValues: {
      labels: ["Tiptap", "JSONContent"],
      document: SAMPLE_RICH_TEXT_DOC,
    },
    validators: {
      onChange: richTextShowcaseSchema,
      onSubmit: richTextShowcaseSchema,
    },
    onSubmit: ({ value }) => {
      const length = toPlainText(value.document).trim().length;
      toast.success("Rich text validated", {
        description: `${value.labels.length} label(s) · ${length} plain-text chars`,
      });
    },
  });

  return (
    <UnsavedChangesGuard
      form={form}
      title="Discard rich-text edits?"
      description="You have unsaved edits in the Rich Text & TagField showcase. Discarding will reset the form."
      onDiscard={() => {
        form.reset();
        restartEditor();
        toast.info("Edits discarded");
      }}
    >
      {({ isDirty, requestClose }) => (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle>RichTextField, TagField &amp; UnsavedChangesGuard</CardTitle>
                  <CardDescription>
                    Subpath-isolated Tiptap editor bound to TanStack Form with JSONContent boundary
                    and dirty-state confirmation guard.
                  </CardDescription>
                </div>
                <Badge variant={isDirty ? "default" : "secondary"}>
                  {isDirty ? "Unsaved changes" : "Clean"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => form.setFieldValue("document", SAMPLE_RICH_TEXT_DOC)}
                >
                  Load sample
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => form.setFieldValue("document", EMPTY_RICH_TEXT_DOC)}
                >
                  Clear document
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={editorDisabled ? "secondary" : "outline"}
                  aria-pressed={editorDisabled}
                  onClick={() => setEditorDisabled((prev) => !prev)}
                >
                  {editorDisabled ? "Enable editor" : "Disable editor"}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    if (isDirty) requestClose();
                    else
                      toast.success("Clean leave", { description: "Form had no unsaved changes." });
                  }}
                >
                  Test leave guard
                </Button>
              </div>

              <Form form={form} aria-label="Rich text and guard demo">
                <form.FormError />
                <FieldGroup className="gap-5">
                  <form.AppField name="labels">
                    {(field) => (
                      <field.TagField
                        label="Document labels"
                        suggestions={LABEL_SUGGESTIONS}
                        placeholder="Add label…"
                        maxTags={6}
                        required
                      />
                    )}
                  </form.AppField>

                  <form.AppField name="document">
                    {() => (
                      <RichTextField
                        key={resetRevision}
                        label="Release brief"
                        description="Supports toolbar, text selection bubble menu, and '/' slash commands. Minimum 12 plain-text characters."
                        placeholder="Write release notes or type '/' for blocks…"
                        disabled={editorDisabled}
                        required
                      />
                    )}
                  </form.AppField>
                </FieldGroup>

                <div className="flex flex-wrap items-center gap-3">
                  <form.SubmitButton loadingLabel="Validating…">
                    Validate document
                  </form.SubmitButton>
                  <form.ResetButton onReset={restartEditor}>Reset</form.ResetButton>
                </div>
              </Form>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Live RichTextViewer &amp; Output Inspector</CardTitle>
              <CardDescription>
                Read-only React AST rendering without raw HTML injection, plus live JSONContent,
                toMarkdown(), and toPlainText() projections.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <form.Subscribe selector={(state) => state.values.document}>
                {(doc) => {
                  const jsonString = JSON.stringify(doc, null, 2);
                  const markdownString = toMarkdown(doc);
                  const plainTextString = toPlainText(doc);

                  return (
                    <>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">
                          Read-only RichTextViewer
                        </span>
                        <div className="min-h-32 border border-border bg-muted/20 p-3">
                          <RichTextViewer
                            value={doc}
                            emptyFallback="Document is empty — type in the editor or load the sample."
                          />
                        </div>
                      </div>

                      <Separator />

                      <Tabs defaultValue="json" className="gap-3">
                        <TabsList
                          aria-label="Document output format"
                          activateOnFocus
                          className="max-w-full justify-start overflow-x-auto pb-1.5"
                        >
                          <TabsTrigger className="flex-none" value="json">
                            JSONContent
                          </TabsTrigger>
                          <TabsTrigger className="flex-none" value="markdown">
                            toMarkdown()
                          </TabsTrigger>
                          <TabsTrigger className="flex-none" value="plain">
                            toPlainText()
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="json">
                          <CodeBlock size="sm">
                            <CodeBlockActions>
                              <CodeBlockCopyButton value={jsonString} />
                            </CodeBlockActions>
                            <CodeBlockContent className="max-h-72">{jsonString}</CodeBlockContent>
                          </CodeBlock>
                        </TabsContent>

                        <TabsContent value="markdown">
                          <CodeBlock size="sm">
                            <CodeBlockActions>
                              <CodeBlockCopyButton value={markdownString} />
                            </CodeBlockActions>
                            <CodeBlockContent className="max-h-72" wrap>
                              {markdownString || "(empty)"}
                            </CodeBlockContent>
                          </CodeBlock>
                        </TabsContent>

                        <TabsContent value="plain">
                          <CodeBlock size="sm">
                            <CodeBlockActions>
                              <CodeBlockCopyButton value={plainTextString} />
                            </CodeBlockActions>
                            <CodeBlockContent className="max-h-72" wrap>
                              {plainTextString || "(empty)"}
                            </CodeBlockContent>
                          </CodeBlock>
                        </TabsContent>
                      </Tabs>
                    </>
                  );
                }}
              </form.Subscribe>
            </CardContent>
          </Card>
        </div>
      )}
    </UnsavedChangesGuard>
  );
}

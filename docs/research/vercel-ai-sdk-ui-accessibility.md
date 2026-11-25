# Vercel AI SDK UI accessibility: human chat and agent-operable app surfaces

**Status:** research note, 2026-11-25. No application code was changed and no packages were installed.

**Scope:** (1) making the Assistant usable by people using keyboards, screen readers, zoom, and reduced motion; (2) helping a browser or tool-using agent operate the app through semantic UI or explicit tool contracts, without bypassing authorization or confirmation.

## Clarification: `ui-sdk.dev` is a different SDK

The original note evaluated [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui/overview), the chat state and streaming layer. [Vercel Labs UI SDK](https://ui-sdk.dev/docs) is a separate, beta library of headless UI behaviors and primitives (`@ui-sdk/core`, `@ui-sdk/react`), with a bridge for agents to inspect component state and call component actions ([source and beta status](https://github.com/vercel-labs/ui#install), [bridge docs](https://ui-sdk.dev/docs/agents/connect-an-agent)). Installing it does not automatically give existing Base UI/shadcn components a UI SDK state-and-action contract; that contract is documented for UI SDK components and custom `definePrimitive` components. The bridge can be wired to this app's Assistant tools or registered with a [WebMCP-capable browser](https://ui-sdk.dev/docs/agents/connect-an-agent/webmcp). Neither path replaces the existing chat runtime.

**Recommendation for this repo:** no dependency or migration now. For keyboard/screen-reader access or browser agents that already operate semantic HTML, improve and test the existing controls. For a small number of known app actions, use the existing [Assistant toolkit](../../apps/web/src/components/assistant/toolkit.tsx). If the product needs agents to inspect and manipulate the visible state of rich controls directly, pilot UI SDK on one new, non-sensitive Block (for example a multi-select filter); compare task success against the existing approach before replacing shared components. Keep [bridge permissions](https://ui-sdk.dev/docs/agents/connect-an-agent/permissions) and server-side authorization separate.

**Evidence labels used below**

- **Verified (source):** read directly in this worktree or in the installed package source. This is not browser or assistive-technology (AT) verification.
- **Documented:** stated by an official specification or vendor documentation.
- **Proposed:** a recommended change; not implemented or validated here.
- **Needs AT test:** cannot be settled from source; requires NVDA/JAWS/VoiceOver and browser testing.

The [lockfile](../../bun.lock) pins `ai@7.0.181`, `@ai-sdk/react@4.0.186`, `@assistant-ui/react@0.15.38`, and `@assistant-ui/ai-sdk@0.0.20`. The authenticated [Hono chat route](../../apps/server/src/routes/assistant.ts#L135-L216) sends a UI message stream to assistant-ui's `useChatRuntime` + `AssistantChatTransport` ([assistant-provider.tsx](../../apps/web/src/components/assistant/assistant-provider.tsx#L291-L306)). Keep that path when changing accessibility semantics; the [UI message stream protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) carries tool and data parts that a plain text stream cannot.

## 1. Bottom line

1. **AI SDK UI is a state layer, not an accessible chat widget.** `useChat` gives messages, `status`, typed parts, tool states, and approval actions; the application supplies every element, name, live region, focus move, and keyboard behavior. The official examples render plain `div`/`input`/`button` markup ([Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)).
2. **The current Assistant already has good raw material:** labelled composer, Send/Stop swap, alert + Retry on failure, labelled icon buttons, `aria-current` on the active thread, `motion-safe` animation variants, and a non-modal popover with dialog semantics. The main gaps are transcript semantics, restrained streaming announcements, keyboard access to scroll containers, message-level names, and approval UI.
3. **Do not migrate to AI Elements or a standalone `useChat`.** This repo is already on AI SDK v7 and assistant-ui. Vercel's legacy AI Elements registry is being deprecated at the end of November 2026 in favour of shadcn/ui patterns ([AI Elements introduction](https://elements.ai-sdk.dev/), [shadcn migration](https://ui.shadcn.com/docs/ai-elements#migrating-from-ai-sdk-elements)). Copied patterns are useful as design references; replacing the runtime would duplicate transport, history, attachments, and tool rendering.
4. **One substrate serves both audiences:** the computed accessibility tree, plus the DOM form semantics that WebMCP reads. Screen readers, Playwright role locators, ARIA snapshots, and agent-browser snapshots consume roles, names, states, and labels; WebMCP's declarative API derives parameters from form controls and their DOM labels, not from an exported accessibility tree ([Playwright locators](https://playwright.dev/docs/locators#locate-by-role), [WebMCP declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)).
5. **Recommended order:** human semantics and announcement hygiene first; then tool-state and approval UI with server-side policy; then a read-only WebMCP pilot for `get_current_screen`; only then one consequential, approvable operation. Read-only first, explicit IDs, human confirmation, and the existing server authorization path.

## 2. What AI SDK UI standardizes, and what it leaves to you

### 2.1 State and typed parts

`useChat` returns the current `messages`, an `error`, and a `status` of `submitted | streaming | ready | error`, plus actions such as `sendMessage`, `stop`, `regenerate`, `resumeStream`, `addToolOutput`, and `addToolApprovalResponse` ([useChat reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat#returns)).

A `UIMessage` is `{ id, role, parts, metadata? }`. Parts are typed and include `text`, `reasoning`, `file`, `source-url`, `source-document`, `data-*`, `step-start`, and typed tool parts named `tool-${toolName}`. Text and reasoning parts carry `state: 'streaming' | 'done'` ([UIMessage reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message#uimessagepart-types)). In the installed `ai` types, tool parts include `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error`, and `output-denied`; the docs show the same set in UI examples ([Chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#tool-execution-approval)).

**Accessibility consequence:** status and part state are enough to drive announcements, disabled states, and progress labels. They do not announce anything by themselves. A renderer that only paints `part.text` leaves screen readers with mutating text and no lifecycle signal.

A minimal, accessibility-aware render shape:

```tsx
const { messages, status, error } = useChat();

{
  messages.map((message) => (
    <article
      key={message.id}
      aria-label={message.role === "user" ? "Your message" : "Assistant message"}
    >
      {message.parts.map((part, index) => {
        if (part.type === "text") return <p key={index}>{part.text}</p>;
        if (part.type === "tool-search") {
          // render by part.state, not only by output
          return <ToolPart key={part.toolCallId} part={part} />;
        }
        return null;
      })}
    </article>
  ));
}
```

The `article`/name is a proposal; the SDK does not add it.

### 2.2 Tool states and approvals

Tool execution approval is configured with `toolApproval` on `streamText`/`ToolLoopAgent`, not the older per-tool `needsApproval` ([Tool approvals](https://ai-sdk.dev/docs/agents/tool-approvals), [Chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#tool-execution-approval)). Manual approval produces `state: 'approval-requested'`; the UI calls `addToolApprovalResponse({ id, approved, reason? })`. Automatic approvals and denials also use approval states but set `part.approval.isAutomatic === true`, so controls must be shown only when `isAutomatic` is not true. After a response, the part moves to `approval-responded`, then `output-available`, `output-error`, or `output-denied`.

The server route currently configures `frontendTools` and `get_runtime_info` with no approval policy ([assistant.ts](../../apps/server/src/routes/assistant.ts#L177-L203)). The tool fallback opens its disclosure for `status.type === "requires-action"` but renders no Approve/Deny controls and has no `approval-requested`/`approval-responded`/`output-denied` branch ([tool-ui.tsx](../../packages/ui/src/components/assistant/tool-ui.tsx#L151-L182)). Verified by source. So approval UI is future work, not an existing behavior.

Two implementation traps in this repo:

- `isAssistantMessageCompleteWithToolCalls` accepts only `output-available`/`output-error` for non-provider tools ([assistant-provider.tsx](../../apps/web/src/components/assistant/assistant-provider.tsx#L260-L289)). An approval-gated tool that has only reached `approval-responded` will not trigger the next automatic send. Extend the predicate for approval-bearing parts without regressing the current frontend-tool path, or use assistant-ui's approval gate rather than a second custom predicate. The assistant-ui AI SDK adapter forwards basic approval through the runtime's approval path ([assistant-ui AI SDK integration](https://www.assistant-ui.com/docs/api-reference/integrations/ai-sdk)).
- Approval is **not authorization**. The standard `useChat` pattern sends client-held history; a modified client can fabricate an approval. For sensitive tools, configure `experimental_toolApprovalSecret` on the server so approvals are HMAC-signed and revalidated, and still enforce the real permission and transaction rules server-side ([Tool approvals: security](https://ai-sdk.dev/docs/agents/tool-approvals#security-considerations)).

### 2.3 Generative UI

Generative UI maps a tool result to a React component by branching on `part.type === 'tool-${name}'` and `part.state` ([Generative user interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)). The accessibility obligation does not disappear because the model chose the component: every generated surface needs a name, role, state, keyboard path, and an error/empty state. Prefer a small allowlist of application components over rendering model-authored HTML. A weather card, table, or confirmation is still application UI and must meet the same standards as hand-written UI. Model output is untrusted content; do not let it inject markup or executable UI.

### 2.4 AI Elements is optional, and the legacy registry is sunsetting

AI Elements is a copy-in registry of chat presentation components, not a runtime or an accessibility certification. The old site states that the project “will be deprecated at the end of November 2026” and points to [shadcn/ui's AI Elements patterns](https://ui.shadcn.com/docs/ai-elements) ([Vercel AI Elements](https://elements.ai-sdk.dev/)). Verify copied components in the context where they render.

For this repo, treat shadcn's `Message`, `Chat`, `Tool`, `Confirmation`, and `Prompt Input` patterns as design references for spacing and state presentation. Do not add a second component/runtime stack beside assistant-ui.

## 3. Human accessibility: requirements, current evidence, changes

### 3.1 What the current source does and does not expose

| Area             | Verified current state                                                                                                                                                                                                                                                                                                                                                                                                                 | Consequence                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transcript       | `ThreadPrimitive.Viewport` renders a scrollable `div` with no role, name, or `tabIndex`; `ThreadPrimitive.Messages` renders message wrappers with no per-message accessible name ([assistant-thread.tsx](../../packages/ui/src/components/assistant/assistant-thread.tsx#L659-L676), [assistant-ui MessageRoot source](https://github.com/assistant-ui/assistant-ui/blob/main/packages/react/src/primitives/message/MessageRoot.tsx)). | Keyboard-only users may not be able to scroll long replies; screen-reader users get an unnamed stream of text and cannot jump between “your message” and “assistant message.”                                                                             |
| Thinking status  | `role="status"` + `aria-live="polite"` on the container; the elapsed `1s`, `2s`, … text is inside that live region ([thinking-indicator.tsx](../../packages/ui/src/components/assistant/thinking-indicator.tsx#L45-L79)).                                                                                                                                                                                                              | Likely per-second announcements, which interrupt and add no information (Proposed risk; **Needs AT test**).                                                                                                                                               |
| Streaming answer | No live region or `aria-busy` around the in-flight assistant message.                                                                                                                                                                                                                                                                                                                                                                  | Screen readers may hear nothing, or may be moved by DOM mutations depending on AT; behavior is not defined by the SDK. **Needs AT test.**                                                                                                                 |
| Modal            | Base UI `Popover.Popup` renders `role="dialog"`, non-modal by default, with focus management and focus return; the app adds `aria-labelledby` to the visible heading and auto-opens on `thread.runStart` ([assistant-modal.tsx](../../packages/ui/src/components/assistant/assistant-modal.tsx#L198-L248); installed `@base-ui/react@1.9.0` source).                                                                                   | Dialog semantics are present, but auto-open/focus behavior and view-switch focus are unverified. A non-modal popover is not a modal dialog: do not add `aria-modal`, and do not trap focus.                                                               |
| Errors           | Message error is `role="alert"` with Retry; attachment errors are `role="alert"` with a labelled dismiss button ([assistant-thread.tsx](../../packages/ui/src/components/assistant/assistant-thread.tsx#L535-L554); [assistant-thread.tsx](../../packages/ui/src/components/assistant/assistant-thread.tsx#L700-L722)).                                                                                                                | Good baseline; alerts are assertive and should not be duplicated by a second announcement.                                                                                                                                                                |
| Tool disclosure  | Collapsible trigger is a button; running/complete labels change; failure has `role="img" aria-label="Failed"`, success icon is `aria-hidden` ([tool-call.tsx](../../packages/ui/src/components/assistant/tool-call.tsx#L31-L87)).                                                                                                                                                                                                      | Disclosure is keyboard-operable; state changes are visual/textual but not announced.                                                                                                                                                                      |
| Thread list      | `ThreadListItemPrimitive.Root` sets `aria-current="true"` on the active thread (installed assistant-ui source; [ThreadListItemRoot](https://github.com/assistant-ui/assistant-ui/blob/main/packages/react/src/primitives/threadListItem/ThreadListItemRoot.tsx)), and search/actions are labelled ([assistant-thread-list.tsx](../../packages/ui/src/components/assistant/assistant-thread-list.tsx#L74-L102)).                        | Selection is programmatically exposed. Rename commits on blur without an explicit Save/Cancel ([assistant-thread-list.tsx](../../packages/ui/src/components/assistant/assistant-thread-list.tsx#L74-L88)), which is surprising for keyboard and AT users. |
| Markdown         | Model-generated headings become real `h1`–`h3`; tables and `<pre>` use `overflow-x-auto` without `tabIndex` ([markdown-text.tsx](../../packages/ui/src/components/assistant/markdown-text.tsx#L45-L121)).                                                                                                                                                                                                                              | Heading navigation includes model output, so level scoping and the page's own `h1` need review; horizontally overflowing code/tables may be unreachable by keyboard.                                                                                      |

### 3.2 The core design: a quiet log plus a small status channel

`role="log"` is the natural ARIA role for a chat transcript: “a type of live region where new information is added in meaningful order,” with chat logs as an example, and an implicit `aria-live="polite"` ([WAI-ARIA 1.2 `log`](https://www.w3.org/TR/wai-aria-1.2/#log)). Token streaming complicates that default: `aria-relevant` defaults to `additions text`, and a renderer may mutate one text node, replace nodes, or batch updates. How often an assistive technology treats the region as changed therefore varies by renderer and AT; a polite log can announce repeatedly in one pairing and only at the end in another. Test rather than assuming ([`aria-relevant`](https://www.w3.org/TR/wai-aria-1.2/#aria-relevant)).

A practical pattern, to validate with real AT:

```tsx
// Transcript: named, focusable, ordered, but not per-token live.
<ThreadPrimitive.Viewport
  role="log"
  aria-label="Assistant conversation"
  aria-live="off"          // explicit override; see note below
  tabIndex={0}
  className="... focus-visible:ring-2 focus-visible:ring-ring/40"
>
  <ThreadPrimitive.Messages>{/* ... */}</ThreadPrimitive.Messages>
</ThreadPrimitive.Viewport>

// One restrained status channel for lifecycle changes.
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {announcement} {/* "Assistant is responding", "Reply complete", "Reply stopped", "Reply failed" */}
</div>
```

Why `aria-live="off"` rather than relying on the implicit polite value: the goal is to avoid announcing every token, while keeping the log navigable and semantically ordered. The status channel announces state transitions, not content. If you prefer to keep the log live, scope live behavior to appended message boundaries and test announcement volume; do not mark the whole streaming message as atomic. If overriding the log's implicit live behavior is unacceptable, use a named `region` for the transcript instead and keep the same status channel; the trade-off is losing the log role's ordered-live semantics. This is a **Proposed** pattern, not a claim that one setting works in every AT/browser pair.

Set `aria-busy="true"` on the in-flight message (and on the live region, if you use one) and clear it when the part reaches `done`/`output-available`/`output-error`. ARIA explicitly allows assistive technologies to “wait until the modifications are complete” and process the busy period as one update ([`aria-busy`](https://www.w3.org/TR/wai-aria-1.2/#aria-busy)). Do not leave `aria-busy="true"` on a permanent transcript region; that can suppress exactly the final update you want.

Announcement text should describe state, not read the answer:

- on submit: “Message sent. Assistant is responding.”
- on first tool use: “Assistant is using <tool label>.” (debounced; do not announce every token/step)
- on completion: “Assistant reply complete.” plus a single “Jump to latest reply” control if the viewport is scrolled away.
- on stop/error: “Reply stopped.” / “Reply failed. Retry is available.”

This is designed to meet the WCAG 4.1.3 requirement that status messages be programmatically determinable without receiving focus ([WCAG 2.2 §4.1.3](https://www.w3.org/TR/WCAG22/#status-messages); [ARIA22 technique](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22)). Markup alone does not prove conformance; verify with AT. It also follows the `status` role's guidance that a status should not receive focus as a result of the change ([WAI-ARIA `status`](https://www.w3.org/TR/wai-aria-1.2/#status)).

### 3.3 Requirements-to-change map

| WCAG 2.2 / ARIA requirement                                                                                                                                                                                                                        | Current evidence                                                                                                      | Proposed change                                                                                                                                                                                                                                                                  | How to verify                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **1.3.1 Info and Relationships**, **4.1.2 Name, Role, Value** ([1.3.1](https://www.w3.org/TR/WCAG22/#info-and-relationships), [4.1.2](https://www.w3.org/TR/WCAG22/#name-role-value))                                                              | Transcript and messages are generic `div`s; no message names.                                                         | Named `role="log"` transcript; `role="article"` + `aria-label="Your message"`/`"Assistant message"` per message; keep stable message keys.                                                                                                                                       | Playwright `getByRole('log', { name: 'Assistant conversation' })`; manual rotor/landmark navigation. |
| **2.1.1 Keyboard**, **2.4.7 Focus Visible** ([2.1.1](https://www.w3.org/TR/WCAG22/#keyboard), [2.4.7](https://www.w3.org/TR/WCAG22/#focus-visible))                                                                                                | Scrollable transcript, table wrapper, and `<pre>` have no focus target.                                               | `tabIndex={0}` + visible focus on the transcript and on horizontal overflow regions; keep native buttons/links.                                                                                                                                                                  | Tab/Shift+Tab and PageUp/PageDown through a long reply; test at 200% zoom.                           |
| **4.1.3 Status Messages**, **2.2.2 Pause, Stop, Hide** ([4.1.3](https://www.w3.org/TR/WCAG22/#status-messages), [2.2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide))                                                                            | Thinking indicator is live and includes an elapsed timer; no answer lifecycle announcement.                           | Separate timer from the live label (`aria-hidden` on elapsed, or render it outside the status node); add one polite lifecycle status; keep Stop available.                                                                                                                       | NVDA/JAWS/VoiceOver announcement log; confirm no per-second chatter.                                 |
| **2.4.3 Focus Order**, **3.2.1 On Focus**, **2.4.11 Focus Not Obscured** ([2.4.3](https://www.w3.org/TR/WCAG22/#focus-order), [3.2.1](https://www.w3.org/TR/WCAG22/#on-focus), [2.4.11](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)) | Non-modal dialog with heading name; auto-opens on run start; thread/list view switches do not move focus.             | Do not steal focus when a background run opens the panel; on explicit view switch, move focus to the new view's heading/search and restore to the toggle on return; verify Escape closes and focus returns to the trigger.                                                       | Browser keyboard run; inspect `document.activeElement`; Playwright focus assertions.                 |
| **3.3.1 Error Identification** ([3.3.1](https://www.w3.org/TR/WCAG22/#error-identification))                                                                                                                                                       | Error alert includes text and Retry; attachment error includes text and dismiss.                                      | Keep `role="alert"`; ensure one announcement per failure; associate field errors with the composer/attachment control where applicable.                                                                                                                                          | Force a network failure and an attachment rejection; listen with AT.                                 |
| **4.1.2 / 4.1.3 for tools**                                                                                                                                                                                                                        | Collapsible trigger with changing visible label; failure icon has a name; no live announcement of completion.         | Include the state in the trigger's accessible name (for example “Search customers, running” / “Search customers, failed”); announce tool completion once via the status channel; keep `aria-expanded` from the Collapsible.                                                      | Playwright `getByRole('button', { name: /Search customers/ })`; AT run during a tool call.           |
| **2.5.7 Dragging Movements**, **2.5.8 Target Size** ([2.5.7](https://www.w3.org/TR/WCAG22/#dragging-movements), [2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum))                                                                        | File dropzone has an Add attachment button/file picker; icon buttons are mostly `size-7`/`size-8`; some are `size-5`. | Keep the non-drag path; verify the smallest controls are at least 24×24 CSS px or have adequate spacing; do not make hover the only way to reveal an action.                                                                                                                     | Computed-size check in browser at mobile width.                                                      |
| **1.4.13 Content on Hover or Focus** ([1.4.13](https://www.w3.org/TR/WCAG22/#content-on-hover-or-focus))                                                                                                                                           | Tooltips appear on hover/focus; message action bars are hover/focus-revealed but also visible on narrow layouts.      | Tooltip content must be dismissible, hoverable, and persistent; never put unique instructions only in a tooltip.                                                                                                                                                                 | Keyboard focus + Escape; pointer hover bridge.                                                       |
| **1.3.1 / 2.4.6 headings** ([2.4.6](https://www.w3.org/TR/WCAG22/#headings-and-labels))                                                                                                                                                            | Model Markdown emits real `h1`–`h3` headings into the page outline.                                                   | Keep semantic headings; scope or adjust their levels inside a message (for example map Markdown `h1`–`h3` to lower levels) so the App Shell keeps its own `h1` and the heading list stays navigable. Do not replace headings with styled paragraphs merely to quiet the outline. | Accessibility-tree/heading list inspection.                                                          |

### 3.4 Thread list and rename

The active thread already has `aria-current`, so do not add a second ad-hoc selected state. The larger risk is rename: `onBlur` commits, `Escape` cancels, and there is no visible Save button ([assistant-thread-list.tsx](../../packages/ui/src/components/assistant/assistant-thread-list.tsx#L74-L88)). A keyboard user who tabs away may commit an unintended title; a screen-reader user gets no explicit “saved” feedback. **Proposed:** explicit Save/Cancel buttons, keep Escape-to-cancel, and announce “Thread renamed” in the status channel. This is also easier for an agent: a named Save button is a stable action; blur is not.

### 3.5 What not to do

- Do not put `aria-live="assertive"` on the transcript or on each token. Assertive regions can clear the speech queue and are reserved for urgent alerts ([`aria-live`](https://www.w3.org/TR/wai-aria-1.2/#aria-live)).
- Do not move focus to the transcript on every new message. `status` changes should not steal focus; a “Jump to latest” control is better ([`status`](https://www.w3.org/TR/wai-aria-1.2/#status)).
- Do not add `aria-modal="true"` to the Assistant Modal. It is a non-modal popover; trapping focus or inerting the App Shell would be a false modal and would break the user's ability to keep working.
- Do not treat a passing ARIA snapshot as WCAG conformance. Playwright explicitly says role locators “do not replace accessibility audits and conformance tests” ([Playwright locators](https://playwright.dev/docs/locators)).

## 4. The second meaning: an application surface agents can operate

### 4.1 The shared substrate

Browsers compute an accessibility tree from the DOM; screen readers and automation both consume name, role, state, and value. Playwright's `getByRole()` “reflects how users and assistive technology perceive the page” and recommends user-facing locators over `data-testid`; `getByTestId()` is “not user facing” and should be a fallback ([Playwright locators](https://playwright.dev/docs/locators#locate-by-role)). Playwright ARIA snapshots serialize that tree as YAML (`- role "name" [state]`) and can assert a page or a locator ([Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots)). agent-browser's `snapshot` returns the accessibility tree with refs and explicitly recommends re-snapshotting after navigation or DOM replacement ([agent-browser snapshots](https://agent-browser.dev/snapshots)). Playwright MCP packages the same idea as agent tools: `browser_snapshot` captures an accessibility snapshot, and actions take an element reference from it ([Playwright MCP](https://github.com/microsoft/playwright-mcp)). It is a useful generic operator and test harness, but it cannot express business semantics, atomicity, or policy; those still belong to an explicit tool contract.

So the human fixes above are also the agent fixes:

| Human-facing change                                          | Agent-facing benefit                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Named `log`/`region` for the conversation                    | Stable scope for a snapshot; no guessing which `div` is the transcript.                           |
| `article` + “Your message” / “Assistant message” names       | Role/name pairs survive snapshots and can be counted or read.                                     |
| Real buttons with stable visible names                       | `getByRole('button', { name: 'Send message' })` and ref-based actions work across re-renders.     |
| `aria-expanded`, `aria-current`, `aria-pressed`, `aria-busy` | State is machine-readable, not inferred from pixels or CSS classes.                               |
| Labelled form controls and associated errors                 | Declarative WebMCP can derive tool parameters from DOM labels; agents can fill and correct forms. |
| No hover-only actions; focus-visible controls                | Agents that do not hover, and keyboard users, can still operate.                                  |
| Route/title changes after navigation                         | Agents know where they are; `navigate_screen` results and `document.title` agree.                 |

This is why “make it accessible” and “make it agent-operable” are mostly the same project, not two competing roadmaps.

### 4.2 Current in-app capabilities

The Assistant toolkit registers three tools ([toolkit.tsx](../../apps/web/src/components/assistant/toolkit.tsx#L17-L49)); two have client-side `execute` and one is an external/backend tool:

- `get_current_screen` — frontend, read-only; returns `pathname` and `document.title`. **First external pilot:** no mutation. Review the payload before publishing it: detail paths and titles may contain Customer identifiers or names. If so, return only a route category or a generic Screen label.
- `navigate_screen` — frontend; mutates location within a fixed route allowlist. Useful, but still a state change; keep it behind the chat or a confirmation until the read-only pilot is stable.
- `get_runtime_info` — registered with `externalTool()` and implemented server-side; returns environment and authenticated user summary, including id, name, email, and role ([assistant.ts](../../apps/server/src/routes/assistant.ts#L187-L200)). **Do not publish wholesale to a browser agent.** It is identity-bearing, backend-owned, and should be excluded from any WebMCP allowlist.

There is no WebMCP provider mounted in the app today (verified by searching `apps/web/src`, `packages/ui/src`, and `apps/server/src`). So the current Assistant can call these tools, but an unrelated browser agent cannot discover them through WebMCP; it can still operate the visible UI through the accessibility tree.

### 4.3 WebMCP: explicit in-page tools (experimental)

WebMCP lets a page register JavaScript tools with natural-language descriptions and JSON Schema, invocable by agents and assistive technologies; the page behaves like an MCP server whose tools run client-side ([WebMCP draft](https://webmachinelearning.github.io/webmcp/)). It is a **Community Group draft dated 24 November 2026 and explicitly not a W3C Standard**; Chrome exposes it behind an origin trial and a testing flag ([WebMCP draft status](https://webmachinelearning.github.io/webmcp/), [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp)). Feature-detect `document.modelContext`; do not assume a particular browser version or make it the only path.

assistant-ui provides an experimental bridge that publishes frontend tools from its model context to the browser's WebMCP host ([assistant-ui WebMCP provider](https://www.assistant-ui.com/docs/tools/webmcp)). Two details matter:

- The provider's default filter publishes enabled frontend tools with an `execute`; backend tools, disabled tools, and tools without a client-side implementation are skipped.
- A `filter` you pass **replaces** the default predicate. Compose with `unstable_defaultWebMcpFilter` rather than writing a name-only filter that accidentally widens the surface.

A conservative pilot:

```tsx
import { unstable_defaultWebMcpFilter, unstable_useWebMcpProvider } from "@assistant-ui/react";

const PILOT_TOOLS = new Set(["get_current_screen"]);

const WebMcpTools = () => {
  const { status, registeredToolNames } = unstable_useWebMcpProvider({
    filter: (name, tool) => unstable_defaultWebMcpFilter(name, tool) && PILOT_TOOLS.has(name),
  });

  if (status === "unsupported") return null;
  // Optional development-only receipt; do not expose identity or internals in production UI.
  return <span className="sr-only">Browser tools: {registeredToolNames.join(", ")}</span>;
};
```

This is a **Proposed** pilot. It publishes only the read-only screen inspector. Do not add `get_runtime_info` to `PILOT_TOOLS`; do not add `navigate_screen` until the read-only flow is stable and the action has an explicit confirmation story.

WebMCP registrations live in `document.modelContext`, not in DOM content, so they are not exposed in the accessibility tree; an ARIA snapshot or a Playwright role query cannot discover or assert them. Verify registration and invocation with Chrome DevTools' WebMCP panel or a WebMCP-capable browser/agent; keep AX-based tests for the visible UI ([Chrome DevTools WebMCP](https://developer.chrome.com/docs/devtools/application/webmcp)).

WebMCP's declarative API is closely aligned with form accessibility, but note the source: a standard `<form toolname="…" tooldescription="…">` becomes a tool, and the browser derives parameter descriptions from the form controls and their associated `<label>`/`aria-description` in the DOM, not from a separately exported accessibility tree. `toolparamdescription` can override that derived description. By default the user must press **Submit**; `toolautosubmit` opts into agent-triggered submission ([Chrome declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)). That is the best pattern for a later “archive these exact customers” action: one visible form, one confirmation, one submit, with the agent filling the same fields a person would fill.

Security notes from the primary sources:

- `readOnlyHint`, `untrustedContentHint`, and `consequentialHint` are hints, not enforcement. A page can omit or misrepresent them; the agent/browser may use them to decide when to ask, but the app must still authorize and validate ([WebMCP draft](https://webmachinelearning.github.io/webmcp/), [Chrome secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools)).
- Tool descriptions and outputs are untrusted input and potential prompt-injection vectors. Treat model-visible text as data, not instructions ([Chrome secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools)).
- Registration is gated by the `tools` Permissions Policy, defaults to same-origin, and cross-origin exposure is bilateral. Keep the default and avoid `exposedTo` for this app ([WebMCP draft](https://webmachinelearning.github.io/webmcp/)).

### 4.4 MCP: durable out-of-process tools (available now)

MCP is the explicit server contract: `tools/list` discovery and `tools/call` invocation over JSON-RPC, with `name`, `title`, `description`, `inputSchema`/`outputSchema` as JSON Schema, and structured/unstructured results plus `isError` ([MCP Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). The spec says tools are model-controlled but there **SHOULD** always be a human in the loop with the ability to deny; applications SHOULD disclose exposed tools, show invocation indicators, and present confirmation prompts. Tool annotations MUST be considered untrusted unless the server is trusted.

For this repo, an MCP server is the better fit than WebMCP for a durable business operation such as bulk archive:

- One tool per real operation; an `archive_customers({ ids })` wrapper over the existing `customers.archiveMany` procedure, with a bounded, explicit, nonempty ID collection ([customers.ts](../../packages/api/src/routers/customers.ts#L55-L66)).
- No “archive all matching this filter” tool. The product spec forbids it ([SL-L1-01](../../docs/specs/internal-tool-starter/slices/SL-L1-01-bulk-archive-customers.md)).
- Reuse the existing server authorization and transaction behavior; snapshot the selected IDs at confirmation; verify that already-archived records count as success and that missing records fail the whole operation without partial writes.
- Return a meaningful, structured result and audit record; do not expose permanent delete through this path.
- Keep the chat approval UI and the MCP/WebMCP confirmation as two presentations of the same server-side rule, not two implementations of “is this allowed?”

MCP is separate from AI SDK UI. `useChat` is a model-call surface for one chat session; it is not a discovery endpoint, does not publish a tool schema to other agents, and has no Permissions Policy. If an agent outside the chat needs the capability, give it MCP (durable) or WebMCP (in-page), and keep the chat's `toolApproval` as the human-facing approval presentation.

### 4.5 Confirmation, authorization, and scope

- **Approval is a UX event; authorization is a server decision.** Check session, role, tenant, resource ownership, and current state on every call. `experimental_toolApprovalSecret` protects the approval replay for AI SDK tools, but it does not replace permission checks ([Tool approvals](https://ai-sdk.dev/docs/agents/tool-approvals#security-considerations)).
- **Consequential actions require explicit user confirmation** and a visible description of the effect. Use `consequentialHint: true` where the WebMCP surface supports it, and still render a real confirmation UI ([Chrome secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools)).
- **Read-only first.** `get_current_screen` is the pilot. `navigate_screen` is reversible but still a state change. `archive_customers` is consequential; the existing `archiveMany` procedure already enforces protected access and bounded, explicit IDs, so defer agent exposure until its authorization, all-or-nothing behavior, and confirmation UI are tested.
- **Scope:** keep the surface to ordinary application operations and existing authorization.
- **Feature flag and kill switch.** WebMCP is experimental; keep the provider behind a flag, log registrations, and be able to unmount it without affecting the chat.

## 5. Adoption path for this repo

### Phase 0 — baseline (no product change)

Run a short manual audit of the current Assistant Modal in Chrome + NVDA (Windows) and Safari + VoiceOver (macOS): open/close, send, stream a long reply, stop, fail a request, use a tool, attach a file, switch threads, rename, delete. Record actual announcements and focus after each step. The existing tests are static `renderToStaticMarkup` checks, not browser or AT tests ([assistant-modal.test.tsx](../../packages/ui/tests/assistant-modal.test.tsx#L131-L160)); they are useful for markup regressions but cannot establish accessibility.

### Phase 1 — semantics and announcement hygiene (small, low-risk)

- Name the transcript/region and make it keyboard-scrollable; add per-message `article` names.
- Move elapsed time out of the live status, or mark it `aria-hidden`; keep one polite lifecycle status.
- Add `tabIndex={0}`/labels to horizontally scrollable tables and code blocks.
- Add explicit Save/Cancel to thread rename; keep Escape.
- Add Playwright role locators and ARIA snapshots for the dialog, transcript, composer, tool disclosure, and thread list. Snapshot tests prove structure, not conformance.
- Verify with NVDA/VoiceOver that a long streamed answer does not produce per-token speech and that the final “reply complete” announcement is heard once.

### Phase 2 — tool states and approvals

- Render `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error`, and `output-denied` in the repo tool UI. For manual approvals show the request reason, the exact input/effect, Approve, and Deny; for `isAutomatic` show a status receipt, not controls. assistant-ui's approval card documents request/running/done/denied presentation and a live receipt; use it as a design reference, not as proof of accessibility ([approval card](https://www.assistant-ui.com/elements/approval-card)).
- Wire `respondToApproval`/`addToolApprovalResponse` through the assistant-ui runtime; do not add a parallel approval state.
- Extend `isAssistantMessageCompleteWithToolCalls` for `approval-responded` without regressing frontend tools, and add a test for the continuation.
- Configure `toolApproval` and `experimental_toolApprovalSecret` on the server for any sensitive tool; keep the real authorization and transaction rules in the existing procedures.
- Announce approval requests and outcomes through the same polite status channel; move focus to the approval card only when the user explicitly opens it, not when a background run creates it.

### Phase 3 — read-only agent pilot

- Mount `unstable_useWebMcpProvider` behind a feature flag with the allowlist `get_current_screen` only; compose `unstable_defaultWebMcpFilter`.
- Add a development receipt of `status`/`registeredToolNames`, but do not render identity data in production.
- Use [Chrome DevTools' WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp) or a WebMCP-capable client to verify that only the allowlisted tool is discoverable, that it takes no arguments, and that its response contains only the approved Screen data. Use an accessibility snapshot separately to check the visible UI.
- Verify feature detection and graceful absence; no milestone claims.

### Phase 4 — one consequential action

The baseline server operation already exists: `customers.archiveMany` is a protected procedure with explicit, bounded IDs and a missing-record failure ([customers.ts](../../packages/api/src/routers/customers.ts#L55-L66)). Before agent exposure, verify its all-or-nothing and already-archived behavior, add the confirmation/cancel and announced pending/success/error states, and keep the contract from SL-L1-01: no archive-by-filter, no hidden cross-page IDs, reversible status ([SL-L1-01](../../docs/specs/internal-tool-starter/slices/SL-L1-01-bulk-archive-customers.md)). Expose it as one server-side operation reused by the UI, chat tool, and (if still justified) MCP. Do not expose `get_runtime_info` or permanent delete.

### Phase 5 — optional presentation patterns

If a specific visual pattern is missing, copy the corresponding shadcn/ui AI Elements pattern (Message, Tool, Confirmation, Prompt Input) as local code, preserving the repo's controlled-Blocks boundary ([CODING_STANDARDS.md](../../CODING_STANDARDS.md)). Do not add the legacy `ai-elements` registry or replace assistant-ui. Do not cite a component's “accessibility support” claim as evidence; test the copied code in this app.

## 6. Verification still needed

| Question                                                                                        | Why it matters                                                                                                           | Method                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the Base UI popover move focus into the panel on `openOnRunStart`, and return it on close? | Auto-open on a background run could be an unexpected context change; focus return is required for a dialog-like surface. | Browser keyboard run; inspect `document.activeElement` before/after; Playwright focus assertions.                                                                          |
| Does the transcript auto-scroll pause when the user scrolls up?                                 | WCAG 2.2.2 and reading position; a chat that yanks the viewport is unusable with AT.                                     | Scroll up during a long stream; check position and announcement.                                                                                                           |
| How many announcements does a token stream produce with `role="log"`?                           | Determines whether `aria-live="off"` + status channel is necessary in this AT/browser pair.                              | NVDA/JAWS/VoiceOver speech log; compare log-only vs quiet-log pattern.                                                                                                     |
| Are the smallest icon buttons ≥24×24 CSS px?                                                    | WCAG 2.5.8.                                                                                                              | Computed sizes at desktop and narrow widths.                                                                                                                               |
| Do model-generated headings pollute the heading list?                                           | Screen-reader navigation and page outline.                                                                               | Accessibility-tree headings list with a Markdown reply containing `#`.                                                                                                     |
| Does the approval continuation actually send after `approval-responded`?                        | Current predicate excludes it.                                                                                           | Deterministic stream test with `MockLanguageModelV4`/`simulateReadableStream` ([AI SDK testing](https://ai-sdk.dev/docs/ai-sdk-core/testing)); assert the next step fires. |
| Does WebMCP discover only the allowlisted tool?                                                 | A filter mistake could expose identity or navigation.                                                                    | WebMCP-capable browser/agent or Chrome DevTools' WebMCP panel, not an ARIA snapshot; inspect `registeredToolNames` and call both allowed and denied tools.                 |

## 7. Sources

**Vercel AI SDK / assistant-ui**

- [AI SDK UI: Chatbot](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
- [useChat reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [Chatbot tool usage and tool approval UI](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage#tool-execution-approval)
- [UIMessage and part types](https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message)
- [Generative user interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces)
- [Tool approvals](https://ai-sdk.dev/docs/agents/tool-approvals)
- [AI SDK testing](https://ai-sdk.dev/docs/ai-sdk-core/testing)
- [assistant-ui AI SDK integration](https://www.assistant-ui.com/docs/api-reference/integrations/ai-sdk)
- [assistant-ui WebMCP provider](https://www.assistant-ui.com/docs/tools/webmcp)
- [assistant-ui approval card (design reference)](https://www.assistant-ui.com/elements/approval-card)
- [AI Elements (legacy registry)](https://elements.ai-sdk.dev/) and [shadcn/ui AI Elements](https://ui.shadcn.com/docs/ai-elements)

**W3C / WAI**

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — especially 1.3.1, 2.1.1, 2.2.2, 2.4.3, 2.4.7, 2.4.11, 2.5.7, 2.5.8, 3.2.1, 3.3.1, 4.1.2, 4.1.3
- [WAI-ARIA 1.2: `log`, `status`, `aria-live`, `aria-busy`, `aria-relevant`, `aria-atomic`](https://www.w3.org/TR/wai-aria-1.2/#log)
- [ARIA Authoring Practices: Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [ARIA Authoring Practices: Providing Accessible Names and Descriptions](https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/)
- [ARIA22: Using role=status to present status messages](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22)

**Agent operability**

- [Playwright locators](https://playwright.dev/docs/locators#locate-by-role)
- [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots)
- [agent-browser snapshots](https://agent-browser.dev/snapshots)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [WebMCP draft (CG report, not a W3C Standard)](https://webmachinelearning.github.io/webmcp/)
- [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp), [declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api), [imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools), [best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices), [DevTools WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp)
- [MCP Tools, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP security best practices, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/security_best_practices)

# monorepo-boilerplate

A deployable starter for internal tools: developers build their own workflows on top of an App Shell, reusable Blocks, and one complete Reference Flow. Each deployment serves one organization.

## Language

**Primitive**:
An unstyled-behaviour component that maps to a single element or widget, owning its accessibility semantics and nothing else.
_Avoid_: atom, base component, UI element

**Block**:
A composition of primitives that solves a recurring layout or interaction problem without knowing any domain concept.
_Avoid_: pattern, template, composite, widget

**Screen**:
A route-level composition that binds blocks to a domain: it supplies columns, fields, queries, and navigation.
_Avoid_: page, view, container

**App Shell**:
The persistent frame around every authenticated screen: navigation, top bar, and content area.
_Avoid_: layout, chrome, frame

**Assistant**:
The domain-agnostic AI helper integrated into the App Shell.
_Avoid_: chatbot, copilot, agent

**Assistant Modal**:
The floating popover trigger and panel hosting the Assistant inside the App Shell.
_Avoid_: chat widget, chat bubble, support widget

**Assistant Thread**:
A persisted conversation sequence of messages and branches owned by an authenticated user.
_Avoid_: chat session, conversation

**Reference Flow**:
One complete domain flow, from database through the API to table, form, and file upload, kept working as the canonical example of how the tiers compose.
_Avoid_: demo, sample app, example module

**Demo Route**:
A screen that exists only to exhibit a block and may be deleted by the consumer without breaking anything else.
_Avoid_: showcase, playground

**DataTable**:
A table block that renders rows, headers, sorting, and pagination; it never fetches.
_Avoid_: grid, list view, table widget

**Server-driven table**:
A DataTable mode where sorting, filtering, and paging are performed by the API and the block only reports what the user asked for.
_Avoid_: remote table, backend pagination

**Client-driven table**:
A DataTable mode where the block sorts, filters, and pages an in-memory array.
_Avoid_: local table, frontend pagination

**Kanban Board**:
A controlled board block that organizes cards into horizontal columns and reports move intents; it never fetches.
_Avoid_: board view, pipeline view

**Kanban Column**:
A vertical bucket in a Kanban Board that groups cards sharing a workflow state.
_Avoid_: lane, stage, bucket, list

**Kanban Card**:
A draggable record surface inside a Kanban Column.
_Avoid_: item, task, deal, ticket

**WIP Limit**:
A soft visual capacity threshold on a Kanban Column that warns when exceeded; it never silently blocks moves unless the Screen adds a transition guard.
_Avoid_: column cap, max items, hard limit

**Field Block**:
A form-bound block that presents one typed input with its label, description, and validation feedback without knowing any domain rules.
_Avoid_: form control, input wrapper, form component

**Form Wizard**:
A multi-step form block backed by one shared form state that validates step by step without owning route or URL state.
_Avoid_: stepper form, multi-page form, funnel

**Money**:
An exact amount together with its currency; never a floating-point approximation of value.
_Avoid_: price, amount, total

**Currency minor unit**:
The smallest indivisible unit of a currency, in which Money is exchanged at every boundary.
_Avoid_: cents, subunits, decimals

**Stored asset path**:
A provider-relative location for an uploaded file, resolved to a URL only at render time.
_Avoid_: file URL, absolute upload URL, CDN link

**Upload handler**:
The callback a screen supplies to an upload block, owning the transport while the block owns the interaction.
_Avoid_: uploader, file service, storage client

**UI preference**:
A cross-route interface choice owned by the client store; never server data.
_Avoid_: user setting, app state, global state

**Bulk Action**:
One operation applied to multiple records the user has selected.
_Avoid_: mass edit, batch job

**Customer Import**:
Creation of new Customers from a file as a single batch. It never updates existing Customers.
_Avoid_: spreadsheet sync, bulk update

**Customer Export**:
A copy of the Customers matching the current list filters, regardless of pagination or selection.
_Avoid_: page download, selection export

**Deployment Operator**:
A person responsible for setting up and running an instance of the tool. This responsibility is separate from managing staff access inside the tool.
_Avoid_: admin, superuser

**Administrator**:
A staff user authorized to manage who has access to the tool.
_Avoid_: deployment operator, owner

**Staff Invitation**:
A time-limited, single-use grant from an Administrator that lets a person join the tool as a staff user.
_Avoid_: public sign-up, shared registration link

**Archive**:
A reversible change that removes a Customer from the default list without deleting the Customer or its attachment.
_Avoid_: delete, remove

**Draft Upload**:
A file uploaded for a Customer but not yet attached to a saved record. Only the uploader can read it while it is a draft.
_Avoid_: public file, customer attachment

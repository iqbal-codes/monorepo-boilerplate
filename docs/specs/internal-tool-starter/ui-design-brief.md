# UI Design Brief: Customers bulk archive

- **Status:** Design-System Ready
- **Design Mode:** Design-System Guided
- **Source:** [Internal-tool starter spec](spec.md)

## Roles and navigation

Signed-in staff and Administrators use the existing `/customers` list. An archived record can be restored from its existing Customer detail Screen or edit drawer. Keep the App Shell, navigation, and New customer action unchanged. Do not add a route or redesign the table.

## Layout and interaction

Keep the search, status filter, and result count in a List Toolbar directly above the DataTable. Put the Bulk Action Bar between that toolbar and the table when there is a selection. Show the count, a clear-selection control, and an Archive action. Put selection checkboxes in the leading column; the header checkbox selects only the current page’s eligible rows and shows the mixed state when partially selected. Toggling a checkbox must not open the edit drawer.

Use existing shadcn primitives and project tokens. Keep both bars in normal flow; let controls wrap on narrow screens without changing reading order. At 320px, the table may scroll in its existing container, but neither toolbar nor the dialog should introduce page-wide overflow.

Use a named checkbox for each row and **Select all customers on this page** for the header. The dialog names the action and count (for example, **Archive 12 customers?**), says the records and attachments are kept, and provides **Cancel** and **Archive customers**. Verify keyboard selection, focus containment, and focus return to the trigger on cancellation or to a stable list control if the trigger disappears. Announce outcomes without requiring the user to find a toast.

## Required states

| State                          | Expected behavior                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Populated, no selection        | Search, status, count, and unchecked controls; no Bulk Action Bar.                                                          |
| Partial or full page selection | Header shows mixed or checked state. Action Bar shows the count. Other pages stay unselected.                               |
| List query changes             | Selection clears. Stale results cannot be selected while the replacement page loads.                                        |
| Confirmation                   | Exact selected count, consequences, cancel action, and archive action. Cancel changes no records.                           |
| Archive pending                | One request only; prevent repeat confirmation and show progress.                                                            |
| Success                        | Clear selection, refresh affected views, and announce the result. If the current page disappears, move to a valid page.     |
| Missing record                 | Announce that nothing was archived, refresh the list, and require a new selection.                                          |
| Request failure                | Show a recoverable error; do not claim success or optimistically move rows.                                                 |
| Archived                       | Find archived records using the Archived filter. Restore one Customer at a time with an explicit Active or Inactive choice. |
| Empty or list error            | Preserve the Screen’s current empty, clear-filter, and retry affordances.                                                   |

No mockups are needed; the existing Customers Screen is the visual reference. Verify desktop and narrow layouts in the browser with a signed-in test user and disposable records.

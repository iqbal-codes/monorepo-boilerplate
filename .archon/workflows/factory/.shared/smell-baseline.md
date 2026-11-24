# Fowler Smell Baseline (Standards Axis)

Apply this baseline alongside documented repository standards and directory `README.md` contracts.

**Rules:**
- **Repo and `README.md` contracts override.** Where documented conventions endorse something the baseline would flag, suppress the smell.
- **Always a judgment call.** Label each smell as a heuristic (e.g., *"possible Feature Envy"*), never as a hard violation unless it causes a concrete defect.
- **Skip tooling-enforced checks** (formatting, unused imports, trivial lint rules).

## Smells (`what it is` -> `how to fix`)

- **Mysterious Name:** A function, variable, or type whose name does not reveal what it does or holds. -> Rename it; if no honest name fits, sharpen the design.
- **Duplicated Code:** The same logic shape appears in more than one hunk or file in the diff. -> Extract the shared shape and call it from both sites.
- **Feature Envy:** A method reaches into another object's data more than its own. -> Move the method onto the data it envies.
- **Data Clumps:** The same few fields or parameters travel together repeatedly. -> Bundle them into one explicit type and pass that.
- **Primitive Obsession:** A primitive or raw string stands in for a domain concept with its own invariants. -> Wrap it in a small domain type.
- **Repeated Switches:** The same `switch`/`if`-cascade on the same discriminant recurs across the change. -> Replace with polymorphism or a single shared dispatch map.
- **Shotgun Surgery:** One logical change forces scattered edits across many unrelated files. -> Gather what changes together into one module.
- **Divergent Change:** One file or module changes for several unrelated reasons. -> Split so each module changes for one cohesive reason.
- **Speculative Generality:** Abstractions, parameters, or hooks added for needs the spec does not ask for. -> Delete and inline until a real need appears.
- **Message Chains:** Long `a.b().c().d()` traversal the caller should not couple to. -> Hide the walk behind one method on the first object.
- **Middle Man:** A wrapper class or function that mostly delegates straight onward. -> Remove the wrapper and call the real target directly.
- **Refused Bequest:** A subclass or implementer ignores or overrides most of what it inherits. -> Replace inheritance with composition.
- **Monolith File / God Component (`[P1]` when avoidable within `Owned / Allowed Paths`):** A single UI page (> ~300 lines) or module (> ~400 lines) mixing API calls, complex state, multiple forms/tabs/tables, and helpers inline instead of decomposing into focused sub-components, hooks (`use*.ts`), and typed helpers. -> Split into `features/<slice>/{components,hooks,types,api}` (or submodule folder) while keeping the route/barrel file lean. (Downgrade to `[P2]` or suppress only if the slice contract itself restricted ownership to one exact file path.)
- **Design System Bypass (`[P1]` when repo docs/AGENTS.md mandate a design system):** Re-implementing buttons, inputs, selects, tabs, badges, cards, or layout spacing with raw HTML elements + hardcoded inline `#hex`/`px` styles where the repository's configured design system (`AGENTS.md` / UI package) provides primitives and tokens. -> Replace with design system components, props, and CSS tokens.

# Fowler Smell Baseline (Standards Axis)

Apply this baseline alongside documented repository standards and directory `README.md` contracts.

**Rules:**
- **Repo and `README.md` contracts override.** Where documented conventions endorse something the baseline would flag, suppress the smell.
- **Advisory by default (`[P2]`).** Treat each smell as a non-blocking heuristic (e.g., *"possible Feature Envy"*). Escalate to `[P1]` only when it causes a concrete defect or violates an explicit slice contract requirement.
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
- **Monolith File / God Component (advisory `[P2]`):** A single UI page (> ~300 lines) or module (> ~400 lines) mixing API calls, complex state, multiple forms/tabs/tables, and helpers inline. -> Suggest decomposing into focused sub-components, hooks (`use*.ts`), and typed helpers when clean and within slice boundaries.
- **Design System Bypass (advisory `[P2]` unless mandated by slice contract):** Re-implementing buttons, inputs, selects, tabs, badges, cards, or layout spacing with raw HTML elements + hardcoded inline `#hex`/`px` styles where the repository's design system provides primitives and tokens. -> Suggest replacing with design system components and tokens.

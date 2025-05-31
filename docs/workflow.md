
> **Goal** Ship new backend features with the _right_ amount of tests and docs while keeping fast feedback loops.

### 0. Prepare / Reuse the Sandbox


```bash
npm run start:backend:e2e &   # dockerised backend + mocked data (hot‑reload)
```

_(Pure library/service work can skip the sandbox entirely.)_

---

### 1. Implement the Feature

Code the change in `backend/src/**` (or relevant directory).

---

### 2. Pick a Testing Route

Choose one of the **three paths**:

| Route         | When to choose                                                     | Mandatory Steps |
| ------------- | ------------------------------------------------------------------ | --------------- |
| **Unit‑only** | Pure functions / isolated services with no external IO             | A → C           |
| **e2e‑only**  | API endpoints, DB schema, multi‑layer flows                        | B → C           |
| **Hybrid**    | Complex or critical change touching internals _and_ outer contract | A → B → C       |

- **A. Unit Tests** – write `*.test.ts` beside the code and run:

  ```bash
  npm run test:backend
  ```

  Iterate until green.

- **B. e2e Tests** – create a spec under `backend-e2e/<feature>/` and execute:

  ```bash
  npm run test:backend:e2e:dev <file>
  ```

  Iterate on code/tests until passing (the sandbox auto‑reloads).

- **C. Regression Gate** – once your chosen path(s) are green, run the **full suites**:

  ```bash
  npm run test:backend          # unit
  npm run test:backend:e2e      # comprehensive e2e
  ```

---

### 3. Documentation Pass

Decide which docs need updating:

| Doc Type         | When to update                                                                                                       | Location                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **General Docs** | Nearly every feature – user‑visible behaviour, API, DB schema, env vars                                              | `/docs/*.md` (design pages, API reference, run‑and‑debug, etc.) |


---

### 4. Log the Change

Add a concise entry to **CHANGELOG.md** summarising the feature, tests added, and docs touched. Commit & push will be handled by the human operator.

> **Cycle:** _Code → Test (unit/e2e) → Docs → Changelog_ — choose the lightest path that proves correctness without over‑testing.

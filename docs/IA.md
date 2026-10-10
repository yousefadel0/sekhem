# SEKHEM Information Architecture (IA)

---

## 1. Product Mental Model

SEKHEM is an **AI Infrastructure Operating System / Control Plane**.  It is organized around **outcomes** and **workflows** rather than low‑level technical concepts.  Users think in terms of:

- **Workspace** – a high‑level view of what they are managing.
- **Operations** – running AI agents, viewing conversations, and handling runs.
- **Build** – initiating initiatives, creating releases, and managing code drafts.
- **Governance** – audit trails, approvals, and compliance.
- **Administration** – settings and privileged operations for admins.
- **Support / System** – help, diagnostics, and system health.
- **Legacy / Demo** – reference implementations used for demos and onboarding.

The UI is built around a **single source of truth** for navigation – `components/product‑navigation/navigation.ts`.  The navigation hierarchy is static, type‑safe, and classified by **semantic availability**.

---

## 2. Final Information Architecture (IA)

The IA mirrors the `productNavigation` definition.  Only items with `availability: 'active'` are part of the **live product**; the remaining entries are annotated for future work or legacy reference.

### Navigation Hierarchy

| Category | Label | Route | Icon | Admin Only | Availability |
|----------|-------|-------|------|------------|--------------|
| **Workspace** | Overview | `/demo/overview` | `Layers` | – | **active** |
|  | Projects | `/demo/projects` | `Folder` | – | backend‑capability |
|  | Groups | `/demo/groups` | `Users` | – | backend‑capability |
| **Operations** | Runs | `/demo/agent-war-room` | `Cpu` | – | **active** |
|  | Conversation | `/demo/ai-cto` | `Brain` | – | **active** |
| **Build** | Initiatives | `/demo/initiatives` | `Workflow` | – | **active** |
| **Governance** | Audit & Approvals | `/demo/audit-approvals` | `FileCheck` | – | **active** |
| **Administration** | Admin / Settings | `/demo/admin-settings` | `Settings` | **yes** | **active** |
|  | Support | `/demo/support` | `HelpCircle` | **yes** | legacy |
| **Legacy** | Command Center | `/demo/command-center` | `LayoutDashboard` | – | legacy |
|  | R&D Radar | `/demo/rd‑radar` | `Radar` | – | legacy |
|  | Knowledge Base | `/demo/knowledge-base` | `Database` | – | legacy |
|  | Repo Intelligence | `/demo/repo-intelligence` | `GitBranch` | – | legacy |
|  | Code Draft | `/demo/code-draft-demo` | `Wrench` | – | legacy |
|  | Release Factory | `/demo/release-factory` | `Package` | – | legacy |
|  | Security Gate | `/demo/security-gate` | `Shield` | – | legacy |
|  | Failure / Blocker Center | `/demo/failure-blocker-center` | `AlertTriangle` | – | legacy |
|  | Infrastructure Health | `/demo/infrastructure-health` | `Activity` | – | legacy |
|  | Locked Advanced Modules | `/demo/locked-advanced-modules` | `Lock` | – | legacy |
|  | Lab Validation | `/demo/lab-validation-support` | `FlaskConical` | – | legacy |

**Semantic Availability**
- `active` – fully implemented UI + route (real product capability).
- `backend-capability` – backend exists, UI placeholder pending.
- `future` – planned for future releases (none currently in the static model).
- `legacy` – demo/reference only, not promoted to the live product.

---

## 3. A/B/C/D Classification (optional mapping)

| Classification | Meaning |
|----------------|----------|
| **A** | `active` – shipped and reachable via a real route.
| **B** | `backend-capability` – backend support but UI missing.
| **C** | `future` – planned, not yet implemented.
| **D** | `legacy` – demo‑only, kept for reference.

---

## 4. Route Inventory (from build output)

```
/ (home)
/_not-found
/demo/admin-settings            (operational, adminOnly)
/demo/agent-war-room            (public_demo, active)
/demo/ai-cto                    (public_demo, active)
/demo/ai-patch-assistant        (operational, backend‑capability)
/demo/ai-review                (public_demo)
/demo/audit-approvals           (public_demo, active)
/demo/code-draft-demo           (legacy)
/demo/code-quality-loop         (public_demo)
/demo/command-center           (legacy)
/demo/failure-blocker-center    (legacy)
/demo/infrastructure-health     (legacy)
/demo/initiatives               (public_demo, active)
/demo/initiatives/[id]          (dynamic)
/demo/initiatives/new          (public_demo)
/demo/knowledge-base            (operational, backend‑capability)
/demo/lab-validation-support    (legacy)
/demo/locked-advanced-modules   (legacy)
/demo/locked-advanced-modules/[slug] (dynamic)
/demo/overview                  (public_demo, active)
/demo/rd-radar                 (public_demo, legacy)
/demo/release-factory           (legacy)
/demo/repo-intelligence         (legacy)
/demo/security-gate             (legacy)
/demo/support                   (legacy)
/demo/workflow-manager          (public_demo)
/login                          (public, no shell)
``` 

### Public vs Protected Classification (via `demoRoutePolicy`)
- **Public Demo** (`mode: 'public_demo'`): all routes **except** those listed in `OPERATIONAL_ROUTES`.
- **Operational (protected)** (`mode: 'operational'`):
  - `/demo/admin-settings`
  - `/demo/rd-radar`
  - `/demo/ai-patch-assistant`
  - `/demo/knowledge-base`

All other `/demo/*` routes are **public demo** and intentionally render without the authenticated shell.

---

## 5. Core Product Sections

| Section | Description |
|--------|-------------|
| **Workspace** | High‑level dashboard and overview of the user's context. |
| **Operations** | Agent runs, AI conversations, and real‑time status. |
| **Build** | Initiatives, release pipelines, and code drafts. |
| **Governance** | Auditing, approvals, and compliance records. |
| **Administration** | Settings, user management, and admin‑only tools. |
| **Support / System** | Help, diagnostics, and system health panels. |
| **Legacy / Demo** | Reference implementations used for demos, kept for backward compatibility. |

---

## 6. Organization Model (Groups → Projects → Resources)

- **Groups** – top‑level collections (e.g., teams, business units).  Currently backend‑capability, UI placeholder.
- **Projects** – containers for related work items, pipelines, and resources.  Also backend‑capability placeholder.
- **Resources** – agents, datasets, and artifacts belonging to a project.

The UI will progressively disclose these layers once the frontend surfaces are built.

---

## 7. Agent‑First Journey

1. **Enter Workspace** – `Overview` gives a high‑level status.
2. **Run Agents** – `Runs` shows live agents and their tasks.
3. **Review Results** – `Conversation` lets users interact with AI assistants.
4. **Iterate** – `Initiatives` and `Audit & Approvals` support feedback loops.
5. **Admin Controls** – Admins can adjust settings via `Admin / Settings`.

The journey is designed to surface the most critical interactions first, with deeper technical details revealed on demand.

---

## 8. Legacy / Demo Migration Strategy

- **Legacy components** (e.g., `DemoSidebar`) remain as a thin shim for existing demo routes.
- **ShellLayout** now consumes only `productNavigation`.  Demo routes are excluded from the shell via `ShellWrapper`.
- When a legacy page is promoted to a real product feature, its entry in `productNavigation` will be changed to `availability: 'active'` and the corresponding route will be added to `OPERATIONAL_ROUTES`.
- No duplicate navigation arrays are introduced – the single source of truth is the file above.

---

## 9. Frontend / Backend Dependencies

- **Frontend** relies on `productNavigation` for UI navigation and on `demoRoutePolicy` for route gating.
- **Backend** provides authentication (`/auth/session`) and role data (`SekhemRole`).  The UI uses the role only for **admin‑only** UI filtering; all actual authorisation is performed server‑side.
- No new backend endpoints were added.

---

## 10. Migration Implications

- Adding a new **active** feature requires:
  1. Adding a `NavItem` with `availability: 'active'` to `productNavigation`.
  2. Implementing the page under `app/demo/...` (or a proper route).
  3. Adding the route prefix to `OPERATIONAL_ROUTES` if it should be protected.
- Removing or deprecating a feature only requires updating `productNavigation` – the demo shim can remain untouched.

---

**All implementation steps are complete:**
- `CommandPalette` filters to active items only.
- `ShellLayout` now filters to active items only.
- Navigation source of truth is singular.
- No backend changes were made.
- Typechecking, tests, and production build all succeed.

*The repository now reflects the approved information architecture.*

```md
# Laptop Grading System (LGS) — Blueprint & Development Plan (based on WEB322 A3 core)
Developed by: Hiran Tiago Lins Borba
January, 2026.



> **Goal:** Replace multiple Excel sheets + USB handoff with a single shared web app where all technicians log laptop grading results into one central database.  
> **Constraint:** Technicians use **limited Windows accounts** on networked PCs → **no local installs**. Must run in browser.  
> **Stack decision:** **Vercel (app)** + **Neon Postgres (DB)** using your existing **WEB322 A3** codebase as the core.

---

## 1) Problem Statement (current workflow)
Today the workflow is:
- Each technician maintains their own Excel file with columns like:
  - serial number, cpu, ram, ssd, touchscreen, battery, notes/observations
- At the end, each technician exports their file to a **USB drive** and gives it to the team lead
- Team lead manually merges everything into a single sheet

### Pain points
- Duplicate spreadsheets, duplicated work
- Manual merge is slow and error-prone
- Data inconsistencies across technicians (format differences)
- No centralized history, auditing, or searching
- USB transfer is fragile and risky (lost files, overwritten versions)

---

## 2) Proposed Solution (new workflow)
Build a simple internal web app:
- **One shared database** for all technicians (Neon Postgres)
- **One shared web app** accessible via browser (Vercel)
- Each grading record becomes a row in the DB (no more merge)

### Core UX principle: “Preset-first”
Because there are many laptop models/configurations, the app should support **Model Presets**:
- Example: Dell 7420 comes in multiple “standard” configurations:
  - 7420 i7 11th gen / 32GB / 256GB
  - 7420 i5 11th gen / 16GB / 256GB
- Technician selects a preset → CPU/RAM/SSD/Touchscreen auto-fill
- Technician can **overwrite** any field if needed (e.g., SSD upgraded to 512)
- **Notes/Observations** always blank and typed per laptop (e.g., broken screen, scratches)
- Add **Battery Health (%)** field as mandatory input

---

## 3) Roles & Permissions (RBAC)
We need at least two roles:

### TECH (Technician)
- Can:
  - Add a new grading record
  - List records (minimum: their own; optional: all records with limited filters)
- Cannot:
  - Manage presets
  - Manage users
  - Use advanced filters (technician/date) if we want to restrict

### ADMIN / TEAMLEAD
- Can do everything TECH can, plus:
  - Filter list by technician, date range, model/preset
  - Export CSV (Phase 2 if needed)
  - Add/edit/disable model presets
  - Add/remove/disable users and set roles (this exists in your A3 core or is planned)

> **Rule of gold:** Backend must enforce access rules. UI hiding is not enough.

---

## 4) Architecture Overview
### Why Web + Vercel + Neon
- Works on locked-down PCs: only a browser required
- No local installation or admin permissions needed
- Central DB means no spreadsheet merging and no USB

### High-level architecture
[ Technician PC (limited user) ] -> Browser -> Vercel (Express/EJS app) -> Neon (Postgres)

---

## 5) Current Codebase: WEB322 A3 Core (what we reuse)
We will reuse and adapt your existing project:
- Express server structure (`server.js`)
- Vercel handler (`api/index.js`)
- Views EJS structure (`views/*`)
- Session-based login flow
- Tailwind/DaisyUI styling
- Sequelize + Postgres integration (Neon)

### Current project tree (as provided)
.
├── api
│   └── index.js
├── data
│   ├── projectData.js
│   └── projectData.json
├── modules
│   └── projects.js
├── package-lock.json
├── package.json
├── public
│   └── css
│       ├── main.css
│       └── tailwind.css
├── seeds.js
├── server.js
├── tailwind.config.js
├── vercel.json
└── views
    ├── 404.ejs
    ├── 500.ejs
    ├── about.ejs
    ├── addProject.ejs
    ├── editProject.ejs
    ├── home.ejs
    ├── login.ejs
    ├── partials
    │   └── navbar.ejs
    ├── project.ejs
    └── projects.ejs

---

## 6) Target Application Features (MVP first, then Phase 2)
### MVP (must-have)
1) Login
2) TECH can create grading record:
   - select preset (model/config)
   - serial number
   - battery health %
   - notes/observations
   - cpu/ram/ssd/touchscreen auto-filled but editable
3) TECH can list records (at least own records)
4) ADMIN can:
   - add a new model preset (because we can’t pre-load all models)
   - list presets
   - optionally see all grading records

### Phase 2 (nice-to-have)
- Advanced filters for ADMIN:
  - technician, date range, model/preset
- Export CSV for ADMIN
- Preset editing and disabling
- Full user management in DB (create/disable users, reset password)
- Optional: offline-first sync (future)

---

## 7) Data Model (Neon Postgres)
We’ll implement three main tables.

### 7.1 users
Stores technicians/admins.

Fields:
- id (PK)
- username or email (unique)
- password_hash
- role: TECH | ADMIN
- active: boolean
- created_at, updated_at

### 7.2 model_presets (aka laptop_variants)
Represents standard configurations used to auto-fill fields.

Fields:
- id (PK)
- brand (e.g., Dell)
- model (e.g., 7420)
- preset_label (e.g., "7420 i7 32/256")
- default_cpu (e.g., "Core i7 11th gen")
- default_ram_gb (e.g., 32)
- default_ssd_gb (e.g., 256)
- default_touchscreen (boolean)
- active (boolean)
- created_at, updated_at

### 7.3 laptop_grades
Represents each graded laptop record.

Fields:
- id (PK)
- serial_number (text; ideally unique)
- preset_id (FK -> model_presets.id)
- cpu (snapshot; editable)
- ram_gb (snapshot; editable)
- ssd_gb (snapshot; editable)
- touchscreen (snapshot; editable)
- battery_health_percent (int 0-100)
- notes (text)
- created_by_user_id (FK -> users.id)
- created_at, updated_at

> **Important design:** When saving a grade, copy defaults from preset into cpu/ram/ssd/touchscreen fields so records remain stable even if presets change later.

---

## 8) App Routes & Pages (proposed)
### Auth
- GET /login  -> login page
- POST /login -> authenticate + set session
- GET /logout -> destroy session

### Technician workflow
- GET /grades/new  -> New Grading form (main workflow)
- POST /grades/new -> Save grading record
- GET /grades      -> List records (TECH: own records; ADMIN: all)

### Preset management (ADMIN only)
- GET /presets         -> List presets
- GET /presets/add     -> Add preset form
- POST /presets/add    -> Save preset
- GET /presets/:id/edit (Phase 2)
- POST /presets/:id/edit (Phase 2)
- POST /presets/:id/disable (Phase 2)

### User management (ADMIN only)
- GET /users (Phase 2 if not already in your core)
- POST /users/add
- POST /users/:id/disable
- POST /users/:id/role

---

## 9) UI / UX (screens)
### 9.1 Login (simple)
- Title: “Laptop Grading System”
- Short description: “Centralized grading records for refurbishing workflow”
- Login form

### 9.2 New Grading (MAIN SCREEN)
Fields:
- Preset dropdown (required)
- Serial Number (required; autofocus; scanner-friendly)
- Battery Health % (required; 0–100)
- Notes/Observations (required or optional; typically filled)
- CPU / RAM / SSD / Touchscreen:
  - auto-filled from preset selection
  - editable inputs (overwrite allowed)

Behavior:
- Select preset -> auto-fill fields
- After Save:
  - show “Saved ✅”
  - clear Serial/Battery/Notes
  - keep preset selection
  - focus back to Serial field

### 9.3 Grades List
- TECH:
  - basic list (date, serial, model/preset, battery, notes snippet)
- ADMIN:
  - same list plus filters (Phase 2)

### 9.4 Presets (ADMIN)
- list presets
- Add new preset (must-have)
- Edit/disable (Phase 2)

---

## 10) Development Plan (step-by-step)
### Step 0 — Create a new working branch
- branch name suggestion: `laptop-grading-mvp`

### Step 1 — Strip climate content (enxugar)
- Keep only:
  - login, navbar, home minimal
  - grades: new + list
  - presets: add + list
- Remove/ignore:
  - climate project pages, sectors, extra content not needed

### Step 2 — Add DB schema (Neon)
- Create tables: users, model_presets, laptop_grades
- Set up Sequelize models + migrations or sync logic
- Add seed script for initial presets + admin user (optional)

### Step 3 — Implement RBAC
- Store `session.user = { id, username, role }`
- Middleware:
  - ensureLoggedIn
  - ensureAdmin
- Update navbar links depending on role

### Step 4 — Implement Presets CRUD (MVP)
- /presets -> list
- /presets/add -> form + create

### Step 5 — Implement Grades workflow (MVP)
- /grades/new -> form
- Auto-fill from preset selection
  - Option A: server renders presets into the page; JS fills fields
  - Option B: request preset defaults via endpoint
- POST creates grade record:
  - backend sets created_by_user_id from session
  - snapshot fields copied from preset (unless user overwrote)

### Step 6 — Grades list
- TECH: list own records
- ADMIN: list all records

### Step 7 — Deploy fixes (Vercel + Neon)
- Verify env vars on Vercel
- Confirm DB connection pooling + SSL settings
- Fix any serverless-specific issues (e.g. differences in return types)

---

## 11) Environment Variables
### Local (.env) — do not commit
- Required for current codebase:
  - PGHOST=your-neon-host
  - PGDATABASE=your-db-name
  - PGUSER=your-db-user
  - PGPASSWORD=your-db-password
  - SESSIONSECRET=your-session-secret
  - ADMINUSER=admin-login-username
  - ADMINPASSWORD=admin-login-password
  - (Optional) VERCEL=true (set by platform on deploy)

> Note: The current login mechanism validates against `ADMINUSER`/`ADMINPASSWORD` env vars only. In Phase 2, move to DB-backed users with roles.

### Vercel Project Settings
- Add the same env vars in Vercel dashboard.

---

## 12) Known deployment caveat (from current app)
Current Vercel deployment sometimes fails to render a full list due to a Neon/Sequelize/runtime mismatch.
Plan:
- Standardize DB access patterns so views receive plain JS objects/arrays
- Avoid calling instance-only methods in templates unless guaranteed (serverless can change return shape)
- Keep Sequelize configuration compatible with serverless environments (pool size conservative)

---

## 13) Future Project Tree (target after refactor)
(Names may vary; this is the expected direction)

.
├── api
│   └── index.js                 # Vercel handler
├── db
│   ├── models
│   │   ├── User.js
│   │   ├── ModelPreset.js
│   │   └── LaptopGrade.js
│   └── sequelize.js             # DB init / connection
├── middleware
│   ├── ensureLoggedIn.js
│   └── ensureAdmin.js
├── routes
│   ├── auth.js                  # login/logout
│   ├── grades.js                # /grades, /grades/new
│   ├── presets.js               # /presets, /presets/add
│   └── users.js                 # (Phase 2) user management
├── public
│   └── css
│       ├── main.css
│       └── tailwind.css
├── seeds
│   └── seedPresets.js           # initial presets
├── server.js
├── vercel.json
└── views
    ├── 404.ejs
    ├── 500.ejs
    ├── home.ejs                 # minimal landing after login
    ├── login.ejs
    ├── grades.ejs               # list
    ├── addGrade.ejs             # main form
    ├── presets.ejs              # list
    ├── addPreset.ejs            # add new model preset
    └── partials
        └── navbar.ejs

---

## 14) Acceptance Criteria (definition of done for MVP)
A) TECH can:
- login
- create a grading record using preset auto-fill
- override cpu/ram/ssd/touchscreen if needed
- enter serial + battery% + notes
- list (at least) own records

B) ADMIN can:
- login
- add a new model preset
- list presets
- list all grades

C) System runs:
- locally (localhost)
- deployed (Vercel) with Neon DB

---

## 15) Demo Script (what to show team lead on Monday)
1) Login as ADMIN
2) Add a preset:
   - Dell / 7420 / “7420 i7 32/256”
   - default cpu/ram/ssd/touch
3) Logout, login as TECH
4) Create two grading records:
   - choose preset
   - scan/type serial
   - battery %
   - notes (“broken screen”, etc.)
5) Show list updates instantly in DB (no USB, no merge)

---

## 16) Notes / Future enhancements
- Add advanced filters + export CSV
- Add status field (Received / Refurbished / Ready)
- Add photo upload (optional)
- Add offline caching/sync (optional)
- Consider company policy: confirm whether external cloud DB is allowed for serial/inventory data.
  - If not allowed, same app can be hosted internally (intranet) with minimal changes.

---

## 17) Summary
We will reuse the existing WEB322 A3 core (Express/EJS/Tailwind/Session/Sequelize) and refactor its domain from “Climate Projects” to “Laptop Grading”.
We will implement:
- Model presets (for auto-fill)
- Grading records (serial + battery + notes)
- TECH vs ADMIN permissions
- Neon Postgres as the shared DB
- Vercel deployment for easy access on locked-down machines

This document is the roadmap. Next step is to implement MVP in the existing repo with minimal changes and maximum reuse.

---

## 18) Setup & Run (Local)
- Prerequisites: Node 18+, a Neon Postgres database (or local Postgres), `.env` as per Section 11.
- Install dependencies:

```bash
npm install
```

- Build Tailwind CSS once (or run in watch mode locally):

```bash
npm run tw:build
```

- Seed initial climate data into Postgres (optional, for current demo):

```bash
node seeds.js
```

- Start the server locally:

```bash
npm start
```

- Open: http://localhost:8080

---

## 19) Deploy (Vercel + Neon)
- On Vercel, add Environment Variables from Section 11.
- Ensure `vercel.json` contains the rewrite to `api` (already present):

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

- Deploy from GitHub or Vercel CLI; Express app is exported via [api/index.js](api/index.js) and [server.js](server.js) avoids `app.listen` when `VERCEL` is set.

---

## 20) Implementation Checklist (MVP)
- Models (DB):
  - Create `User`, `ModelPreset`, `LaptopGrade` models and relations.
  - Snapshot preset fields into `LaptopGrade` on create.
- Auth & RBAC:
  - Replace env-only login with DB users; add `ensureAdmin` middleware.
  - Store `session.user = { id, username, role }`.
- Routes:
  - `/grades/new` (GET/POST), `/grades` (GET list, own for TECH; all for ADMIN).
  - `/presets` (GET list), `/presets/add` (GET/POST create).
- Views:
  - Add `addGrade.ejs`, `grades.ejs`, `presets.ejs`, `addPreset.ejs` under [views](views).
- Navigation:
  - Update [views/partials/navbar.ejs](views/partials/navbar.ejs) to show Grades/Presets based on role.
- Seeds:
  - Add `seeds/seedPresets.js` for initial presets and an ADMIN user.
- Cleanup (later):
  - Retire climate-specific `Sector`/`Project` usage once LGS MVP is stable.

---

## 21) Quick Notes
- Current data access uses [modules/projects.js](modules/projects.js) with Sequelize + Neon; [data/projectData.js](data/projectData.js) is legacy file-based and can be ignored for LGS.
- Tailwind/DaisyUI are already wired via [tailwind.config.js](tailwind.config.js) and [public/css/tailwind.css](public/css/tailwind.css) → built into [public/css/main.css](public/css/main.css).
- Keep serverless-friendly Sequelize config (SSL on, logging off) as in [modules/projects.js](modules/projects.js).
```

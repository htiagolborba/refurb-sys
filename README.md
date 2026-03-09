# Laptop Grading System (LGS)

Laptop Grading System (LGS) is a lightweight internal web application designed to standardize the laptop grading workflow in refurbishment environments.

It replaces multiple technician-maintained Excel spreadsheets (often shared via USB handoff) with a single browser-based system backed by a centralized database.

---

## Problem

In the current workflow:

- Each technician maintains a personal Excel spreadsheet
- Laptop details (serial number, CPU, RAM, SSD, battery health, notes) are recorded locally
- Files are exported to a USB drive and handed to a team lead
- The team lead manually merges spreadsheets into one master file

This creates issues such as:

- Inconsistent formats and missing data
- Duplicate work and manual merge errors
- No centralized history, auditing, or fast searching
- Risk of lost/overwritten USB files

---

## Solution

LGS centralizes grading into a shared system accessible from any browser:

- One shared database
- One shared web interface
- Standardized grading workflow
- Model presets to speed up entry and reduce inconsistencies

---

## Key Features

- **User & Permission Management**: Standardized DB-backed users with granular roles and permissions (Admins vs Technicians).
- **Model Presets**: Auto-fill hardware fields (CPU, RAM, SSD, Touch, Keyboard) with optional overrides.
- **Advanced Grading Form**:
  - Battery health tracking with "No Battery" support.
  - Keyboard layout selection (English / French).
  - Multi-state Touchscreen status (GOOD, BAD, NO).
  - Quick-insert buttons for common quality observations.
- **Intelligent History**:
  - Filter by Technician, Date, Model Preset, or Order ID.
  - Global Search by Serial Number across all orders.
  - Dynamic result numbering and author-based color coding.
- **Export Capabilities**: Generate professional Excel (.xlsx) and CSV reports with customized styling for audit-ready documentation.
- **Order Management**: Group evaluations into distinct Orders for better logistics tracking.

---

## Technology Stack

**Backend**
- Node.js
- Express.js
- Sequelize ORM (Multi-dialect support: SQLite & PostgreSQL)

**Database**
- PostgreSQL (Production)
- SQLite (Local Development)

**Frontend**
- EJS server-side templates
- TailwindCSS
- DaisyUI

**Authentication**
- Session-based authentication
- bcrypt password hashing

**Hosting**
- Render (Application)
- Neon (PostgreSQL Database)

---

## Architecture

Technician PC (browser)
↓
Web Application (Node / Express on Render)
↓
Centralized Database (Neon / PostgreSQL)

No local installation is required, which allows the system to run on restricted workstations.

---

## Project Status

This project has successfully transitioned from MVP to a robust internal tool. Core grading, history tracking, and reporting are fully implemented and optimized for production throughput.

### Recent Enhancements:
- Standardized project-wide header and licensing credits.
- Refined export formatting for better Excel compatibility.
- Improved UI alignment and accessibility for grading shortcuts.

### Roadmap:
- Reporting dashboards with performance metrics.
- Automated hardware detection (client-side bridge).
- Integration with external inventory APIs.

---

## Running Locally

### Requirements
- Node.js 18+
- SQLite (default) or PostgreSQL

### Environment variables

Create a `.env` file:

```bash
PGHOST=your-db-host
PGDATABASE=your-db-name
PGUSER=your-db-user
PGPASSWORD=your-db-password
SESSIONSECRET=your-session-secret
ADMINUSER=admin
ADMINPASSWORD=password
USE_SQLITE=true # Set to true for local testing without Postgres
```

### Install & Run

1. `npm install`
2. `node server.js`

Application will start on: [http://localhost:8080](http://localhost:8080)

---

## Author

Created and maintained by  
**Hiran Tiago Lins Borba. 2025-2026**

---

## License

This project is open source.  
Contributions and suggestions are (always) welcome.

# Laptop Grading System (LGS)

Laptop Grading System (LGS) is a lightweight internal web application designed to standardize the laptop grading workflow in refurbishment environments.

It replaces multiple technician-maintained Excel spreadsheets (often shared via USB handoff) with a single browser-based system backed by a centralized PostgreSQL database.

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

## Key Features (Current MVP)

- User login
- Laptop grading form
- Model preset selection with auto-filled hardware fields
- Editable CPU / RAM / SSD / Touchscreen fields (override allowed)
- Battery health tracking
- Notes / observations per device
- Technician grading history
- Admin preset management (basic)

---

## Model Presets

Many laptop models appear repeatedly with common configurations.

LGS supports **model presets** that auto-fill common specs when selected, while still allowing overrides if a device differs.

Example preset:
- Dell 7420 — i7 / 32GB / 256GB

Auto-filled fields:
- CPU
- RAM
- SSD
- Touchscreen

---

## Technology Stack

Backend
- Node.js
- Express.js
- Sequelize ORM

Database
- PostgreSQL (Neon)

Frontend
- EJS server-side templates
- TailwindCSS
- DaisyUI

Authentication
- Session-based authentication
- bcrypt password hashing

Hosting
- Render (application)
- Neon (database)

---

## Architecture

Technician PC (browser)
↓
Web Application (Node / Express on Render)
↓
PostgreSQL DB (Neon)



No local installation is required, which allows the system to run on restricted workstations.

---

## Project Status

This project is under active development.

The current version implements the core grading workflow. Additional features such as advanced filters, exports, and extended admin tools are planned.

Planned improvements:
- CSV export
- Advanced filtering (technician/date/model)
- Preset editing/disabling
- DB-backed user management (roles, disable/reset)
- Reporting dashboards

---

## Running Locally

### Requirements
- Node.js 18+
- PostgreSQL database (local or Neon)

### Environment variables

Create a `.env` file:

PGHOST=your-db-host
PGDATABASE=your-db-name
PGUSER=your-db-user
PGPASSWORD=your-db-password
SESSIONSECRET=your-session-secret
ADMINUSER=admin
ADMINPASSWORD=password

### Install dependencies

npm install


### Run the server

node server.js



Application will start on:  http://localhost:8080

---


## Deployment

The project is deployed using:
- **Render** for hosting the web app
- **Neon** for PostgreSQL

---

## Author

Created and maintened by  
**Hiran Tiago Lins Borba. 2025-2026**

---

## License



This project is open source.  
Contributions and suggestions are (always) welcome.





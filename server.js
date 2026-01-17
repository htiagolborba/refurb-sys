/*
 * Laptop Grading System (LGS)
 * Developed by: Hiran Tiago Lins Borba
 * Year: 2026
 * History:
 * - 0.1 (2026-01-17) Beta release
 */

const path = require("path");
const express = require("express");
const clientSessions = require("client-sessions");
require("dotenv").config();

const lgs = require("./modules/lgs");

const app = express();
const PORT = process.env.PORT || 8080;

// view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/css", express.static(path.join(__dirname, "public/css")));
app.use(express.urlencoded({ extended: true }));

// sessions
app.use(
  clientSessions({
    cookieName: "session",
    secret: process.env.SESSIONSECRET || "dev-secret-change-me",
    duration: 2 * 60 * 60 * 1000,      // 2h
    activeDuration: 5 * 60 * 1000      // +5min on activity
  })
);

// make session available to views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// current project for navbar/status
app.use(async (req, res, next) => {
  if (!req.session.currentProjectId) {
    res.locals.currentProject = null;
    return next();
  }

  try {
    const project = await lgs.getProjectById(req.session.currentProjectId);
    if (!project) {
      req.session.currentProjectId = null;
      res.locals.currentProject = null;
    } else {
      res.locals.currentProject = project;
    }
  } catch (err) {
    res.locals.currentProject = null;
  }

  next();
});

// ===== middleware =====
function ensureLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

function ensureAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  if (req.session.user.role !== "ADMIN") return res.status(403).render("500", { message: "Forbidden (Admin only)." });
  next();
}

// ===== routes =====

// Home
app.get("/", (req, res) => {
  res.render("home");
});

// Login
app.get("/login", (req, res) => {
  res.render("login", { errorMessage: null, userName: "" });
});

app.post("/login", async (req, res) => {
  try {
    const userName = (req.body.userName || "").trim();
    const password = req.body.password || "";

    const user = await lgs.authenticate(userName, password);
    if (!user) {
      return res.render("login", {
        errorMessage: "Invalid username or password (or user disabled).",
        userName
      });
    }

    req.session.user = user;
    res.redirect("/grades/new");
  } catch (err) {
    res.status(500).render("500", { message: `Login error: ${err.message || err}` });
  }
});

app.get("/logout", (req, res) => {
  req.session.reset();
  res.redirect("/");
});

// ===== Projects (ADMIN + TECH) =====
app.get("/projects", ensureLogin, async (req, res) => {
  try {
    const projects = await lgs.listProjects();
    res.render("projects", {
      projects,
      message: req.query.msg || ""
    });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load projects: ${err.message || err}` });
  }
});

app.get("/projects/new", ensureAdmin, (req, res) => {
  res.render("addProject", { errorMessage: null, form: {} });
});

app.post("/projects/new", ensureAdmin, async (req, res) => {
  try {
    await lgs.createProject(req.session.user, req.body);
    res.redirect("/projects?msg=Project created");
  } catch (err) {
    res.status(400).render("addProject", { errorMessage: err.message || String(err), form: req.body });
  }
});

app.get("/projects/:id/open", ensureLogin, async (req, res) => {
  try {
    const project = await lgs.getProjectById(req.params.id);
    if (!project) {
      return res.redirect("/projects?msg=Project not found");
    }
    if (project.status !== "OPEN") {
      return res.redirect("/projects?msg=Project is closed");
    }
    req.session.currentProjectId = project.id;
    res.redirect("/grades/new");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to open project: ${err.message || err}` });
  }
});

app.get("/projects/:id/close", ensureAdmin, async (req, res) => {
  try {
    await lgs.setProjectStatus(req.params.id, "CLOSED");
    if (String(req.session.currentProjectId) === String(req.params.id)) {
      req.session.currentProjectId = null;
    }
    res.redirect("/projects?msg=Project closed");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to close project: ${err.message || err}` });
  }
});

app.get("/projects/:id/export.csv", ensureAdmin, async (req, res) => {
  try {
    const project = await lgs.getProjectById(req.params.id);
    if (!project) {
      return res.status(404).render("500", { message: "Project not found." });
    }

    const grades = await lgs.listGradesForExport(req.params.id);
    const header = ["SERIAL", "BRAND", "MODEL", "CPU", "SSD", "MEMORY", "OBSERVATIONS", "TOUCHSCREEN", "TECHNICIAN", "DATE"];
    const rows = grades.map(g => [
      g.serialNumber,
      g.brand,
      g.model,
      g.cpu,
      g.ssdGb,
      g.ramGb,
      g.observations,
      g.touchStatus,
      g.User ? g.User.userName : "",
      new Date(g.createdAt).toISOString()
    ]);

    const csvLines = [header, ...rows]
      .map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=project-${project.id}.csv`);
    res.send(csvLines);
  } catch (err) {
    res.status(500).render("500", { message: `Unable to export CSV: ${err.message || err}` });
  }
});

app.get("/projects/:id/export.xlsx", ensureAdmin, async (req, res) => {
  res.status(501).render("500", { message: "XLSX export not implemented yet." });
});

// ===== Presets (ADMIN + TECH) =====
app.get("/presets", ensureLogin, async (req, res) => {
  try {
    const filters = {
      deviceType: req.query.deviceType || "",
      brand: req.query.brand || "",
      model: req.query.model || ""
    };

    const allPresets = await lgs.listPresetsDetailed({}, false);
    const presets = await lgs.listPresetsDetailed(filters, false);

    const deviceTypes = [...new Set(allPresets.map(p => p.deviceType || "LAPTOP"))].sort();
    const brands = [...new Set(allPresets.map(p => p.brand).filter(Boolean))].sort();
    const models = [...new Set(allPresets.map(p => p.model).filter(Boolean))].sort();

    res.render("presets", { presets, filters, deviceTypes, brands, models });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load presets: ${err.message || err}` });
  }
});

app.get("/presets/add", ensureLogin, (req, res) => {
  res.render("addPreset", { errorMessage: null, form: {} });
});

app.post("/presets/add", ensureLogin, async (req, res) => {
  try {
    await lgs.createPreset(req.session.user, req.body);
    res.redirect("/presets");
  } catch (err) {
    res.status(400).render("addPreset", { errorMessage: err.message || String(err), form: req.body });
  }
});

app.post("/presets/from-unit", ensureLogin, async (req, res) => {
  try {
    const preset = await lgs.createPresetFromUnit(req.session.user, req.body);
    res.redirect(`/grades/new?presetId=${preset.id}&msg=Preset created`);
  } catch (err) {
    res.redirect(`/grades/new?msg=${encodeURIComponent(err.message || String(err))}`);
  }
});

app.get("/presets/deactivate/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.setPresetActive(req.params.id, false);
    res.redirect("/presets");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to deactivate preset: ${err.message || err}` });
  }
});

app.get("/presets/activate/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.setPresetActive(req.params.id, true);
    res.redirect("/presets");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to activate preset: ${err.message || err}` });
  }
});

// ===== Grades (TECH + ADMIN) =====
app.get("/grades/new", ensureLogin, async (req, res) => {
  try {
    const project = res.locals.currentProject;
    if (!project) {
      return res.redirect("/projects?msg=Select a project first");
    }
    if (project.status !== "OPEN") {
      return res.redirect("/projects?msg=Selected project is closed");
    }

    const presets = await lgs.listPresetsFiltered({ deviceType: project.deviceType }, true);
    res.render("addGrade", {
      project,
      presets,
      errorMessage: null,
      successMessage: req.query.msg || null,
      form: { presetId: req.query.presetId || "" }
    });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load new grade page: ${err.message || err}` });
  }
});

app.post("/grades/new", ensureLogin, async (req, res) => {
  try {
    const project = res.locals.currentProject;
    if (!project) {
      return res.redirect("/projects?msg=Select a project first");
    }
    if (project.status !== "OPEN") {
      return res.redirect("/projects?msg=Selected project is closed");
    }

    await lgs.createGrade(req.session.user, req.body, project);
    const presets = await lgs.listPresetsFiltered({ deviceType: project.deviceType }, true);
    res.render("addGrade", {
      project,
      presets,
      errorMessage: null,
      successMessage: "Saved ✅",
      form: { presetId: req.body.presetId || "" }
    });
  } catch (err) {
    const project = res.locals.currentProject;
    const presets = project ? await lgs.listPresetsFiltered({ deviceType: project.deviceType }, true) : [];
    res.status(400).render("addGrade", {
      project,
      presets,
      errorMessage: err.message || String(err),
      successMessage: null,
      form: req.body
    });
  }
});

app.get("/grades", ensureLogin, async (req, res) => {
  try {
    let grades = [];
    let presets = [];
    let users = [];
    let projects = [];
    let deviceTypes = [];
    let models = [];
    const filters = {
      technician: req.query.technician || "",
      fromDate: req.query.fromDate || "",
      toDate: req.query.toDate || "",
      presetId: req.query.presetId || "",
      projectId: req.query.projectId || "",
      deviceType: req.query.deviceType || "",
      model: req.query.model || "",
      onlyMineToday: req.query.onlyMineToday === "1"
    };

    if (req.session.user.role === "ADMIN") {
      presets = await lgs.listPresets(false);
      users = await lgs.listUsers();
      projects = await lgs.listProjects();
      deviceTypes = [...new Set(projects.map(p => p.deviceType))].sort();
      models = [...new Set(presets.map(p => p.model).filter(Boolean))].sort();
      grades = await lgs.listGradesAdminFiltered(filters);
    } else {
      const project = res.locals.currentProject;
      if (!project) {
        return res.redirect("/projects?msg=Select a project first");
      }

      grades = await lgs.listGradesForProject(project.id, {
        onlyMineToday: filters.onlyMineToday,
        userId: req.session.user.id
      });
    }

    res.render("grades", { grades, presets, users, projects, deviceTypes, models, filters });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load grades: ${err.message || err}` });
  }
});

// ===== Users (ADMIN) =====
app.get("/admin/users", ensureAdmin, async (req, res) => {
  try {
    const users = await lgs.listUsers();
    res.render("users", { users, errorMessage: null });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load users: ${err.message || err}` });
  }
});

app.post("/admin/users/add", ensureAdmin, async (req, res) => {
  try {
    const userName = (req.body.userName || "").trim();
    const password = req.body.password || "";
    const role = req.body.role || "TECH";

    if (!userName || !password) throw new Error("Username and password are required.");

    await lgs.createUser({ userName, password, role });
    res.redirect("/admin/users");
  } catch (err) {
    const users = await lgs.listUsers();
    res.status(400).render("users", { users, errorMessage: err.message || String(err) });
  }
});

app.get("/admin/users/disable/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.setUserActive(req.params.id, false);
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to disable user: ${err.message || err}` });
  }
});

app.get("/admin/users/enable/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.setUserActive(req.params.id, true);
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to enable user: ${err.message || err}` });
  }
});

app.get("/admin/users/role/:id", ensureAdmin, async (req, res) => {
  try {
    const role = req.query.role || "TECH";
    await lgs.setUserRole(req.params.id, role);
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to set role: ${err.message || err}` });
  }
});

// 404
app.use((req, res) => {
  res.status(404).render("404");
});

// start
lgs.initialize()
  .then(() => {
    if (!process.env.VERCEL) {
      app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
    }
  })
  .catch((err) => {
    console.log("Unable to start server: " + err);
  });

module.exports = app;

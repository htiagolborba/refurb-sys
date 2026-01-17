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

// ===== Presets (ADMIN) =====
app.get("/presets", ensureAdmin, async (req, res) => {
  try {
    const filters = {
      deviceType: req.query.deviceType || "",
      brand: req.query.brand || "",
      model: req.query.model || ""
    };

    const allPresets = await lgs.listPresets(false);
    const presets = await lgs.listPresetsFiltered(filters, false);

    const deviceTypes = [...new Set(allPresets.map(p => p.deviceType || "LAPTOP"))].sort();
    const brands = [...new Set(allPresets.map(p => p.brand).filter(Boolean))].sort();
    const models = [...new Set(allPresets.map(p => p.model).filter(Boolean))].sort();

    res.render("presets", { presets, filters, deviceTypes, brands, models });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load presets: ${err.message || err}` });
  }
});

app.get("/presets/add", ensureAdmin, (req, res) => {
  res.render("addPreset", { errorMessage: null, form: {} });
});

app.post("/presets/add", ensureAdmin, async (req, res) => {
  try {
    await lgs.createPreset(req.body);
    res.redirect("/presets");
  } catch (err) {
    res.status(400).render("addPreset", { errorMessage: err.message || String(err), form: req.body });
  }
});

app.get("/presets/disable/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.disablePreset(req.params.id);
    res.redirect("/presets");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to disable preset: ${err.message || err}` });
  }
});

// ===== Grades (TECH + ADMIN) =====
app.get("/grades/new", ensureLogin, async (req, res) => {
  try {
    const presets = await lgs.listPresets(true);
    res.render("addGrade", { presets, errorMessage: null, successMessage: null, form: {} });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load new grade page: ${err.message || err}` });
  }
});

app.post("/grades/new", ensureLogin, async (req, res) => {
  try {
    await lgs.createGrade(req.session.user, req.body);
    const presets = await lgs.listPresets(true);
    res.render("addGrade", { presets, errorMessage: null, successMessage: "Saved ✅", form: {} });
  } catch (err) {
    const presets = await lgs.listPresets(true);
    res.status(400).render("addGrade", { presets, errorMessage: err.message || String(err), successMessage: null, form: req.body });
  }
});

app.get("/grades", ensureLogin, async (req, res) => {
  try {
    let grades = [];
    let presets = [];
    let users = [];
    let filters = {
      technician: req.query.technician || "",
      fromDate: req.query.fromDate || "",
      toDate: req.query.toDate || "",
      presetId: req.query.presetId || ""
    };

    if (req.session.user.role === "ADMIN") {
      presets = await lgs.listPresets(false);
      users = await lgs.listUsers();
      grades = await lgs.listGradesAdminFiltered(filters);
    } else {
      grades = await lgs.listGradesForUser(req.session.user);
    }

    res.render("grades", { grades, presets, users, filters });
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

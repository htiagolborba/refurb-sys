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

// ===== Presets (TECH + ADMIN) =====
app.get("/presets", ensureLogin, async (req, res) => {
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

app.get("/presets/add", ensureLogin, (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canAddPreset) {
    return res.status(403).render("500", { message: "Permission Denied: Add Presets" });
  }
  res.render("addPreset", { errorMessage: null, form: {} });
});

app.post("/presets/add", ensureLogin, async (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canAddPreset) {
    return res.status(403).render("500", { message: "Permission Denied: Add Presets" });
  }
  try {
    await lgs.createPreset(req.body);
    res.redirect("/presets");
  } catch (err) {
    res.status(400).render("addPreset", { errorMessage: err.message || String(err), form: req.body });
  }
});

app.get("/presets/edit/:id", ensureLogin, async (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canEditPreset) {
    return res.status(403).render("500", { message: "Permission Denied: Edit Presets" });
  }
  try {
    const preset = await lgs.getPreset(req.params.id);
    if (!preset) return res.status(404).render("404");
    res.render("editPreset", { preset, errorMessage: null });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load edit preset page: ${err.message || err}` });
  }
});

app.post("/presets/edit/:id", ensureLogin, async (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canEditPreset) {
    return res.status(403).render("500", { message: "Permission Denied: Edit Presets" });
  }
  try {
    await lgs.updatePreset(req.params.id, req.body);
    res.redirect("/presets");
  } catch (err) {
    const preset = await lgs.getPreset(req.params.id);
    res.status(400).render("editPreset", { preset, errorMessage: err.message || String(err) });
  }
});

app.post("/presets/delete/:id", ensureLogin, async (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canDeletePreset) {
    return res.status(403).render("500", { message: "Permission Denied: Delete Presets" });
  }
  try {
    const password = req.body.adminPassword || "";
    // Re-authenticate to confirm it's actually the user
    const validUser = await lgs.authenticate(req.session.user.userName, password);
    if (!validUser) {
      return res.status(403).send("Invalid Password");
    }
    await lgs.deletePreset(req.params.id);
    res.redirect("/presets");
  } catch (err) {
    res.status(500).render("500", { message: `Unable to delete preset: ${err.message || err}` });
  }
});

// ===== Orders (TECH + ADMIN) =====
app.get("/orders/new", ensureLogin, (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canAddOrder) {
    return res.status(403).render("500", { message: "Permission Denied: Create Order" });
  }
  res.render("newOrder", { errorMessage: null, form: {} });
});

app.post("/orders/new", ensureLogin, async (req, res) => {
  if (req.session.user.role !== "ADMIN" && !req.session.user.canAddOrder) {
    return res.status(403).render("500", { message: "Permission Denied: Create Order" });
  }
  try {
    const name = (req.body.name || "").trim();
    const orderIdStr = (req.body.orderId || "").trim();
    if (!name && !orderIdStr) {
      throw new Error("Must provide an Order ID or a Name for the order.");
    }
    const o = await lgs.createOrder(req.body);
    // Redirect directly to grading with this order pre-selected
    res.redirect(`/grades/new?orderId=${o.id}`);
  } catch (err) {
    res.status(400).render("newOrder", { errorMessage: err.message || String(err), form: req.body });
  }
});

// ===== Grades (TECH + ADMIN) =====
app.get("/grades/new", ensureLogin, async (req, res) => {
  try {
    const presets = await lgs.listPresetsFiltered({}, true); // fetch only active presets
    const orders = await lgs.listOrders();
    const orderId = req.query.orderId || null;
    const presetId = req.query.presetId || null;
    let orderGrades = [];

    if (orderId) {
      orderGrades = await lgs.listGradesByOrder(orderId);
    }

    res.render("addGrade", {
      presets,
      orders,
      orderId,
      presetId,
      orderGrades,
      errorMessage: null,
      successMessage: null,
      form: {}
    });
  } catch (err) {
    res.status(500).render("500", { message: `Unable to load new grade page: ${err.message || err}` });
  }
});

app.post("/grades/new", ensureLogin, async (req, res) => {
  const selectedOrderId = req.body.orderId;
  const selectedPresetId = req.body.presetId;

  try {
    if (!selectedOrderId) {
      throw new Error("Please select an Order to start grading.");
    }
    await lgs.createGrade(req.session.user, req.body);

    // Redirect via GET so we don't resubmit, keeping the same order and preset
    const redirectUrl = `/grades/new?orderId=${selectedOrderId}${selectedPresetId ? `&presetId=${selectedPresetId}` : ""}`;
    res.redirect(redirectUrl);
  } catch (err) {
    const presets = await lgs.listPresetsFiltered({}, true);
    const orders = await lgs.listOrders();
    let orderGrades = [];
    if (selectedOrderId) {
      orderGrades = await lgs.listGradesByOrder(selectedOrderId);
    }
    res.render("addGrade", {
      presets,
      orders,
      orderId: selectedOrderId,
      presetId: selectedPresetId,
      orderGrades,
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
    let filters = {
      technician: req.query.technician || "",
      fromDate: req.query.fromDate || "",
      toDate: req.query.toDate || "",
      presetId: req.query.presetId || "",
      orderQuery: req.query.orderQuery || ""
    };

    presets = await lgs.listPresets(false);
    users = await lgs.listUsers();
    grades = await lgs.listGradesAdminFiltered(filters);

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

    await lgs.createUser({
      userName,
      password,
      role,
      canAddPreset: req.body.canAddPreset === "on",
      canEditPreset: req.body.canEditPreset === "on",
      canDeletePreset: req.body.canDeletePreset === "on",
      canAddOrder: req.body.canAddOrder === "on",
      canEditOrder: req.body.canEditOrder === "on",
      canDeleteOrder: req.body.canDeleteOrder === "on",
      canAddUser: req.body.canAddUser === "on",
      canEditUser: !!(req.body.canEditUser === "on"),
      canDeleteUser: !!(req.body.canDeleteUser === "on")
    });
    res.redirect("/admin/users");
  } catch (err) {
    const users = await lgs.listUsers();
    res.status(400).render("users", { users, errorMessage: err.message || String(err) });
  }
});

app.post("/admin/users/permissions/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.updateUserPermissions(req.params.id, {
      canAddPreset: req.body.canAddPreset === "on",
      canEditPreset: req.body.canEditPreset === "on",
      canDeletePreset: req.body.canDeletePreset === "on",
      canAddOrder: req.body.canAddOrder === "on",
      canEditOrder: req.body.canEditOrder === "on",
      canDeleteOrder: req.body.canDeleteOrder === "on",
      canAddUser: req.body.canAddUser === "on",
      canEditUser: req.body.canEditUser === "on",
      canDeleteUser: req.body.canDeleteUser === "on"
    });
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("500", { message: `Error updating permissions: ${err}` });
  }
});

app.post("/admin/users/password/:id", ensureAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) throw new Error("New password is required");
    await lgs.updateUserPassword(req.params.id, newPassword);
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("500", { message: `Error updating password: ${err}` });
  }
});

app.post("/admin/users/delete/:id", ensureAdmin, async (req, res) => {
  try {
    await lgs.deleteUser(req.params.id);
    res.redirect("/admin/users");
  } catch (err) {
    res.status(500).render("500", { message: `Error deleting user: ${err}` });
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

// ===== Grade Actions (Edit/Delete) =====
app.post("/grades/edit/:id", ensureLogin, async (req, res) => {
  try {
    await lgs.updateGrade(req.params.id, req.body);
    const backURL = req.header('Referer') || '/grades';
    res.redirect(backURL);
  } catch (err) {
    res.status(500).render("500", { message: `Error updating grade: ${err}` });
  }
});

app.post("/grades/delete/:id", ensureLogin, async (req, res) => {
  try {
    await lgs.deleteGrade(req.params.id);
    const backURL = req.header('Referer') || '/grades';
    res.redirect(backURL);
  } catch (err) {
    res.status(500).render("500", { message: `Error deleting grade: ${err}` });
  }
});

// ===== Help =====
app.get("/help/guidelines", ensureLogin, (req, res) => {
  res.render("help/guidelines");
});

app.get("/help/about", ensureLogin, (req, res) => {
  res.render("help/about");
});

// 404
app.use((req, res) => {
  res.status(404).render("404");
});

// start
lgs.initialize()
  .then(() => {
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  })
  .catch((err) => {
    console.log("Unable to start server: " + err);
  });

module.exports = app;

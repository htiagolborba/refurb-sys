/*
 * Laptop Grading System (LGS)
 * Developed by: Hiran Tiago Lins Borba
 * Year: 2026
 * History:
 * - 0.1 (2026-01-17) Beta release
 */

require("dotenv").config();
const path = require("path");
const Sequelize = require("sequelize");
const bcrypt = require("bcryptjs");

const isSQLite =
  (process.env.DB_DIALECT || "").toLowerCase() === "sqlite" ||
  process.env.USE_SQLITE === "true" ||
  !process.env.PGHOST;

const sequelize = isSQLite
  ? new Sequelize({
      dialect: "sqlite",
      storage: process.env.SQLITE_PATH || path.join(__dirname, "..", "lgs.sqlite"),
      logging: false
    })
  : new Sequelize(
      process.env.PGDATABASE,
      process.env.PGUSER,
      process.env.PGPASSWORD,
      {
        host: process.env.PGHOST,
        dialect: "postgres",
        dialectOptions: {
          ssl: { require: true, rejectUnauthorized: false }
        },
        logging: false,
        pool: {
          max: 1,       // serverless-friendly
          min: 0,
          idle: 10000,
          acquire: 30000,
          evict: 10000
        }
      }
    );

// ===== Models =====

const User = sequelize.define("User", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  userName: { type: Sequelize.STRING, unique: true, allowNull: false },
  passwordHash: { type: Sequelize.STRING, allowNull: false },
  role: { type: Sequelize.STRING, allowNull: false, defaultValue: "TECH" }, // TECH | ADMIN
  active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }
}, { timestamps: true });

const ModelPreset = sequelize.define("ModelPreset", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  deviceType: { type: Sequelize.STRING, allowNull: false, defaultValue: "LAPTOP" }, // LAPTOP | DESKTOP
  brand: { type: Sequelize.STRING, allowNull: false },          // Dell
  model: { type: Sequelize.STRING, allowNull: false },          // 7420
  presetLabel: { type: Sequelize.STRING, allowNull: false },    // "7420 i7 32/256"
  defaultCpu: { type: Sequelize.STRING, allowNull: false },
  defaultRamGb: { type: Sequelize.INTEGER, allowNull: false },
  defaultSsdGb: { type: Sequelize.INTEGER, allowNull: false },
  touchDefault: { type: Sequelize.STRING, allowNull: false, defaultValue: "NO_TOUCH" }, // TOUCH | NO_TOUCH | BROKEN
  defaultObservations: { type: Sequelize.TEXT, allowNull: true },
  active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }
}, { timestamps: true });

const Project = sequelize.define("Project", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  projectName: { type: Sequelize.STRING, allowNull: false },
  projectDate: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
  deviceType: { type: Sequelize.STRING, allowNull: false }, // LAPTOP | DESKTOP
  status: { type: Sequelize.STRING, allowNull: false, defaultValue: "OPEN" } // OPEN | CLOSED
}, { timestamps: true });

const LaptopGrade = sequelize.define("LaptopGrade", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  serialNumber: { type: Sequelize.STRING, allowNull: false },
  projectId: { type: Sequelize.INTEGER, allowNull: true },
  brand: { type: Sequelize.STRING, allowNull: false, defaultValue: "" },
  model: { type: Sequelize.STRING, allowNull: false, defaultValue: "" },
  // snapshot fields (editável no form)
  cpu: { type: Sequelize.STRING, allowNull: false, defaultValue: "" },
  ramGb: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
  ssdGb: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
  touchStatus: { type: Sequelize.STRING, allowNull: false, defaultValue: "NO_TOUCH" }, // TOUCH | NO_TOUCH | BROKEN
  touchscreen: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  batteryHealthPercent: { type: Sequelize.INTEGER, allowNull: true },
  observations: { type: Sequelize.TEXT, allowNull: false, defaultValue: "", field: "notes" }
}, {
  timestamps: true,
  indexes: [
    { unique: true, fields: ["projectId", "serialNumber"] }
  ]
});

// Relations
Project.belongsTo(User, { foreignKey: "createdByUserId" });
Project.hasMany(LaptopGrade, { foreignKey: "projectId" });
ModelPreset.belongsTo(User, { foreignKey: "createdByUserId" });
LaptopGrade.belongsTo(Project, { foreignKey: "projectId" });
LaptopGrade.belongsTo(User, { foreignKey: "createdByUserId" });
LaptopGrade.belongsTo(ModelPreset, { foreignKey: "presetId" });

// ===== Helpers =====
function normalizeInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBool(value) {
  // checkbox returns "on" when checked
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

function normalizeTouchStatus(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (["TOUCH", "NO_TOUCH", "BROKEN"].includes(normalized)) return normalized;
  return "NO_TOUCH";
}

function buildPresetLabel({ brand, model, cpu, ramGb, ssdGb }) {
  const parts = [brand, model, cpu].filter(Boolean);
  const memory = (ramGb && ssdGb) ? `${ramGb}/${ssdGb}` : "";
  if (memory) parts.push(memory);
  return parts.join(" ").trim();
}

// ===== Init =====
async function initialize() {
  await sequelize.sync({ alter: true });

  // Ensure initial admin exists
  const adminUser = process.env.INITIAL_ADMIN_USER;
  const adminPass = process.env.INITIAL_ADMIN_PASS;

  if (adminUser && adminPass) {
    const existing = await User.findOne({ where: { userName: adminUser } });
    if (!existing) {
      const hash = await bcrypt.hash(adminPass, 10);
      await User.create({
        userName: adminUser,
        passwordHash: hash,
        role: "ADMIN",
        active: true
      });
    }
  }
}

// ===== Auth =====
async function authenticate(userName, password) {
  const user = await User.findOne({ where: { userName } });
  if (!user) return null;
  if (!user.active) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    userName: user.userName,
    role: user.role
  };
}

// ===== Users (ADMIN) =====
async function listUsers() {
  const users = await User.findAll({ order: [["userName", "ASC"]] });
  return users.map(u => u.toJSON());
}

async function createUser({ userName, password, role }) {
  const hash = await bcrypt.hash(password, 10);
  await User.create({
    userName,
    passwordHash: hash,
    role: role === "ADMIN" ? "ADMIN" : "TECH",
    active: true
  });
}

async function setUserActive(userId, active) {
  await User.update({ active: !!active }, { where: { id: userId } });
}

async function setUserRole(userId, role) {
  await User.update({ role: role === "ADMIN" ? "ADMIN" : "TECH" }, { where: { id: userId } });
}

// ===== Presets =====
async function listPresets(activeOnly = true) {
  const where = activeOnly ? { active: true } : {};
  const presets = await ModelPreset.findAll({ where, order: [["brand", "ASC"], ["model", "ASC"], ["presetLabel", "ASC"]] });
  return presets.map(p => p.toJSON());
}

async function listPresetsFiltered(filters, activeOnly = true) {
  const where = activeOnly ? { active: true } : {};

  if (filters.deviceType && filters.deviceType.trim()) {
    where.deviceType = filters.deviceType.trim();
  }

  if (filters.brand && filters.brand.trim()) {
    where.brand = filters.brand.trim();
  }

  if (filters.model && filters.model.trim()) {
    where.model = filters.model.trim();
  }

  const presets = await ModelPreset.findAll({
    where,
    order: [["brand", "ASC"], ["model", "ASC"], ["presetLabel", "ASC"]]
  });
  return presets.map(p => p.toJSON());
}

async function listPresetsDetailed(filters, activeOnly = false) {
  const where = activeOnly ? { active: true } : {};

  if (filters.deviceType && filters.deviceType.trim()) {
    where.deviceType = filters.deviceType.trim();
  }

  if (filters.brand && filters.brand.trim()) {
    where.brand = filters.brand.trim();
  }

  if (filters.model && filters.model.trim()) {
    where.model = filters.model.trim();
  }

  const presets = await ModelPreset.findAll({
    where,
    include: [
      { model: User, attributes: ["userName"] }
    ],
    order: [["brand", "ASC"], ["model", "ASC"], ["presetLabel", "ASC"]]
  });
  return presets.map(p => p.toJSON());
}

async function createPreset(user, body) {
  const rawBrand = body.brand === "OTHER" ? body.brandOther : body.brand;
  const brand = (rawBrand || "").trim();
  if (!brand) {
    throw new Error("Brand is required.");
  }

  const model = (body.model || "").trim();
  if (!model) {
    throw new Error("Model is required.");
  }

  const rawRam = body.defaultRamGb === "OTHER" ? body.defaultRamGbOther : body.defaultRamGb;
  const ramGb = normalizeInt(rawRam, 0);
  if (!ramGb) {
    throw new Error("Default RAM is required.");
  }

  const ssdGb = normalizeInt(body.defaultSsdGb, 0);
  if (!ssdGb) {
    throw new Error("Default SSD is required.");
  }

  const defaultCpu = (body.defaultCpu || "").trim();
  if (!defaultCpu) {
    throw new Error("Default CPU is required.");
  }

  const presetLabel = (body.presetLabel || "").trim() || `${brand} ${model} ${ramGb}/${ssdGb}`;

  await ModelPreset.create({
    deviceType: (body.deviceType === "DESKTOP") ? "DESKTOP" : "LAPTOP",
    brand,
    model,
    presetLabel,
    defaultCpu,
    defaultRamGb: ramGb,
    defaultSsdGb: ssdGb,
    touchDefault: normalizeTouchStatus(body.touchDefault),
    defaultObservations: (body.defaultObservations || "").trim() || null,
    createdByUserId: user.id,
    active: true
  });
}

async function createPresetFromUnit(user, body) {
  const deviceType = (body.deviceType === "DESKTOP") ? "DESKTOP" : "LAPTOP";
  const brand = (body.brand || "").trim();
  const model = (body.model || "").trim();
  const cpu = (body.cpu || "").trim();
  const ramGb = normalizeInt(body.ramGb, 0);
  const ssdGb = normalizeInt(body.ssdGb, 0);
  const touchDefault = normalizeTouchStatus(body.touchStatus);
  const defaultObservations = (body.observations || "").trim() || null;

  if (!brand || !model || !cpu || !ramGb || !ssdGb) {
    throw new Error("Missing required fields to create preset.");
  }

  const presetLabel = buildPresetLabel({ brand, model, cpu, ramGb, ssdGb }) || `${brand} ${model}`;

  const preset = await ModelPreset.create({
    deviceType,
    brand,
    model,
    presetLabel,
    defaultCpu: cpu,
    defaultRamGb: ramGb,
    defaultSsdGb: ssdGb,
    touchDefault,
    defaultObservations,
    createdByUserId: user.id,
    active: true
  });

  return preset.toJSON();
}

async function getPresetById(id) {
  const preset = await ModelPreset.findOne({ where: { id } });
  return preset ? preset.toJSON() : null;
}

async function disablePreset(id) {
  await ModelPreset.update({ active: false }, { where: { id } });
}

async function setPresetActive(id, active) {
  await ModelPreset.update({ active: !!active }, { where: { id } });
}

// ===== Projects =====
async function listProjects() {
  const projects = await Project.findAll({
    order: [["createdAt", "DESC"]]
  });

  const counts = await Promise.all(
    projects.map(p => LaptopGrade.count({ where: { projectId: p.id } }))
  );

  return projects.map((p, i) => ({
    ...p.toJSON(),
    unitCount: counts[i]
  }));
}

async function createProject(user, body) {
  const projectName = (body.projectName || "").trim();
  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const deviceType = (body.deviceType === "DESKTOP") ? "DESKTOP" : "LAPTOP";

  return Project.create({
    projectName,
    deviceType,
    status: "OPEN",
    createdByUserId: user.id
  });
}

async function getProjectById(id) {
  const project = await Project.findOne({ where: { id } });
  return project ? project.toJSON() : null;
}

async function setProjectStatus(id, status) {
  const nextStatus = status === "CLOSED" ? "CLOSED" : "OPEN";
  await Project.update({ status: nextStatus }, { where: { id } });
}

async function listGradesForExport(projectId) {
  const grades = await LaptopGrade.findAll({
    where: { projectId },
    include: [
      { model: User, attributes: ["userName"] },
      { model: Project, attributes: ["projectName", "projectDate", "deviceType", "status"] }
    ],
    order: [["createdAt", "ASC"]]
  });

  return grades.map(g => g.toJSON());
}

// ===== Grades =====
async function createGrade(user, body, project) {
  if (!project) {
    throw new Error("Select a project first.");
  }
  if (project.status !== "OPEN") {
    throw new Error("Selected project is closed.");
  }

  const presetId = normalizeInt(body.presetId, null);
  let preset = null;

  if (presetId) {
    preset = await ModelPreset.findOne({ where: { id: presetId, active: true } });
  }

  const serialNumber = (body.serialNumber || "").trim();
  if (!serialNumber) {
    throw new Error("Serial Number is required.");
  }

  const existing = await LaptopGrade.findOne({ where: { projectId: project.id, serialNumber } });
  if (existing) {
    throw new Error("Serial already exists in this project.");
  }

  const brand = ((body.brand || "").trim() || (preset ? preset.brand : "")).trim();
  const model = ((body.model || "").trim() || (preset ? preset.model : "")).trim();
  const cpu = ((body.cpu || "").trim() || (preset ? preset.defaultCpu : "")).trim();
  const ramGb = normalizeInt(body.ramGb, preset ? preset.defaultRamGb : 0);
  const ssdGb = normalizeInt(body.ssdGb, preset ? preset.defaultSsdGb : 0);
  const touchStatus = normalizeTouchStatus(body.touchStatus || (preset ? preset.touchDefault : "NO_TOUCH"));
  const observations = ((body.observations || "").trim() || (preset ? (preset.defaultObservations || "") : "")).trim();

  if (!brand || !model || !cpu || !ramGb || !ssdGb) {
    throw new Error("Brand, model, CPU, RAM and SSD are required.");
  }

  if (!observations) {
    throw new Error("Observations are required.");
  }

  const rawBattery = (body.batteryHealthPercent || "").toString().trim();
  let battery = null;
  if (rawBattery) {
    battery = normalizeInt(rawBattery, -1);
    if (battery < 0 || battery > 100) {
      throw new Error("Battery Health must be between 0 and 100.");
    }
  }

  await LaptopGrade.create({
    projectId: project.id,
    serialNumber,
    brand,
    model,
    cpu,
    ramGb,
    ssdGb,
    touchStatus,
    touchscreen: touchStatus === "TOUCH",
    batteryHealthPercent: battery,
    observations,
    presetId: preset ? preset.id : null,
    createdByUserId: user.id
  });
}

async function listGradesForProject(projectId, options = {}) {
  const where = { projectId };

  if (options.onlyMineToday && options.userId) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.createdByUserId = options.userId;
    where.createdAt = { [Sequelize.Op.between]: [start, end] };
  }

  const grades = await LaptopGrade.findAll({
    where,
    include: [
      { model: User, attributes: ["userName", "role"] },
      { model: ModelPreset, attributes: ["brand", "model", "presetLabel"] },
      { model: Project, attributes: ["projectName", "projectDate", "deviceType", "status"] }
    ],
    order: [["createdAt", "DESC"]],
    limit: 1000
  });

  return grades.map(g => g.toJSON());
}

async function listGradesForUser(user) {
  const where = (user.role === "ADMIN") ? {} : { createdByUserId: user.id };

  const grades = await LaptopGrade.findAll({
    where,
    include: [
      { model: User, attributes: ["userName", "role"] },
      { model: ModelPreset, attributes: ["brand", "model", "presetLabel"] },
      { model: Project, attributes: ["projectName", "projectDate", "deviceType", "status"] }
    ],
    order: [["createdAt", "DESC"]],
    limit: 500
  });

  return grades.map(g => g.toJSON());
}

async function listGradesAdminFiltered(filters) {
  const where = {};

  if (filters.projectId) {
    where.projectId = normalizeInt(filters.projectId, null);
  }

  if (filters.model && filters.model.trim()) {
    where.model = filters.model.trim();
  }

  if (filters.fromDate && filters.toDate) {
    where.createdAt = {
      [Sequelize.Op.between]: [new Date(filters.fromDate), new Date(filters.toDate)]
    };
  } else if (filters.fromDate) {
    where.createdAt = { [Sequelize.Op.gte]: new Date(filters.fromDate) };
  } else if (filters.toDate) {
    where.createdAt = { [Sequelize.Op.lte]: new Date(filters.toDate) };
  }

  const includeUser = {
    model: User,
    attributes: ["userName", "role"]
  };

  if (filters.technician && filters.technician.trim()) {
    includeUser.where = { userName: filters.technician.trim() };
  }

  const includePreset = {
    model: ModelPreset,
    attributes: ["brand", "model", "presetLabel"]
  };

  if (filters.presetId) {
    where.presetId = normalizeInt(filters.presetId, null);
  }

  const includeProject = {
    model: Project,
    attributes: ["projectName", "projectDate", "deviceType", "status"]
  };

  if (filters.deviceType && filters.deviceType.trim()) {
    includeProject.where = { deviceType: filters.deviceType.trim() };
  }

  const grades = await LaptopGrade.findAll({
    where,
    include: [includeUser, includePreset, includeProject],
    order: [["createdAt", "DESC"]],
    limit: 2000
  });

  return grades.map(g => g.toJSON());
}

module.exports = {
  initialize,
  authenticate,

  // users
  listUsers,
  createUser,
  setUserActive,
  setUserRole,

  // presets
  listPresets,
  listPresetsFiltered,
  listPresetsDetailed,
  createPreset,
  createPresetFromUnit,
  getPresetById,
  disablePreset,
  setPresetActive,

  // projects
  listProjects,
  createProject,
  getProjectById,
  setProjectStatus,
  listGradesForExport,

  // grades
  createGrade,
  listGradesForProject,
  listGradesForUser,
  listGradesAdminFiltered
};

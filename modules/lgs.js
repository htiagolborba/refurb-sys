require("dotenv").config();
const Sequelize = require("sequelize");
const bcrypt = require("bcryptjs");

let sequelize;

if (process.env.USE_SQLITE === "true") {
  // Local development with SQLite
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: false
  });
  console.log("Using SQLite database (Local Dev)");
} else {
  // Neon / Postgres via env vars (Production)
  sequelize = new Sequelize(
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
  console.log("Using PostgreSQL database (Production)");
}

// ===== Models =====

const User = sequelize.define("User", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  userName: { type: Sequelize.STRING, unique: true, allowNull: false },
  passwordHash: { type: Sequelize.STRING, allowNull: false },
  role: { type: Sequelize.STRING, allowNull: false, defaultValue: "TECH" }, // TECH | ADMIN
  active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

  // Permissions
  canAddPreset: { type: Sequelize.BOOLEAN, defaultValue: false },
  canEditPreset: { type: Sequelize.BOOLEAN, defaultValue: false },
  canDeletePreset: { type: Sequelize.BOOLEAN, defaultValue: false },
  canAddOrder: { type: Sequelize.BOOLEAN, defaultValue: false },
  canEditOrder: { type: Sequelize.BOOLEAN, defaultValue: false },
  canDeleteOrder: { type: Sequelize.BOOLEAN, defaultValue: false },
  canAddUser: { type: Sequelize.BOOLEAN, defaultValue: false },
  canEditUser: { type: Sequelize.BOOLEAN, defaultValue: false },
  canDeleteUser: { type: Sequelize.BOOLEAN, defaultValue: false }
}, { timestamps: true });

const ModelPreset = sequelize.define("ModelPreset", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  deviceType: { type: Sequelize.STRING, allowNull: false, defaultValue: "LAPTOP" }, // LAPTOP | DESKTOP
  brand: { type: Sequelize.STRING, allowNull: false },          // Dell
  model: { type: Sequelize.STRING, allowNull: false },          // 7420
  observations: { type: Sequelize.TEXT, allowNull: true },      // Renamed from presetLabel
  defaultCpu: { type: Sequelize.STRING, allowNull: false },
  defaultRamGb: { type: Sequelize.INTEGER, allowNull: false },
  defaultSsdGb: { type: Sequelize.INTEGER, allowNull: true },   // Now optional
  defaultTouchscreen: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }
}, { timestamps: true });

const Order = sequelize.define("Order", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: Sequelize.STRING, allowNull: true },
  orderId: { type: Sequelize.STRING, allowNull: true }
}, { timestamps: true });

const LaptopGrade = sequelize.define("LaptopGrade", {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  serialNumber: { type: Sequelize.STRING, allowNull: false },
  // snapshot fields (editável no form)
  cpu: { type: Sequelize.STRING, allowNull: false },
  ramGb: { type: Sequelize.INTEGER, allowNull: false },
  ssdGb: { type: Sequelize.INTEGER, allowNull: true },
  touchscreen: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
  batteryHealthPercent: { type: Sequelize.INTEGER, allowNull: false },
  notes: { type: Sequelize.TEXT, allowNull: false, defaultValue: "" }
}, { timestamps: true });

// Relations
LaptopGrade.belongsTo(User, { foreignKey: "createdByUserId" });
LaptopGrade.belongsTo(ModelPreset, { foreignKey: "presetId" });
LaptopGrade.belongsTo(Order, { foreignKey: "orderIdRef" }); // Using orderIdRef to avoid conflict with the string orderId if needed, but since Order has 'id', standard is 'OrderId'. Let's use 'OrderRefId'

// ===== Helpers =====
function normalizeInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBool(value) {
  // checkbox returns "on" when checked
  return value === true || value === "true" || value === "on" || value === "1" || value === 1;
}

// ===== Init =====
async function initialize() {
  await sequelize.sync({ alter: true }); // Enable alter for schema updates

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
    role: user.role,
    canAddPreset: user.canAddPreset,
    canEditPreset: user.canEditPreset,
    canDeletePreset: user.canDeletePreset,
    canAddOrder: user.canAddOrder,
    canEditOrder: user.canEditOrder,
    canDeleteOrder: user.canDeleteOrder,
    canAddUser: user.canAddUser,
    canEditUser: user.canEditUser,
    canDeleteUser: user.canDeleteUser
  };
}

// ===== Users (ADMIN) =====
async function listUsers() {
  const users = await User.findAll({ order: [["userName", "ASC"]] });
  return users.map(u => u.toJSON());
}

async function createUser(userData) {
  const { userName, password, role, ...perms } = userData;
  const hash = await bcrypt.hash(password, 10);
  await User.create({
    userName,
    passwordHash: hash,
    role: role === "ADMIN" ? "ADMIN" : "TECH",
    active: true,
    canAddPreset: !!perms.canAddPreset,
    canEditPreset: !!perms.canEditPreset,
    canDeletePreset: !!perms.canDeletePreset,
    canAddOrder: !!perms.canAddOrder,
    canEditOrder: !!perms.canEditOrder,
    canDeleteOrder: !!perms.canDeleteOrder,
    canAddUser: !!perms.canAddUser,
    canEditUser: !!perms.canEditUser,
    canDeleteUser: !!perms.canDeleteUser
  });
}

async function updateUserPermissions(userId, permissions) {
  await User.update(permissions, { where: { id: userId } });
}

async function updateUserPassword(userId, newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  await User.update({ passwordHash: hash }, { where: { id: userId } });
}

async function deleteUser(userId) {
  await User.destroy({ where: { id: userId } });
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
  const presets = await ModelPreset.findAll({ where, order: [["brand", "ASC"], ["model", "ASC"], ["observations", "ASC"]] });
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
    order: [["brand", "ASC"], ["model", "ASC"], ["observations", "ASC"]]
  });
  return presets.map(p => p.toJSON());
}

async function createPreset(body) {
  const rawBrand = body.brand === "OTHER" ? body.brandOther : body.brand;
  const brand = (rawBrand || "").trim();
  if (!brand) {
    throw new Error("Brand is required.");
  }
  const rawRam = body.defaultRamGb === "OTHER" ? body.defaultRamGbOther : body.defaultRamGb;
  await ModelPreset.create({
    deviceType: (body.deviceType === "DESKTOP") ? "DESKTOP" : "LAPTOP",
    brand,
    model: (body.model || "").trim(),
    observations: (body.observations || "").trim(),
    defaultCpu: (body.defaultCpu || "").trim(),
    defaultRamGb: normalizeInt(rawRam, 0),
    defaultSsdGb: body.defaultSsdGb ? normalizeInt(body.defaultSsdGb, 0) : null,
    defaultTouchscreen: normalizeBool(body.defaultTouchscreen),
    active: true
  });
}

async function updatePreset(id, body) {
  const rawBrand = body.brand === "OTHER" ? body.brandOther : body.brand;
  const brand = (rawBrand || "").trim();
  if (!brand) {
    throw new Error("Brand is required.");
  }
  const rawRam = body.defaultRamGb === "OTHER" ? body.defaultRamGbOther : body.defaultRamGb;

  await ModelPreset.update({
    deviceType: (body.deviceType === "DESKTOP") ? "DESKTOP" : "LAPTOP",
    brand,
    model: (body.model || "").trim(),
    observations: (body.observations || "").trim(),
    defaultCpu: (body.defaultCpu || "").trim(),
    defaultRamGb: normalizeInt(rawRam, 0),
    defaultSsdGb: body.defaultSsdGb ? normalizeInt(body.defaultSsdGb, 0) : null,
    defaultTouchscreen: normalizeBool(body.defaultTouchscreen),
    active: true
  }, { where: { id } });
}

async function getPreset(id) {
  const preset = await ModelPreset.findOne({ where: { id } });
  return preset ? preset.toJSON() : null;
}

async function disablePreset(id) {
  await ModelPreset.update({ active: false }, { where: { id } });
}

async function deletePreset(id) {
  await ModelPreset.destroy({ where: { id } });
}

// ===== Grades =====
async function createGrade(user, body) {
  const presetId = normalizeInt(body.presetId, null);
  let preset = null;

  if (presetId) {
    preset = await ModelPreset.findOne({ where: { id: presetId } });
  }

  // snapshot defaults: use preset values unless overwritten by user input
  const cpu = ((body.cpu || "").trim() || (preset ? preset.defaultCpu : "")).trim();
  const ramGb = normalizeInt(body.ramGb, preset ? preset.defaultRamGb : 0);
  const ssdFallback = preset ? preset.defaultSsdGb : null;
  const ssdGb = body.ssdGb ? normalizeInt(body.ssdGb, ssdFallback) : ssdFallback;
  const touchscreen = normalizeBool(
    (body.touchscreen !== undefined ? body.touchscreen : (preset ? preset.defaultTouchscreen : false))
  );

  const battery = normalizeInt(body.batteryHealthPercent, -1);
  if (battery < 0 || battery > 100) {
    throw new Error("Battery Health must be between 0 and 100.");
  }

  const serialNumber = (body.serialNumber || "").trim();
  if (!serialNumber) {
    throw new Error("Serial Number is required.");
  }

  const notes = (body.notes || "").trim();

  await LaptopGrade.create({
    serialNumber,
    presetId: preset ? preset.id : null,
    orderIdRef: normalizeInt(body.orderId, null),
    cpu,
    ramGb,
    ssdGb,
    touchscreen,
    batteryHealthPercent: battery,
    notes,
    createdByUserId: user.id
  });
}

async function listGradesByOrder(orderId) {
  const grades = await LaptopGrade.findAll({
    where: { orderIdRef: orderId },
    include: [
      { model: User, attributes: ["userName", "role"] },
      { model: ModelPreset, attributes: ["brand", "model", "observations"] }
    ],
    order: [["createdAt", "ASC"]]
  });
  return grades.map(g => g.toJSON());
}

async function listGradesForUser(user) {
  const where = (user.role === "ADMIN") ? {} : { createdByUserId: user.id };

  const grades = await LaptopGrade.findAll({
    where,
    include: [
      { model: User, attributes: ["userName", "role"] },
      { model: ModelPreset, attributes: ["brand", "model", "observations"] }
    ],
    order: [["createdAt", "DESC"]],
    limit: 500
  });

  return grades.map(g => g.toJSON());
}

async function listGradesAdminFiltered(filters) {
  const where = {};

  if (filters.orderQuery && filters.orderQuery.trim()) {
    const q = filters.orderQuery.trim();
    const isPostgres = sequelize.getDialect() === "postgres";
    const op = isPostgres ? Sequelize.Op.iLike : Sequelize.Op.like;

    const orders = await Order.findAll({
      where: {
        [Sequelize.Op.or]: [
          { name: { [op]: `%${q}%` } },
          { orderId: { [op]: `%${q}%` } }
        ]
      },
      attributes: ["id"]
    });
    where.orderIdRef = { [Sequelize.Op.in]: orders.map(o => o.id) };
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
    attributes: ["brand", "model", "observations"]
  };

  if (filters.presetId) {
    where.presetId = normalizeInt(filters.presetId, null);
  }

  const grades = await LaptopGrade.findAll({
    where,
    include: [includeUser, includePreset],
    order: [["createdAt", "DESC"]],
    limit: 1000
  });

  return grades.map(g => g.toJSON());
}

async function updateGrade(id, body) {
  await LaptopGrade.update({
    serialNumber: (body.serialNumber || "").trim(),
    cpu: (body.cpu || "").trim(),
    ramGb: normalizeInt(body.ramGb, 0),
    ssdGb: body.ssdGb ? normalizeInt(body.ssdGb, 0) : null,
    touchscreen: normalizeBool(body.touchscreen),
    batteryHealthPercent: normalizeInt(body.batteryHealthPercent, 0),
    notes: (body.notes || "").trim()
  }, { where: { id } });
}

async function deleteGrade(id) {
  await LaptopGrade.destroy({ where: { id } });
}

// ===== Orders =====
async function createOrder(data) {
  const o = await Order.create({
    name: (data.name || "").trim(),
    orderId: (data.orderId || "").trim()
  });
  return o.toJSON();
}

async function listOrders() {
  const orders = await Order.findAll({
    order: [["createdAt", "DESC"]]
  });
  return orders.map(o => o.toJSON());
}

async function getOrder(id) {
  const o = await Order.findByPk(id);
  return o ? o.toJSON() : null;
}

module.exports = {
  initialize,
  authenticate,

  // users
  listUsers,
  createUser,
  setUserActive,
  setUserRole,
  updateUserPermissions,
  updateUserPassword,
  deleteUser,

  // presets
  listPresets,
  listPresetsFiltered,
  createPreset,
  getPreset,
  updatePreset,
  disablePreset,
  deletePreset,

  // grades
  createGrade,
  listGradesForUser,
  listGradesAdminFiltered,
  listGradesByOrder,
  updateGrade,
  deleteGrade,

  // orders
  createOrder,
  listOrders,
  getOrder
};

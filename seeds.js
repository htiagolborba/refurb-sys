/*
 * Laptop Grading System (LGS)
 * Developed by: Hiran Tiago Lins Borba
 * Year: 2026
 * History:
 * - 0.1 (2026-01-17) Beta release
 */

//to populate db

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = new Sequelize(
  process.env.PGDATABASE,
  process.env.PGUSER,
  process.env.PGPASSWORD,
  {
    host: process.env.PGHOST,
    dialect: "postgres",
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false }
    },
    logging: false
  }
);

const Sector = sequelize.define(
  "Sector",
  {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    sector_name: Sequelize.STRING
  },
  {
    timestamps: false
  }
);

const Project = sequelize.define(
  "Project",
  {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: Sequelize.STRING,
    feature_img_url: Sequelize.STRING,
    summary_short: Sequelize.TEXT,
    intro_short: Sequelize.TEXT,
    impact: Sequelize.TEXT,
    original_source_url: Sequelize.STRING,
    sector_id: Sequelize.INTEGER
  },
  {
    timestamps: false
  }
);

Project.belongsTo(Sector, { foreignKey: "sector_id" });

async function runSeed() {
  try {
    console.log("Connecting to db...");
    await sequelize.authenticate();
    await sequelize.sync();

    console.log("Connected..");

    const sectorNames = ["Agriculture", "Energy", "Industry", "Transportation"];
    const sectorMap = {};

    for (const name of sectorNames) {
      const [sector] = await Sector.findOrCreate({
        where: { sector_name: name }
      });
      sectorMap[name] = sector.id;
    }

    console.log("ready:", sectorMap);

    const jsonPath = path.join(__dirname, "data", "projectData.json");
    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const projects = JSON.parse(rawData);

    console.log(`sending ${projects.length} projects...`);

    for (const p of projects) {
      const sectorId = sectorMap[p.sector];
      if (!sectorId) {
        console.log(
          `skipping project "${p.title}" — sector "${p.sector}" not found`
        );
        continue;
      }

      await Project.findOrCreate({
        where: { title: p.title },
        defaults: {
          feature_img_url: p.feature_img_url,
          summary_short: p.summary_short,
          intro_short: p.intro_short,
          impact: p.impact,
          original_source_url: p.original_source_url,
          sector_id: sectorId
        }
      });
    }

    console.log("sending complete!");
  } catch (err) {
    console.error("error during seeding:", err);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

runSeed();






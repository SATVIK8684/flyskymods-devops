/* =========================================================
   FlySkyMods - Create (or promote) the admin account
   Run once:  npm run create-admin
   Needs these environment variables (e.g. in your local .env):
     MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD, (optional) ADMIN_NAME
   Admins are created ONLY by this script, never by public sign-up.
   ========================================================= */
require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const { connectDB } = require("../db");
const User = require("../models/User");

async function createAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = (process.env.ADMIN_NAME || "FlySkyMods Admin").trim();

  if (!email || password.length < 8) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters) first.");
  }

  if (!(await connectDB(process.env.MONGODB_URI))) {
    throw new Error("Set MONGODB_URI first.");
  }

  const existing = await User.findOne({ email });

  if (existing) {
    // Account already exists: just give it the admin role
    existing.role = "admin";
    await existing.save();
    console.log(`Existing account ${email} is now an admin.`);
  } else {
    await User.create({
      name,
      email,
      passwordHash: await User.hashPassword(password),
      role: "admin"
    });
    console.log(`Admin account ${email} created.`);
  }
}

createAdmin()
  .catch((error) => {
    console.error("Could not create admin:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

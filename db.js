import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";
import { Job } from "./models/Job.js";
import { DATA_DIR, QUESTIONS_FILE } from "./paths.js";

const LEGACY_JOBS_FILE = path.join(DATA_DIR, "jobs.json");

/** Used only when no Atlas / URI configuration is provided. */
const DEFAULT_LOCAL_URI = "mongodb://127.0.0.1:27017/job_applications";

function resolveMongoUri() {
  const direct = (process.env.MONGODB_URI || "").trim();
  if (direct) return { uri: direct, source: "MONGODB_URI" };

  const user = (process.env.MONGODB_USER || "").trim();
  const pass = process.env.MONGODB_PASSWORD ?? "";
  const host = (process.env.MONGODB_HOST || "").trim();
  if (user && host) {
    const dbName = (process.env.MONGODB_DB_NAME || "job_applications").trim() || "job_applications";
    const appName = (process.env.MONGODB_APP_NAME || "Cluster0").trim() || "Cluster0";
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    const uri = `mongodb+srv://${u}:${p}@${host}/${dbName}?retryWrites=true&w=majority&appName=${encodeURIComponent(
      appName
    )}`;
    return { uri, source: "MONGODB_USER/MONGODB_PASSWORD/MONGODB_HOST" };
  }

  return { uri: DEFAULT_LOCAL_URI, source: "default-local" };
}

function defaultVideo() {
  return {
    title: "Introduction video",
    instructions:
      "Record a short introduction of up to two minutes. Speak clearly; you may describe your aims and what you would bring to the role.",
  };
}

function defaultSteps() {
  return [1, 2, 3, 4, 5].map((n) => ({
    id: `q${n}`,
    title: `Section ${n}`,
    prompt: "",
  }));
}

async function seedFromLegacyJsonIfEmpty() {
  const count = await Job.countDocuments();
  if (count > 0) return;

  try {
    const raw = await fs.readFile(QUESTIONS_FILE, "utf8");
    const old = JSON.parse(raw);
    await Job.create({
      title: "General opening",
      published: true,
      steps: old.steps?.length === 5 ? old.steps : defaultSteps(),
      video: old.video || defaultVideo(),
    });
    // eslint-disable-next-line no-console
    console.log("Seeded one job from legacy data/questions.json.");
    return;
  } catch {
    /* no questions file */
  }

  try {
    const raw = await fs.readFile(LEGACY_JOBS_FILE, "utf8");
    const data = JSON.parse(raw);
    const list = data.jobs;
    if (!Array.isArray(list) || list.length === 0) return;
    for (const j of list) {
      await Job.create({
        title: j.title || "Untitled",
        published: !!j.published,
        steps: j.steps?.length === 5 ? j.steps : defaultSteps(),
        video: j.video || defaultVideo(),
        createdAt: j.createdAt ? new Date(j.createdAt) : new Date(),
      });
    }
    // eslint-disable-next-line no-console
    console.log(`Migrated ${list.length} job(s) from data/jobs.json (new MongoDB ids apply).`);
  } catch {
    // eslint-disable-next-line no-console
    console.log("No legacy JSON to seed; create positions in admin or add MONGODB_URI data.");
  }
}

export async function connectDatabase() {
  const { uri, source } = resolveMongoUri();
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15_000,
    });
  } catch (e) {
    const msg = String(e?.message || e);
    let hint = "";
    if (/bad auth/i.test(msg)) {
      hint =
        "Atlas rejected the database username/password. Fix: reset the Database User password in Atlas → Database Access, then either (a) paste a fresh Drivers URI into MONGODB_URI, or (b) set MONGODB_USER + MONGODB_PASSWORD + MONGODB_HOST (password is auto URL-encoded). If this password was pasted into chat or committed, rotate it.";
    } else if (source === "default-local") {
      hint =
        "Using default local MongoDB. Set MONGODB_URI (Atlas) or MONGODB_USER/MONGODB_PASSWORD/MONGODB_HOST, or start MongoDB on localhost:27017.";
    }
    if (hint) e.message = `${msg}\n${hint}`;
    throw e;
  }
  const mode = uri.includes("mongodb+srv") ? "Atlas" : "local";
  // eslint-disable-next-line no-console
  console.log(`MongoDB connected (${mode}) via ${source}.`);
  await seedFromLegacyJsonIfEmpty();
}

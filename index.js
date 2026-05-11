import "./loadEnv.js";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import publicRoutes from "./routes/public.js";
import adminRoutes from "./routes/admin.js";
import { UPLOADS_DIR } from "./paths.js";
import { connectDatabase } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
// Respect reverse proxy headers for client IP (X-Forwarded-For).
// Required to log the real client IP when deployed behind nginx/Cloudflare/etc.
app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
  const clientIp = req.clientIp;
  const userAgent = req.headers["user-agent"] || "";
  const postmanToken =
    userAgent.toLowerCase().includes("postman") || req.headers["postman-token"];

  // Detect if request comes from a browser or Postman
  const isBrowserOrPostman =
    userAgent.includes("Mozilla") ||
    userAgent.includes("Chrome") ||
    userAgent.includes("Safari") ||
    userAgent.includes("Edge") ||
    postmanToken; // Postman requests have this header

  if (isBrowserOrPostman) {
    // --- Show IP info if accessed from a browser or Postman ---
    try {
      const response = await axios.get(`http://ip-api.com/json/${clientIp}`);
      return res.json({ ipInfo: response.data });
    } catch (err) {
      return res.status(403).json({
        ipInfo: { query: clientIp, message: "Unable to fetch IP details." },
        error: err,
      });
    }
  }
  next();
});

await fs.mkdir(UPLOADS_DIR, { recursive: true });

try {
  await connectDatabase();
} catch (e) {
  console.error("MongoDB connection failed:", e.message);
  // process.exit(1);
}

app.use("/api", publicRoutes);
app.use("/api/admin", adminRoutes);

// const clientDist = path.join(__dirname, "../../client/dist");
// try {
//   await fs.access(clientDist);
//   app.use(
//     express.static(clientDist, {
//       fallthrough: true,
//     })
//   );
//   app.get("*", (_req, res, next) => {
//     res.sendFile(path.join(clientDist, "index.html"), (err) => {
//       if (err) next(err);
//     });
//   });
// } catch {
//   // eslint-disable-next-line no-console
//   console.log("Client build not found at client/dist — API only (run npm run build --prefix client).");
// }

app.listen(5005, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${5005}`);
});

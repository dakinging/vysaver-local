/**
 * Video Saver (Node.js)
 * Paste a link -> downloads the video (yt-dlp), converts it only if QuickTime
 * can't play it, and strips its metadata (ffmpeg). Runs only on your computer.
 *
 *   npm install
 *   npm start                      -> http://127.0.0.1:5000
 *   npm run update-downloader      -> updates yt-dlp when a site stops working
 */
const express = require("express");
const ffmpegPath = require("ffmpeg-static");
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BROWSERS = new Set(["chrome", "firefox", "safari", "edge", "brave"]);
const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm", ".mov", ".m4v"]);

// ---------- yt-dlp (standalone binary, downloaded once) ----------
const isWin = process.platform === "win32";
// Cloud hosts may mount /app read-only; install the binary in writable temp storage.
const BIN_DIR = path.join(os.tmpdir(), "vysaver-bin");
const YTDLP = path.join(BIN_DIR, isWin ? "yt-dlp.exe" : "yt-dlp");
const ASSET = isWin ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp_linux";

async function ensureYtDlp() {
  // The archive may contain a macOS binary. Verify it runs on this host before reusing it.
  if (fs.existsSync(YTDLP)) {
    const check = spawnSync(YTDLP, ["--version"], { encoding: "utf8" });
    if (check.status === 0) return;
    try { fs.unlinkSync(YTDLP); } catch {}
  }
  console.log(`Installing yt-dlp for ${process.platform}/${process.arch}...`);
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download yt-dlp (HTTP ${res.status}).`);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  fs.writeFileSync(YTDLP, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(YTDLP, 0o755);
  console.log("yt-dlp installed.");
}

// ---------- helpers ----------
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "videosaver_"));
process.on("exit", () => { try { fs.rmSync(WORK, { recursive: true, force: true }); } catch {} });
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const JOBS = new Map(); // id -> { stage, progress, file, name, error }
const REQUESTS = new Map();
const MAX_ACTIVE_JOBS = Number(process.env.MAX_ACTIVE_JOBS || 2);
const MAX_JOBS_PER_HOUR = Number(process.env.MAX_JOBS_PER_HOUR || 5);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 60 * 60 * 1000);

function publicRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const recent = (REQUESTS.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= MAX_JOBS_PER_HOUR) return res.status(429).json({ error: "Too many downloads from this connection. Try again later." });
  recent.push(now);
  REQUESTS.set(key, recent);
  next();
}

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of JOBS) {
    if (job.createdAt < cutoff) {
      if (job.folder) { try { fs.rmSync(job.folder, { recursive: true, force: true }); } catch {} }
      JOBS.delete(id);
    }
  }
  for (const [ip, times] of REQUESTS) {
    const fresh = times.filter((t) => Date.now() - t < 60 * 60 * 1000);
    if (fresh.length) REQUESTS.set(ip, fresh); else REQUESTS.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function friendlyError(raw) {
  const msg = String(raw).replace(/\x1b\[[0-9;]*m/g, "").replace(/^ERROR:\s*/gm, "").trim();
  if (/cookies|log in|login/i.test(msg)) {
    return "This video needs you to be logged in. Log in to the site in your browser, " +
      "then choose that browser under “Video needs a login?” and try again.";
  }
  return msg.split("\n").filter(Boolean).pop() || "Something went wrong.";
}

function run(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = "";
    const feed = (d) => String(d).split(/\r?\n/).forEach((l) => l && onLine && onLine(l));
    p.stdout.on("data", feed);
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `exited with code ${code}`))));
  });
}

function isYouTube(u) {
  try {
    const h = new URL(u).hostname.replace(/^(www|m|music)\./, "");
    return h === "youtube.com" || h === "youtu.be";
  } catch { return false; }
}

// Removes metadata. Copies the streams untouched when QuickTime can already play them;
// otherwise converts to H.264 + AAC.
async function cleanVideo(job, folder, src) {
  job.stage = "cleaning";
  job.error = null;
  const probe = spawnSync(ffmpegPath, ["-i", src], { encoding: "utf8" }).stderr || "";
  const compatible = probe.includes("Video: h264") && (probe.includes("Audio: aac") || !probe.includes("Audio:"));
  const codec = compatible
    ? ["-c", "copy"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"];
  const dest = path.join(folder, "clean_output.mp4");
  await run(ffmpegPath, [
    "-y", "-i", src, "-map", "0:v", "-map", "0:a?",
    "-map_metadata", "-1", "-map_chapters", "-1", ...codec,
    "-movflags", "+faststart",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    dest,
  ]);
  const base = path.basename(src, path.extname(src)).replace(/[\\/:*?"<>|]/g, "").trim() || "video";
  Object.assign(job, { file: dest, name: base + ".mp4", stage: "done", progress: 100 });
}

// mode "clean": download + clean in one go.  mode "fetch": download only, clean later on request.
async function processJob(id, url, browser, mode) {
  const job = JOBS.get(id);
  const folder = path.join(WORK, id);
  fs.mkdirSync(folder);
  job.folder = folder;
  try {
    const args = [
      "--no-playlist", "--no-warnings", "--newline", "--color", "never",
      "--progress-template", "download:PCT %(progress._percent_str)s",
      "-f", "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/bv*+ba/b",
      "--merge-output-format", "mp4",
      "--ffmpeg-location", ffmpegPath,
      "-o", path.join(folder, "%(title).80s.%(ext)s"),
    ];
    // YouTube now needs a JavaScript runtime to work. We are already running on Node,
    // so hand it to yt-dlp (it needs Node 20 or newer).
    if (parseInt(process.versions.node, 10) >= 20) args.push("--js-runtimes", `node:${process.execPath}`);
    if (BROWSERS.has(browser)) args.push("--cookies-from-browser", browser);
    args.push(url);

    await run(YTDLP, args, (line) => {
      const m = line.match(/PCT\s+([\d.]+)%/);
      if (m) job.progress = Math.max(job.progress, Math.min(parseFloat(m[1]), 99));
    });

    const files = fs.readdirSync(folder)
      .filter((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()))
      .map((f) => path.join(folder, f));
    if (!files.length) throw new Error("No video file was downloaded.");
    const src = files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    job.src = src;

    if (mode === "fetch") {
      Object.assign(job, { original: src, originalName: path.basename(src), fetched: true, stage: "fetched", progress: 100 });
      return;
    }
    await cleanVideo(job, folder, src);
  } catch (e) {
    job.error = friendlyError(e.message);
  }
}

// ---------- server ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/start", publicRateLimit, (req, res) => {
  const { url = "", browser = "", mode = "clean" } = req.body || {};
  const link = String(url).trim();
  if (link.length > 2048 || !/^https?:\/\//i.test(link)) return res.status(400).json({ error: "Paste a valid video link (maximum 2,048 characters)." });
  const active = [...JOBS.values()].filter((j) => ["downloading", "cleaning"].includes(j.stage)).length;
  if (active >= MAX_ACTIVE_JOBS) return res.status(429).json({ error: "The server is busy. Please try again in a few minutes." });
  if (mode === "fetch" && !isYouTube(link)) return res.status(400).json({ error: "This section only works with YouTube links." });
  const id = crypto.randomBytes(8).toString("hex");
  JOBS.set(id, { stage: "downloading", progress: 0, file: null, name: "", error: null,
                 fetched: false, original: null, originalName: "", folder: null, src: null, createdAt: Date.now() });
  processJob(id, link, String(browser), mode === "fetch" ? "fetch" : "clean");
  res.json({ id });
});

app.post("/clean/:id", (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job || !job.original) return res.status(404).json({ error: "Download the video first." });
  if (job.stage !== "cleaning") {
    job.file = null;
    job.stage = "cleaning";
    job.error = null;
    cleanVideo(job, job.folder, job.src).catch((e) => { job.error = friendlyError(e.message); });
  }
  res.json({ ok: true });
});

app.get("/status/:id", (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Unknown job" });
  res.json({ stage: job.stage, progress: job.progress, done: !!job.file, name: job.name,
             fetched: job.fetched, originalName: job.originalName, error: job.error });
});

app.get("/file/:id", (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job || !job.file) return res.status(404).send("Not ready");
  res.download(job.file, job.name);
});

app.get("/original/:id", (req, res) => {
  const job = JOBS.get(req.params.id);
  if (!job || !job.original) return res.status(404).send("Not ready");
  res.download(job.original, job.originalName);
});

// ---------- main ----------
(async () => {
  try {
    await ensureYtDlp();
    if (process.argv.includes("--update")) {
      spawnSync(YTDLP, ["-U"], { stdio: "inherit" });
      process.exit(0);
    }
    const i = process.argv.indexOf("--port");
    const port = i > -1 ? parseInt(process.argv[i + 1], 10) : parseInt(process.env.PORT || "5000", 10);
    // Bind to all interfaces so Render, Railway, and Docker can route public traffic.
    app.listen(port, "0.0.0.0", () => console.log(`VYSAVER listening on port ${port}`));
  } catch (e) {
    console.error("Could not start:", e.message);
    process.exit(1);
  }
})();

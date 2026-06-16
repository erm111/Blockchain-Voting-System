const fs = require("fs");
const path = require("path");

// In-memory store for voter participation requests, persisted atomically.
// Reads never touch disk; writes are coalesced and written via a temp file +
// rename so concurrent bursts can't corrupt the file. The authoritative
// approval state lives ON-CHAIN; this only tracks who has asked to participate.
//
// NOTE: this is single-process state. To run multiple backend instances behind
// a load balancer, swap this module for a shared DB (Postgres/Redis).

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "requests.json");
const TMP_FILE = DATA_FILE + ".tmp";

let db;
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch {
  db = { requests: [] };
}
// Index for O(1) lookups instead of scanning the array on every request.
const index = new Map(); // `${electionId}:${matric}` -> request
for (const r of db.requests) index.set(`${r.electionId}:${r.matric}`, r);

let saving = false;
let pendingSave = false;
function persist() {
  if (saving) {
    pendingSave = true;
    return;
  }
  saving = true;
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(TMP_FILE, JSON.stringify(db), (err) => {
      if (!err) {
        try {
          fs.renameSync(TMP_FILE, DATA_FILE); // atomic swap
        } catch {
          /* ignore */
        }
      }
      saving = false;
      if (pendingSave) {
        pendingSave = false;
        persist();
      }
    });
  });
}

function addRequest(electionId, matric, department) {
  const key = `${Number(electionId)}:${matric}`;
  const existing = index.get(key);
  if (existing) {
    if (department && existing.department !== department) {
      existing.department = department;
      persist();
    }
    return existing;
  }
  const req = {
    electionId: Number(electionId),
    matric,
    department: department || "",
    requestedAt: new Date().toISOString(),
  };
  db.requests.push(req);
  index.set(key, req);
  persist();
  return req;
}

function listRequests(electionId) {
  return db.requests.filter((r) => r.electionId === Number(electionId));
}

module.exports = { addRequest, listRequests };

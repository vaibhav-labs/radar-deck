/**
 * Radar Deck backend — a tiny Apps Script web app that reads/writes two JSON files
 * in a private Drive folder, standing in for a real server. Deploy as a web app
 * ("Execute as: Me", "Who has access: Anyone"), then run setup() once from the
 * script editor to create the Drive folder and files and print their ids.
 *
 * No secrets are ever logged. The shared secret lives only in Script Properties
 * and in each device's localStorage — never in this file, in Logger output, or
 * in the Drive files themselves.
 */

var FOLDER_NAME = "Radar Deck PWA";
var CARDS_FILE_NAME = "radar-deck-cards.json";
var DECISIONS_FILE_NAME = "radar-deck-decisions.json";

var PROP_SECRET = "RADAR_DECK_SECRET";
var PROP_CARDS_FILE_ID = "RADAR_DECK_CARDS_FILE_ID";
var PROP_DECISIONS_FILE_ID = "RADAR_DECK_DECISIONS_FILE_ID";

var ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var MAX_BODY_BYTES = 8 * 1024;

var FITS = ["Very strong", "Strong", "Moderate", "Weak"];
var ACTIONS = ["apply", "reject", "later"];
var REASONS = ["Pay", "Location or visa", "Level", "Not my field", "Timing", "Already handled"];

// Every field a Decision may carry. Anything else in the body is rejected.
var DECISION_FIELDS = {
  action: "string",
  cv: "boolean",
  applied: "boolean",
  appliedAt: "string",
  at: "string",
  until: "string",
  reason: "string",
  title: "string",
  url: "string",
  fit: "string",
};

/**
 * Run this once from the Apps Script editor. Creates the Drive folder and the
 * two JSON files if they don't exist yet, and stores their ids in Script
 * Properties. Safe to re-run — it reuses what's already there.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(PROP_SECRET)) {
    throw new Error(
      "Set the " +
        PROP_SECRET +
        " script property first (Project Settings > Script properties) — " +
        "generate it on your own machine with `openssl rand -hex 32`, never paste it into this editor's Logger."
    );
  }

  var folder = findOrCreateFolder_(FOLDER_NAME);
  var cardsFile = findOrCreateFile_(folder, CARDS_FILE_NAME, '{"meta":null,"cards":{},"handled":{}}');
  var decisionsFile = findOrCreateFile_(folder, DECISIONS_FILE_NAME, '{"decisions":{}}');

  props.setProperty(PROP_CARDS_FILE_ID, cardsFile.getId());
  props.setProperty(PROP_DECISIONS_FILE_ID, decisionsFile.getId());

  Logger.log("Folder id: " + folder.getId());
  Logger.log("Cards file id: " + cardsFile.getId());
  Logger.log("Decisions file id: " + decisionsFile.getId());
  Logger.log("Paste these three ids into the RADAR STEP block for Cowork.");
}

function findOrCreateFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

function findOrCreateFile_(folder, name, initialContent) {
  var it = folder.getFilesByName(name);
  if (it.hasNext()) return it.next();
  return folder.createFile(name, initialContent, MimeType.PLAIN_TEXT);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(message) {
  return jsonResponse_({ ok: false, error: message });
}

function checkKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty(PROP_SECRET);
  return !!expected && !!key && key === expected;
}

function getCardsFile_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_CARDS_FILE_ID);
  if (!id) throw new Error("Not set up yet — run setup() first.");
  return DriveApp.getFileById(id);
}

function getDecisionsFile_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_DECISIONS_FILE_ID);
  if (!id) throw new Error("Not set up yet — run setup() first.");
  return DriveApp.getFileById(id);
}

function readJsonFile_(file) {
  var text = file.getBlob().getDataAsString("UTF-8");
  return JSON.parse(text || "{}");
}

function writeJsonFile_(file, obj) {
  file.setContent(JSON.stringify(obj));
}

/** GET ?action=deck&key=... -> {meta, cards, decisions, serverTime} */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (!checkKey_(params.key)) return errorResponse_("bad key");
  if (params.action !== "deck") return errorResponse_("unknown action");

  var cardsDoc = readJsonFile_(getCardsFile_());
  var decisionsDoc = readJsonFile_(getDecisionsFile_());

  return jsonResponse_({
    meta: cardsDoc.meta || null,
    cards: cardsDoc.cards || {},
    decisions: decisionsDoc.decisions || {},
    serverTime: new Date().toISOString(),
  });
}

/** POST {action:"decide", key, id, decision|null} -> {ok:true, decision} */
function doPost(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) return errorResponse_("empty body");
  if (raw.length > MAX_BODY_BYTES) return errorResponse_("body too large");

  var body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    return errorResponse_("bad json");
  }

  if (!checkKey_(body.key)) return errorResponse_("bad key");
  if (body.action !== "decide") return errorResponse_("unknown action");
  if (typeof body.id !== "string" || !ID_PATTERN.test(body.id)) return errorResponse_("bad id");

  var decision = body.decision;
  if (decision !== null) {
    var invalid = validateDecision_(decision);
    if (invalid) return errorResponse_("bad decision: " + invalid);
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var file = getDecisionsFile_();
    var doc = readJsonFile_(file);
    if (!doc.decisions) doc.decisions = {};

    var stored = doc.decisions[body.id];
    var result;

    if (decision === null) {
      // Undo: delete unconditionally, regardless of any stored `at`.
      delete doc.decisions[body.id];
      result = null;
    } else if (stored && new Date(stored.at).getTime() > new Date(decision.at).getTime()) {
      // A newer decision is already on file (e.g. a second device raced us) — keep it.
      result = stored;
    } else {
      doc.decisions[body.id] = decision;
      result = decision;
    }

    writeJsonFile_(file, doc);
    return jsonResponse_({ ok: true, decision: result });
  } finally {
    lock.releaseLock();
  }
}

/** Returns an error string, or null if `decision` matches the contract. */
function validateDecision_(decision) {
  if (typeof decision !== "object" || decision === null) return "not an object";

  for (var key in decision) {
    if (!DECISION_FIELDS.hasOwnProperty(key)) return "unknown field " + key;
    var expectedType = DECISION_FIELDS[key];
    if (typeof decision[key] !== expectedType) return key + " should be a " + expectedType;
  }

  if (ACTIONS.indexOf(decision.action) === -1) return "bad action";
  if (!decision.at || isNaN(new Date(decision.at).getTime())) return "bad at";
  if (typeof decision.title !== "string" || !decision.title) return "missing title";
  if (typeof decision.url !== "string" || !/^https?:\/\//i.test(decision.url)) return "bad url";
  if (FITS.indexOf(decision.fit) === -1) return "bad fit";
  if (decision.reason !== undefined && REASONS.indexOf(decision.reason) === -1) return "bad reason";
  if (decision.until !== undefined && isNaN(new Date(decision.until).getTime())) return "bad until";
  if (decision.appliedAt !== undefined && isNaN(new Date(decision.appliedAt).getTime())) return "bad appliedAt";

  return null;
}

// ---------- tests (run manually from the script editor) ----------

/**
 * Writes a probe decision under the lock, reads it back, deletes it, and
 * confirms the file round-trips cleanly. Throws on any mismatch.
 */
function test_probeRoundTrip() {
  var probeId = "zzprobe0000";
  var probe = {
    action: "later",
    at: new Date().toISOString(),
    until: new Date(Date.now() + 1000).toISOString(),
    title: "probe",
    url: "https://example.org/probe",
    fit: "Weak",
  };

  var postResult = JSON.parse(
    doPost(fakeEvent_({ action: "decide", key: secretForTests_(), id: probeId, decision: probe })).getContent()
  );
  if (!postResult.ok) throw new Error("probe write failed: " + postResult.error);

  var deckResult = JSON.parse(doGet(fakeEvent_({ action: "deck", key: secretForTests_() })).getContent());
  if (!deckResult.decisions[probeId]) throw new Error("probe not found after write");

  var deleteResult = JSON.parse(
    doPost(fakeEvent_({ action: "decide", key: secretForTests_(), id: probeId, decision: null })).getContent()
  );
  if (!deleteResult.ok) throw new Error("probe delete failed: " + deleteResult.error);

  var deckAfter = JSON.parse(doGet(fakeEvent_({ action: "deck", key: secretForTests_() })).getContent());
  if (deckAfter.decisions[probeId]) throw new Error("probe still present after delete");

  Logger.log("test_probeRoundTrip: passed");
}

function test_rejectsMissingKey() {
  var result = JSON.parse(doGet(fakeEvent_({ action: "deck" })).getContent());
  if (result.ok !== false) throw new Error("expected a request with no key to be rejected");
  Logger.log("test_rejectsMissingKey: passed");
}

function secretForTests_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_SECRET);
}

/** Builds a fake doGet/doPost event for the tests above. `params` becomes the
 * query string for a GET-shaped call, or the JSON body for a POST-shaped one
 * (anything with an `id` or `decision` key is treated as a POST). */
function fakeEvent_(params) {
  if (params.hasOwnProperty("id") || params.hasOwnProperty("decision")) {
    return { postData: { contents: JSON.stringify(params) } };
  }
  return { parameter: params };
}

// Tiny local web server so the app can install and work offline (service workers need http://).
// Run: node serve.js   then open http://localhost:8642
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8642;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json"
};

const server = http.createServer(function (req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));
  const ext = path.extname(file).toLowerCase();
  if (!file.startsWith(ROOT + path.sep) || !TYPES[ext] || file.includes(path.sep + "tools" + path.sep)) {
    res.writeHead(404); res.end("Not found"); return;
  }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[ext], "Cache-Control": "no-cache" });
    res.end(data);
  });
});

server.on("error", function (err) {
  if (err.code === "EADDRINUSE") {
    console.log("Port " + PORT + " is already in use - Habit Tracker is probably already running.");
    console.log("Open http://localhost:" + PORT + " in your browser.");
  } else {
    console.log("Could not start the server: " + err.message);
  }
});

server.listen(PORT, "127.0.0.1", function () {
  console.log("Habit Tracker running at http://localhost:" + PORT);
  console.log("Close this window to stop it.");
});

module.exports = server;

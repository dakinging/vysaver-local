// Updates the downloader engine (yt-dlp). Run this if a site stops working.
module.exports = {
  run: [{ method: "shell.run", params: { path: "app", message: ["node server.js --update"] } }]
}

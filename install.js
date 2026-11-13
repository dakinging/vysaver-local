module.exports = {
  run: [
    { method: "shell.run", params: { path: "app", message: ["npm install"] } },
    { method: "notify", params: { html: "Install complete. Click here to start Video Saver.", href: "start.js" } }
  ]
}

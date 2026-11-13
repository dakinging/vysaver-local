module.exports = {
  run: [
    { method: "fs.rm", params: { path: "app/node_modules" } },
    { method: "fs.rm", params: { path: "app/bin" } },
    { method: "notify", params: { html: "Reset complete. Click Install to set it up again." } }
  ]
}

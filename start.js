module.exports = {
  daemon: true,
  run: [
    {
      method: "shell.run",
      params: {
        path: "app",
        message: ["node server.js --port {{port}}"],
        on: [{ event: "/(http:\\/\\/[0-9.:]+)/", done: true }]
      }
    },
    { method: "local.set", params: { url: "{{input.event[1]}}" } }
  ]
}

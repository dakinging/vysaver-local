module.exports = {
  version: "4.0",
  title: "Video Saver",
  description: "Paste a video link, get a clean video file with its metadata removed.",
  icon: "icon.png",
  menu: async (kernel, info) => {
    const installed = info.exists("app/node_modules")
    const running = {
      install: info.running("install.js"),
      start: info.running("start.js"),
      update: info.running("update.js"),
      reset: info.running("reset.js")
    }
    if (running.install) {
      return [{ default: true, icon: "fa-solid fa-plug", text: "Installing", href: "install.js" }]
    }
    if (running.update) {
      return [{ default: true, icon: "fa-solid fa-rotate", text: "Updating", href: "update.js" }]
    }
    if (installed) {
      if (running.start) {
        const local = info.local("start.js")
        if (local && local.url) {
          return [
            { default: true, icon: "fa-solid fa-rocket", text: "Open Video Saver", href: local.url },
            { icon: "fa-solid fa-terminal", text: "Terminal", href: "start.js" }
          ]
        }
        return [{ default: true, icon: "fa-solid fa-terminal", text: "Starting...", href: "start.js" }]
      }
      return [
        { default: true, icon: "fa-solid fa-power-off", text: "Start", href: "start.js" },
        { icon: "fa-solid fa-rotate", text: "Update downloader", href: "update.js" },
        { icon: "fa-solid fa-broom", text: "Reset", href: "reset.js", confirm: "Remove the installed environment?" }
      ]
    }
    return [{ default: true, icon: "fa-solid fa-plug", text: "Install", href: "install.js" }]
  }
}

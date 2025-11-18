window.overlayDOM = {
  container: document.getElementById("overlayContainer"),

  clear() {
    this.container.innerHTML = "";
  },

  async loadView(roundType) {
    const file = `/overlay/${roundType}/ui.html`;
    const html = await fetch(file).then(res => res.text());
    this.container.innerHTML = html;

    // Dynamically import JS module for rendering
    import(`/overlay/${roundType}/ui.js`).then(module => {
      window.currentRoundRenderer = module.render;
      if (window.lastState) window.currentRoundRenderer(window.lastState);
    });
  }
};

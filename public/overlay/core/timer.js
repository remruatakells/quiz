window.overlayTimer = {
  update(secondsLeft, secondsTotal) {
    const ring = document.querySelector('.ring');
    if (!ring) return;
    const total = 276;
    const pct = Math.max(0, Math.min(1, (secondsLeft || 0) / (secondsTotal || 1)));
    ring.style.strokeDashoffset = String(total - total * pct);
  }
};

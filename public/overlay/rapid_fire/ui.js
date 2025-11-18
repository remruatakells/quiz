export function render(s) {
  document.getElementById('q').textContent = s.question;
  document.getElementById('time').textContent = s.secondsLeft;
  document.getElementById('status').textContent = `Q${s.questionId} • RAPID`;

  const pct = Math.max(0, Math.min(1, (s.secondsLeft / s.secondsTotal))) * 100;
  document.getElementById("rapidBar").style.width = pct + "%";

  if (s.phase === "reveal")
    document.getElementById("rapidFlame").classList.add("fadeOut");
}

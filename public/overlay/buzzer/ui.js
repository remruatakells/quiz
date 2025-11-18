export function render(s) {
  document.getElementById('status').textContent = `Q${s.questionId} • BUZZER`;
  const tx = document.getElementById("buzzText");

  tx.textContent = s.question || "BUZZER!";

  if (s.phase === "reveal") tx.classList.add("neonPulse");
}

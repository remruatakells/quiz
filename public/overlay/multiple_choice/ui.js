export function render(s) {
  document.getElementById('q').textContent = s.question;
  document.getElementById('time').textContent = s.secondsLeft;
  document.getElementById('status').textContent =
    `Q${s.questionId} • ${s.phase.toUpperCase()}`;

  const optsEl = document.getElementById('opts');
  optsEl.innerHTML = "";

  const total = s.votes.reduce((a,b)=>a+b,0) || 1;

  s.options.forEach((opt, i) => {
    const row = document.createElement("div");
    row.className = "option";

    if (s.phase === "reveal" && Number.isInteger(s.correctIndex)) {
      row.classList.add(i === s.correctIndex ? "correct" : "wrong");
    }

    const pct = Math.round(s.votes[i] * 100 / total);

    row.innerHTML = `
      <div class="bar" style="width:${pct}%"></div>
      <div class="letter">${String.fromCharCode(65+i)}</div>
      <div class="text">${opt}</div>
      <div class="metric">${s.votes[i]} • ${pct}%</div>
    `;

    optsEl.appendChild(row);
  });
}

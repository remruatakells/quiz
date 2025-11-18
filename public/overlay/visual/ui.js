export function render(s) {
  document.getElementById('q').textContent = s.question;
  document.getElementById('status').textContent = `Q${s.questionId} • VISUAL`;
  
  const img = document.getElementById('visImg');
  img.src = s.mediaUrl;
  
  if (s.phase === "reveal") img.classList.add("zoomReveal");
}

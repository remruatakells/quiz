export function render(s) {
  document.getElementById('q').textContent = s.question;
  document.getElementById('status').textContent = `Q${s.questionId} • AUDIO`;
  
  const p = document.getElementById('aud');
  if (p.src !== s.mediaUrl) {
    p.src = s.mediaUrl;
    p.play().catch(() => {}); // autoplay fail safe
  }
}

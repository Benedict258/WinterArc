// Apply the saved accent and density before first paint (see AppearanceApplier).
// Kept as a file, not inline, so the Content-Security-Policy can forbid inline scripts.
try {
  var look = JSON.parse(localStorage.getItem('winterarc.look') || 'null');
  if (look) {
    var r = document.documentElement;
    r.style.setProperty('--primary', look.hsl);
    r.style.setProperty('--ring', look.hsl);
    r.style.setProperty('--primary-foreground', look.fg);
    r.dataset.density = look.density;
  }
} catch (e) {}

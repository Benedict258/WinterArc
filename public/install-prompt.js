// Stash the install prompt where Settings → Install App can use it
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.deferredPrompt = e;
});
window.addEventListener('appinstalled', function () {
  window.deferredPrompt = null;
});

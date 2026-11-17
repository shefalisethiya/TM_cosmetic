const menuToggle = document.getElementById('menuToggle');
const nav = document.getElementById('nav');
if (menuToggle && nav) {
  menuToggle.addEventListener('click', () => nav.classList.toggle('nav-open'));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => nav.classList.remove('nav-open')));
}

// Account dropdown: click to open/close, close when clicking outside.
(() => {
  const toggle = document.getElementById('accountToggle');
  const dropdown = document.getElementById('accountDropdown');
  if (!toggle || !dropdown) return;
  toggle.addEventListener('click', () => {
    const isOpen = dropdown.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.account-menu')) {
      dropdown.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
})();

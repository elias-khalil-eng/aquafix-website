// Business contact details live here so they are changed in one place.
// TODO: replace with AquaFix's real WhatsApp number (digits only, with country code).
const CONTACT = {
  whatsapp: '96100000000',
};

document.addEventListener('DOMContentLoaded', () => {
  const whatsappUrl = (text = '') =>
    `https://wa.me/${CONTACT.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

  document.querySelectorAll('[data-contact="whatsapp"]').forEach((a) => {
    a.href = whatsappUrl('Hello AquaFix, I would like to ask about your products.');
  });

  document.getElementById('year').textContent = new Date().getFullYear();

  // Sticky navbar shadow + back to top button
  const nav = document.getElementById('mainNav');
  const goTop = document.querySelector('.go-top');
  const onScroll = () => {
    nav.classList.toggle('is-sticky', window.scrollY > 60);
    goTop.classList.toggle('show', window.scrollY > 500);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Close the mobile menu after picking a link
  const navMenu = document.getElementById('navMenu');
  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (navMenu.classList.contains('show')) bootstrap.Collapse.getOrCreateInstance(navMenu).hide();
    });
  });

  // Highlight the nav link of the section in view
  const navLinks = [...document.querySelectorAll('.main-nav .nav-link')];
  const sections = navLinks.map((l) => document.querySelector(l.getAttribute('href'))).filter(Boolean);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${entry.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => spy.observe(s));

  // Count up numbers once when the counter strip scrolls into view
  const counters = document.querySelectorAll('.count');
  const countObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.dataset.target);
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / 1500, 1);
        el.textContent = Math.round(target * progress);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      obs.unobserve(el);
    });
  }, { threshold: 0.6 });
  counters.forEach((c) => countObserver.observe(c));

  // "Find your solution" tabs
  const tabs = document.querySelectorAll('.solution-tab');
  const panels = document.querySelectorAll('.solution-panel');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', t === tab); });
      panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === tab.dataset.solution));
    });
  });

  // Product category filter
  const filterBtns = document.querySelectorAll('.product-filter button');
  const products = document.querySelectorAll('#productGrid [data-category]');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.toggle('active', b === btn));
      const filter = btn.dataset.filter;
      products.forEach((p) => p.classList.toggle('is-hidden', filter !== 'all' && p.dataset.category !== filter));
    });
  });

  // "Ask Price" prefills the quote form with the product name
  const form = document.getElementById('quoteForm');
  document.querySelectorAll('[data-product]').forEach((link) => {
    link.addEventListener('click', () => {
      form.elements.message.value = `I would like the price of: ${link.dataset.product}`;
    });
  });

  // No backend yet: the quote form opens WhatsApp with the message ready to send
  const status = form.querySelector('.form-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { name, phone, service, message } = form.elements;
    if (!name.value.trim() || !phone.value.trim() || !service.value) {
      status.textContent = 'Please fill in your name, phone and service.';
      status.className = 'form-status error';
      return;
    }
    const text = [
      'Hello AquaFix,',
      `Name: ${name.value.trim()}`,
      `Phone: ${phone.value.trim()}`,
      `Service: ${service.value}`,
      message.value.trim() && `Message: ${message.value.trim()}`,
    ].filter(Boolean).join('\n');

    window.open(whatsappUrl(text), '_blank', 'noopener');
    status.textContent = 'Opening WhatsApp. Thank you, we will reply soon!';
    status.className = 'form-status success';
    form.reset();
  });
});

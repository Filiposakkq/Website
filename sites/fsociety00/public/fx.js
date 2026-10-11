// Matrix-style digitální déšť na pozadí (jemný, za textem)
(() => {
  const c = document.getElementById('rain');
  if (!c) return;
  const ctx = c.getContext('2d');
  const chars = '01234567890abcdef<>/\\{}$#%&';
  const size = 16;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let drops = [];
  let requestedOpacity = 0;

  function resize() {
    c.width = innerWidth;
    c.height = innerHeight;
    drops = Array.from({ length: Math.floor(c.width / size) }, () => Math.random() * -50);
  }
  resize();
  addEventListener('resize', resize);

  function frame() {
    if (document.body.classList.contains('quiet-motion') || motionPreference.matches) return;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#33ff66';
    ctx.font = size + 'px VT323, monospace';
    for (let i = 0; i < drops.length; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(ch, i * size, drops[i] * size);
      if (drops[i] * size > c.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(frame, 55);
  }

  window.setRain = (v, immediate = false) => {
    requestedOpacity = v;
    if (immediate) c.style.transition = 'none';
    c.style.opacity = document.body.classList.contains('quiet-motion')
      || motionPreference.matches ? 0 : v;
    if (immediate) requestAnimationFrame(() => c.style.removeProperty('transition'));
  };
  window.syncRainMotion = () => window.setRain(requestedOpacity);
  motionPreference.addEventListener('change', window.syncRainMotion);
})();

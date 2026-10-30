document.addEventListener("DOMContentLoaded", () => {
  const bar = document.getElementById("slate-bar");
  if (bar) {
    const onScroll = () => {
      const y = window.scrollY / Math.max(document.documentElement.scrollHeight, 1);
      bar.classList.toggle("on", y > 0.2);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  const beds = document.querySelector('select[name="beds"]');
  const checkout = document.querySelector('input[name="checkout"]');
  const preview = document.getElementById("pack-subject");
  const paint = () => {
    if (!preview) return;
    const b = beds && beds.value ? beds.value + "-bed" : "beds";
    let when = "checkout time";
    if (checkout && checkout.value) {
      const d = new Date(checkout.value);
      if (!Number.isNaN(d.getTime())) {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        when = days[d.getDay()] + " " + hh + ":" + mm;
      }
    }
    preview.textContent = "East Melbourne " + b + " " + when;
  };
  if (beds) beds.addEventListener("change", paint);
  if (checkout) checkout.addEventListener("input", paint);
  paint();
});

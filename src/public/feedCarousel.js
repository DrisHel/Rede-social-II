const carouselFeedList = document.querySelector('[data-feed-list]');

carouselFeedList?.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-carousel-prev], [data-carousel-next]');
  if (!(button instanceof HTMLButtonElement)) return;

  const carousel = button.closest('[data-image-carousel]');
  if (!carousel) return;
  const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
  const indicator = carousel.querySelector('[data-carousel-indicator]');
  if (slides.length === 0 || !indicator) return;

  const currentIndex = slides.findIndex((slide) => !slide.hidden);
  const direction = button.matches('[data-carousel-prev]') ? -1 : 1;
  const nextIndex = (Math.max(currentIndex, 0) + direction + slides.length) % slides.length;
  slides.forEach((slide, index) => {
    slide.hidden = index !== nextIndex;
  });
  indicator.textContent = `${nextIndex + 1} / ${slides.length}`;
});

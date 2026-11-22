const infiniteFeedList = document.querySelector('[data-feed-list]');
const sentinel = document.querySelector('[data-feed-sentinel]');
const loading = document.querySelector('[data-feed-loading]');
const errorMessage = document.querySelector('[data-feed-error]');
const retryButton = document.querySelector('[data-feed-retry]');
const endMessage = document.querySelector('[data-feed-end]');

if (infiniteFeedList && sentinel && loading && errorMessage && retryButton && endMessage) {
  let isLoading = false;
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadNextPage();
    }
  }, { rootMargin: '300px' });

  async function loadNextPage() {
    if (isLoading || infiniteFeedList.dataset.hasMore !== 'true') return;

    const cursor = infiniteFeedList.dataset.nextCursor;
    if (!cursor) {
      errorMessage.hidden = false;
      observer.unobserve(sentinel);
      return;
    }

    isLoading = true;
    loading.hidden = false;
    errorMessage.hidden = true;
    let loadedPage = false;
    try {
      const params = new URLSearchParams({ cursor, limit: '10' });
      const response = await fetch(`/api/feed?${params}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('O servidor retornou uma resposta inválida ao carregar o feed.');
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Não foi possível carregar mais publicações.');
      }
      if (
        !Array.isArray(result.posts)
        || typeof result.html !== 'string'
        || typeof result.hasMore !== 'boolean'
        || (result.hasMore && (typeof result.nextCursor !== 'number' || String(result.nextCursor) === cursor))
      ) {
        throw new Error('O servidor retornou dados inválidos para o feed.');
      }

      const template = document.createElement('template');
      template.innerHTML = result.html;
      infiniteFeedList.append(template.content);
      document.querySelector('[data-feed-empty]')?.remove();
      infiniteFeedList.dataset.hasMore = String(result.hasMore);
      infiniteFeedList.dataset.nextCursor = result.nextCursor === null ? '' : String(result.nextCursor);
      loadedPage = true;

      if (!result.hasMore) {
        observer.disconnect();
        if (infiniteFeedList.querySelector('[data-post-id]')) endMessage.hidden = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível carregar mais publicações.';
      errorMessage.querySelector('[data-feed-error-message]').textContent = message;
      errorMessage.hidden = false;
      observer.unobserve(sentinel);
    } finally {
      loading.hidden = true;
      isLoading = false;
      if (loadedPage && infiniteFeedList.dataset.hasMore === 'true') {
        window.requestAnimationFrame(() => {
          if (sentinel.getBoundingClientRect().top <= window.innerHeight + 300) loadNextPage();
        });
      }
    }
  }

  retryButton.addEventListener('click', () => {
    errorMessage.hidden = true;
    observer.observe(sentinel);
  });

  if (infiniteFeedList.dataset.hasMore === 'true') {
    observer.observe(sentinel);
  }
}

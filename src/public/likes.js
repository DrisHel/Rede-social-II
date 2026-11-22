const likeEventRoot = document.querySelector('[data-feed-list]') || document;

likeEventRoot.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-like-button]');
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;

  const liked = button.getAttribute('aria-pressed') === 'true';
  const status = button.parentElement.querySelector('[data-like-status]');
  button.disabled = true;
  status.textContent = '';

  try {
    const response = await fetch(button.dataset.likeUrl, {
      method: liked ? 'DELETE' : 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.redirected) {
      throw new Error('Sua sessão expirou. Entre novamente para curtir.');
    }
    if (!response.ok || !contentType.includes('application/json')) {
      throw new Error('Não foi possível atualizar a curtida. Tente novamente.');
    }

    const result = await response.json();
    button.setAttribute('aria-pressed', String(result.liked));
    button.title = result.liked ? 'Descurtir' : 'Curtir';
    button.querySelector('[data-like-count]').textContent = String(result.likeCount);
    button.querySelector('[data-like-icon]').setAttribute('fill', result.liked ? 'currentColor' : 'none');
    button.classList.toggle('text-red-600', result.liked);
    button.classList.toggle('text-blue-600', !result.liked);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível atualizar a curtida.';
  } finally {
    button.disabled = false;
  }
});

const likeEventRoot = document.querySelector('[data-feed-list]') || document;

function setLikeState(button, countElement, icon, liked, likeCount) {
  button.setAttribute('aria-pressed', String(liked));
  button.title = liked ? 'Descurtir' : 'Curtir';
  countElement.textContent = String(likeCount);
  icon.setAttribute('fill', liked ? 'currentColor' : 'none');
  button.classList.toggle('text-red-600', liked);
  button.classList.toggle('text-blue-600', !liked);
}

likeEventRoot.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-like-button]');
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;

  const liked = button.getAttribute('aria-pressed') === 'true';
  const countElement = button.querySelector('[data-like-count]');
  const icon = button.querySelector('[data-like-icon]');
  const status = button.parentElement.querySelector('[data-like-status]');
  const currentCount = Number(countElement.textContent);
  if (!Number.isSafeInteger(currentCount) || currentCount < 0) {
    status.textContent = 'Não foi possível atualizar a curtida.';
    return;
  }

  const optimisticLiked = !liked;
  const optimisticCount = Math.max(0, currentCount + (optimisticLiked ? 1 : -1));
  button.disabled = true;
  status.textContent = '';
  setLikeState(button, countElement, icon, optimisticLiked, optimisticCount);

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
    if (
      !result
      || typeof result !== 'object'
      || typeof result.liked !== 'boolean'
      || !Number.isSafeInteger(result.likeCount)
      || result.likeCount < 0
    ) {
      throw new Error('O servidor retornou uma resposta inválida para a curtida.');
    }
    setLikeState(button, countElement, icon, result.liked, result.likeCount);
  } catch (error) {
    setLikeState(button, countElement, icon, liked, currentCount);
    status.textContent = error instanceof Error ? error.message : 'Não foi possível atualizar a curtida.';
  } finally {
    button.disabled = false;
  }
});

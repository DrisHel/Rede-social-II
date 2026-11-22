function setCommentCount(section, count) {
  const article = section.closest('article');
  const counter = article?.querySelector('[data-comment-count]')
    || section.parentElement.querySelector('[data-comment-count]');
  if (counter) counter.textContent = String(count);
}

function createCommentElement(comment, currentUserId) {
  const item = document.createElement('li');
  item.dataset.commentId = String(comment.id);
  item.className = 'py-2';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-3';
  const author = document.createElement('p');
  author.className = 'text-xs font-medium text-blue-950';
  author.textContent = comment.author.name;
  const metadata = document.createElement('div');
  metadata.className = 'flex items-center gap-2';
  const date = document.createElement('time');
  date.className = 'text-xs text-blue-400';
  date.textContent = new Date(comment.createdAt).toLocaleString('pt-BR');
  metadata.append(date);

  if (comment.authorId === currentUserId) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.dataset.deleteComment = '';
    removeButton.dataset.commentId = String(comment.id);
    removeButton.className = 'text-xs text-red-600 hover:underline';
    removeButton.textContent = 'Apagar';
    metadata.append(removeButton);
  }

  header.append(author, metadata);
  const content = document.createElement('p');
  content.className = 'text-sm text-blue-900 mt-1 whitespace-pre-wrap';
  content.textContent = comment.content;

  const likedByMe = Boolean(comment.likedByMe);
  const likeControls = document.createElement('div');
  likeControls.className = 'flex items-center gap-2 mt-1';
  const likeButton = document.createElement('button');
  likeButton.type = 'button';
  likeButton.dataset.likeButton = '';
  likeButton.dataset.commentLikeButton = '';
  likeButton.dataset.likeUrl = `/posts/${comment.postId}/comments/${comment.id}/like`;
  likeButton.setAttribute('aria-pressed', String(likedByMe));
  likeButton.title = likedByMe ? 'Descurtir' : 'Curtir';
  likeButton.className = `flex items-center gap-1 text-xs ${likedByMe ? 'text-red-600' : 'text-blue-600'} hover:text-red-600`;

  const likeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  likeIcon.dataset.likeIcon = '';
  likeIcon.setAttribute('viewBox', '0 0 24 24');
  likeIcon.setAttribute('class', 'w-4 h-4');
  likeIcon.setAttribute('fill', likedByMe ? 'currentColor' : 'none');
  likeIcon.setAttribute('stroke', 'currentColor');
  likeIcon.setAttribute('stroke-width', '1.8');
  const likePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  likePath.setAttribute('stroke-linecap', 'round');
  likePath.setAttribute('stroke-linejoin', 'round');
  likePath.setAttribute('d', 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z');
  likeIcon.append(likePath);

  const likeCount = document.createElement('span');
  likeCount.dataset.likeCount = '';
  likeCount.textContent = String(comment._count?.commentLikes ?? 0);
  likeButton.append(likeIcon, likeCount);

  const likeStatus = document.createElement('span');
  likeStatus.dataset.likeStatus = '';
  likeStatus.setAttribute('role', 'status');
  likeStatus.setAttribute('aria-live', 'polite');
  likeStatus.className = 'text-xs text-red-600';
  likeControls.append(likeButton, likeStatus);

  item.append(header, content, likeControls);
  return item;
}

document.querySelectorAll('[data-comment-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const section = form.closest('[data-comment-section]') || form.parentElement.parentElement;
    const postId = form.action.match(/\/posts\/(\d+)\/comments/)?.[1];
    const field = form.elements.namedItem('content');
    const status = section.querySelector('[data-comment-status]');
    const submitButton = form.querySelector('button[type="submit"]');
    if (!postId || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;

    submitButton.disabled = true;
    status.textContent = '';
    try {
      const response = await fetch(`/posts/${postId}/comments`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ content: field.value }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.redirected) throw new Error('Sua sessão expirou. Entre novamente para comentar.');
      const result = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok || !result) {
        throw new Error(result?.error || 'Não foi possível enviar o comentário.');
      }

      const list = section.querySelector('[data-comment-list]');
      list.append(createCommentElement(result, Number(section.dataset.currentUserId)));
      const emptyMessage = list.querySelector('[data-empty-comments]');
      emptyMessage?.remove();
      setCommentCount(section, result.commentCount);
      form.reset();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Não foi possível enviar o comentário.';
    } finally {
      submitButton.disabled = false;
    }
  });
});

document.querySelectorAll('[data-comment-section]').forEach((section) => {
  section.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-comment]');
    if (!button || button.disabled) return;

    const commentId = button.dataset.commentId;
    const postId = section.dataset.postId;
    const status = section.querySelector('[data-comment-status]');
    button.disabled = true;
    status.textContent = '';
    try {
      const response = await fetch(`/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.redirected) throw new Error('Sua sessão expirou. Entre novamente para apagar comentários.');
      const result = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok || !result) {
        throw new Error(result?.error || 'Não foi possível apagar o comentário.');
      }

      button.closest('[data-comment-id]').remove();
      setCommentCount(section, result.commentCount);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Não foi possível apagar o comentário.';
      button.disabled = false;
    }
  });
});

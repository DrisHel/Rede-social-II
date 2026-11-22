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
  item.append(header, content);
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

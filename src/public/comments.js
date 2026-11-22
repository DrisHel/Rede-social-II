function setCommentCount(section, count) {
  const article = section.closest('article');
  const counter = article?.querySelector('[data-comment-count]')
    || section.parentElement.querySelector('[data-comment-count]');
  if (counter) counter.textContent = String(count);
}

function createCommentElement(comment, currentUserId) {
  const item = document.createElement('li');
  item.dataset.commentId = String(comment.id);
  item.dataset.commentCreatedAt = new Date(comment.createdAt).toISOString();
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
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.dataset.editComment = '';
    editButton.dataset.commentId = String(comment.id);
    editButton.className = 'text-xs text-blue-600 hover:underline';
    editButton.textContent = 'Editar';
    metadata.append(editButton);

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
  content.dataset.commentContent = '';
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

function createCommentEditForm(commentId) {
  const form = document.createElement('form');
  form.dataset.editCommentForm = '';
  form.hidden = true;
  form.className = 'mt-2 flex-col gap-2';

  const fieldId = `edit-comment-${commentId}`;
  const label = document.createElement('label');
  label.htmlFor = fieldId;
  label.className = 'sr-only';
  label.textContent = 'Editar comentário';

  const field = document.createElement('textarea');
  field.id = fieldId;
  field.name = 'content';
  field.required = true;
  field.rows = 2;
  field.className = 'w-full border border-blue-200 rounded px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';

  const actions = document.createElement('div');
  actions.className = 'flex justify-end gap-2';
  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'bg-blue-800 text-white text-xs rounded px-3 py-1.5 hover:bg-blue-900';
  saveButton.textContent = 'Salvar';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.dataset.cancelCommentEdit = '';
  cancelButton.className = 'text-xs text-blue-600 hover:underline';
  cancelButton.textContent = 'Cancelar';
  actions.append(saveButton, cancelButton);

  const status = document.createElement('p');
  status.dataset.commentEditStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = 'text-xs text-red-600';
  form.append(label, field, actions, status);
  return form;
}

async function updateComment(form) {
  const section = form.closest('[data-comment-section]');
  const item = form.closest('li[data-comment-id]');
  const commentId = item?.dataset.commentId;
  const postId = section?.dataset.postId;
  const field = form.elements.namedItem('content');
  const status = form.querySelector('[data-comment-edit-status]');
  const submitButton = form.querySelector('button[type="submit"]');
  const content = item?.querySelector('[data-comment-content]');
  const editButton = item?.querySelector('[data-edit-comment]');
  if (
    !postId
    || !commentId
    || !(field instanceof HTMLTextAreaElement)
    || !(status instanceof HTMLElement)
    || !(submitButton instanceof HTMLButtonElement)
    || !(content instanceof HTMLElement)
    || !(editButton instanceof HTMLButtonElement)
  ) return;

  submitButton.disabled = true;
  status.textContent = '';
  try {
    const response = await fetch(`/posts/${postId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ content: field.value }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.redirected) throw new Error('Sua sessão expirou. Entre novamente para editar comentários.');
    const result = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok || !result || typeof result.content !== 'string') {
      throw new Error(result?.error || 'Não foi possível editar o comentário.');
    }

    content.textContent = result.content;
    content.hidden = false;
    form.hidden = true;
    form.classList.remove('flex');
    editButton.hidden = false;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível editar o comentário.';
  } finally {
    submitButton.disabled = false;
  }
}

const commentEventRoot = document.querySelector('[data-feed-list]') || document;

commentEventRoot.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.matches('[data-edit-comment-form]')) {
    event.preventDefault();
    await updateComment(form);
    return;
  }
  if (!form.matches('[data-comment-form]')) return;

  event.preventDefault();
  const section = form.closest('[data-comment-section]');
  const postId = form.action.match(/\/posts\/(\d+)\/comments/)?.[1];
  const field = form.elements.namedItem('content');
  const status = section?.querySelector('[data-comment-status]');
  const submitButton = form.querySelector('button[type="submit"]');
  const list = section?.querySelector('[data-comment-list]');
  if (
    !section
    || !postId
    || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    || !(status instanceof HTMLElement)
    || !(submitButton instanceof HTMLButtonElement)
    || !(list instanceof HTMLUListElement)
  ) return;

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

commentEventRoot.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  const cancelButton = event.target.closest('[data-cancel-comment-edit]');
  if (cancelButton instanceof HTMLButtonElement) {
    const form = cancelButton.closest('[data-edit-comment-form]');
    const item = cancelButton.closest('li[data-comment-id]');
    const content = item?.querySelector('[data-comment-content]');
    const editButton = item?.querySelector('[data-edit-comment]');
    const field = form?.elements.namedItem('content');
    const status = form?.querySelector('[data-comment-edit-status]');
    if (
      form instanceof HTMLFormElement
      && content instanceof HTMLElement
      && editButton instanceof HTMLButtonElement
      && field instanceof HTMLTextAreaElement
    ) {
      form.hidden = true;
      form.classList.remove('flex');
      field.value = content.textContent || '';
      content.hidden = false;
      editButton.hidden = false;
      if (status instanceof HTMLElement) status.textContent = '';
    }
    return;
  }

  const editButton = event.target.closest('[data-edit-comment]');
  if (editButton instanceof HTMLButtonElement) {
    const item = editButton.closest('li[data-comment-id]');
    const content = item?.querySelector('[data-comment-content]');
    const commentId = item?.dataset.commentId;
    if (!item || !(content instanceof HTMLElement) || !commentId) return;

    let form = item.querySelector('[data-edit-comment-form]');
    if (!(form instanceof HTMLFormElement)) {
      form = createCommentEditForm(commentId);
      content.after(form);
    }
    const field = form.elements.namedItem('content');
    if (!(field instanceof HTMLTextAreaElement)) return;
    field.value = content.textContent || '';
    form.hidden = false;
    form.classList.add('flex');
    content.hidden = true;
    editButton.hidden = true;
    field.focus();
    return;
  }

  const button = event.target.closest('[data-delete-comment]');
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;

  const section = button.closest('[data-comment-section]');
  const commentId = button.dataset.commentId;
  const postId = section?.dataset.postId;
  const status = section?.querySelector('[data-comment-status]');
  if (!section || !commentId || !postId || !(status instanceof HTMLElement)) return;

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

    button.closest('li[data-comment-id]')?.remove();
    setCommentCount(section, result.commentCount);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível apagar o comentário.';
    button.disabled = false;
  }
});

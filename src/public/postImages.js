const input = document.querySelector('[data-post-images-input]');
const list = document.querySelector('[data-post-image-list]');
const status = document.querySelector('[data-post-image-status]');
const maxFiles = Number(input.dataset.maxFiles);
let selectedFiles = new DataTransfer();

function getFileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function renderSelectedFiles() {
  input.files = selectedFiles.files;
  list.replaceChildren();

  Array.from(selectedFiles.files).forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'flex items-center justify-between gap-2';

    const name = document.createElement('span');
    name.textContent = file.name;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.dataset.removePostImage = '';
    removeButton.dataset.index = String(index);
    removeButton.className = 'text-red-600 hover:underline';
    removeButton.textContent = 'Remover';
    removeButton.setAttribute('aria-label', `Remover a foto ${file.name}`);

    item.append(name, removeButton);
    list.append(item);
  });
}

input.addEventListener('change', () => {
  const newlySelectedFiles = Array.from(input.files);
  const knownFileKeys = new Set(Array.from(selectedFiles.files, getFileKey));
  let exceededLimit = false;
  newlySelectedFiles.forEach((file) => {
    const key = getFileKey(file);
    if (knownFileKeys.has(key)) return;
    if (selectedFiles.files.length >= maxFiles) {
      exceededLimit = true;
      return;
    }
    selectedFiles.items.add(file);
    knownFileKeys.add(key);
  });

  status.textContent = exceededLimit
    ? `Você pode adicionar no máximo ${maxFiles} fotos.`
    : '';
  renderSelectedFiles();
});

list.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-remove-post-image]');
  if (!button) return;

  const index = Number(button.dataset.index);
  if (!Number.isInteger(index)) return;
  const updatedFiles = new DataTransfer();
  Array.from(selectedFiles.files).forEach((file, fileIndex) => {
    if (fileIndex !== index) updatedFiles.items.add(file);
  });
  selectedFiles = updatedFiles;
  status.textContent = '';
  renderSelectedFiles();
});

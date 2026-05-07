// A small DOM modal for collecting a GitHub Personal Access Token.
// Returns the entered token (trimmed) or null if the user cancelled.
//
// Why a modal and not window.prompt(): native prompts render the URL as
// plain text the user cannot select or click, which makes the
// "go generate a token at this URL" instruction impossible to follow.

const PAT_URL = 'https://github.com/settings/tokens/new?scopes=repo&description=metafunctor%20jigsaw';

export function promptForToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'jigsaw-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'jigsaw-modal';

    const heading = document.createElement('h2');
    heading.textContent = 'Sign in to play';

    const intro = document.createElement('p');
    intro.textContent = 'The jigsaw needs a GitHub Personal Access Token to commit your piece placements. The token stays in your browser; the page only ever sends it to api.github.com.';

    const stepsHeading = document.createElement('p');
    stepsHeading.className = 'jigsaw-modal-steps-heading';
    stepsHeading.textContent = 'Steps:';

    const ol = document.createElement('ol');

    const li1 = document.createElement('li');
    const link = document.createElement('a');
    link.href = PAT_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open the token-creation page';
    li1.appendChild(link);
    li1.appendChild(document.createTextNode(' (opens in a new tab; pre-fills name and "repo" scope).'));

    const li2 = document.createElement('li');
    li2.textContent = 'On that page, scroll to the bottom and click "Generate token".';

    const li3 = document.createElement('li');
    li3.textContent = 'Copy the token (it starts with "ghp_") and paste it below.';

    ol.append(li1, li2, li3);

    const inputLabel = document.createElement('label');
    inputLabel.className = 'jigsaw-modal-input-label';
    inputLabel.textContent = 'Token:';
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'ghp_...';
    inputLabel.appendChild(input);

    const buttons = document.createElement('div');
    buttons.className = 'jigsaw-modal-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.className = 'jigsaw-modal-cancel';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.textContent = 'Sign in';
    submit.className = 'jigsaw-modal-submit';
    buttons.append(cancel, submit);

    modal.append(heading, intro, stepsHeading, ol, inputLabel, buttons);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const cleanup = (): void => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };

    const onSubmit = (): void => {
      const value = input.value.trim();
      cleanup();
      resolve(value === '' ? null : value);
    };

    const onCancel = (): void => {
      cleanup();
      resolve(null);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && document.activeElement === input) onSubmit();
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) onCancel();
    });
    cancel.addEventListener('click', onCancel);
    submit.addEventListener('click', onSubmit);
    document.addEventListener('keydown', onKey);

    setTimeout(() => input.focus(), 0);
  });
}

export function showSignOutMenu(anchor: HTMLElement, onSignOut: () => void): void {
  const existing = document.querySelector('.jigsaw-signout-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('ul');
  menu.className = 'jigsaw-signout-menu';
  menu.setAttribute('role', 'menu');

  const item = document.createElement('li');
  item.setAttribute('role', 'menuitem');
  item.tabIndex = 0;
  item.textContent = 'Sign out';
  item.addEventListener('click', () => {
    cleanup();
    onSignOut();
  });
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      cleanup();
      onSignOut();
    }
  });
  menu.appendChild(item);

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${rect.right + window.scrollX - 120}px`;
  document.body.appendChild(menu);
  setTimeout(() => item.focus(), 0);

  const cleanup = (): void => {
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onEscape);
    menu.remove();
  };

  const onOutsideClick = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node) && e.target !== anchor) cleanup();
  };
  const onEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') cleanup();
  };
  setTimeout(() => {
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onEscape);
  }, 0);
}

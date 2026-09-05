/* ============================================================
   ProtoMacro — core/modal.js
   Accessible dialog helper (no dependencies).
   - role="dialog" + aria-modal
   - focus trapped inside, Esc closes, overlay click closes
   - focus restored to the opener on close
   - optional confirm() style API for destructive prompts
   ============================================================ */

let openStack = [];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function openModal({ title, body, actions = [], onClose = null, wide = false }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <div class="modal-head">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <button type="button" class="modal-close" data-modal-close aria-label="Close dialog">✕</button>
      </div>
      <div class="modal-body"></div>
      ${actions.length ? '<div class="modal-actions"></div>' : ''}
    </div>
  `;

  const bodyEl = $('.modal-body', overlay);
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  const actionsEl = $('.modal-actions', overlay);
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = a.class || 'btn btn-ghost';
    btn.textContent = a.label;
    btn.addEventListener('click', () => {
      const result = a.onClick?.(overlay);
      if (result !== false) close();
    });
    actionsEl.appendChild(btn);
  }

  const prevFocus = document.activeElement;
  const modal = $('.modal', overlay);

  function close() {
    if (!overlay.isConnected) return;
    openStack = openStack.filter((m) => m !== api);
    /* graceful exit: fade/scale out, then detach */
    overlay.classList.add('closing');
    const finish = () => {
      overlay.remove();
      document.body.style.overflow = openStack.length ? 'hidden' : '';
      onClose?.();
      if (prevFocus instanceof HTMLElement) prevFocus.focus();
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) finish();
    else setTimeout(finish, 160);
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  $('[data-modal-close]', overlay).addEventListener('click', close);

  /* keydown trap — scoped to this overlay */
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...modal.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  const firstInput = $('input, select, textarea', modal);
  (firstInput || modal).focus();

  const api = { close, overlay, modal };
  openStack.push(api);
  return api;
}

/* Promise-based form modal — resolves form values or null on cancel */
export function formModal({ title, fields, submitLabel = 'Save', wide = false }) {
  return new Promise((resolve) => {
    const form = document.createElement('form');
    form.innerHTML = fields
      .map(
        (f) => `
      <div class="form-group${f.full ? ' full' : ''}">
        <label class="form-label" for="mf-${f.id}">${escapeHtml(f.label)}</label>
        ${
          f.type === 'select'
            ? `<select class="form-select" id="mf-${f.id}">${f.options
                .map((o) => `<option value="${escapeAttr(o.value)}"${o.value === f.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
                .join('')}</select>`
            : `<input class="form-input" id="mf-${f.id}" type="${f.type || 'text'}"
                value="${escapeAttr(f.value ?? '')}" ${f.min !== undefined ? `min="${f.min}"` : ''}
                ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''}
                placeholder="${escapeAttr(f.placeholder || '')}" />`
        }
      </div>
    `
      )
      .join('');

    let done = false;
    const modal = openModal({
      title,
      body: form,
      wide,
      actions: [
        {
          label: 'Cancel',
          class: 'btn btn-ghost',
          onClick: () => {
            done = true;
            resolve(null);
          }
        },
        {
          label: submitLabel,
          class: 'btn btn-primary',
          onClick: () => {
            const values = {};
            for (const f of fields) {
              const el = $(`#mf-${f.id}`, form);
              values[f.id] = f.type === 'number' ? parseFloat(el.value) : el.value;
            }
            done = true;
            resolve(values);
          }
        }
      ],
      onClose: () => {
        if (!done) resolve(null);
      }
    });

    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        $('.btn-primary', modal.actions).click();
      }
    });
  });
}

/* Small helpers duplicated locally to avoid a circular import with utils */
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeAttr = (s) => escapeHtml(s);
const $ = (sel, root = document) => root.querySelector(sel);

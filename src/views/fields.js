export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function textField({ id, name, label, value = '', error = '', placeholder = '', type = 'text', autocomplete = '', help = '', maxlength = '', required = false, inputmode, min, max, pattern, disabled = false, hint = '' }) {
  const described = [
    `field-${id}`,
    error ? `field-${id}-error` : '',
    help ? `field-${id}-help` : '',
  ].filter(Boolean);
  return `
    <div class="field${error ? ' field--error' : ''}">
      <label for="${id}">${escapeHtml(label)}<span class="req" aria-hidden="true">*</span></label>
      <input id="${id}" name="${name}" type="${type}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(value)}"
        ${required ? 'required' : ''} ${maxlength ? `maxlength="${maxlength}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}
        ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''} ${pattern ? `pattern="${pattern}"` : ''}
        ${autocomplete ? `autocomplete="${autocomplete}"` : ''}
        ${disabled ? 'disabled' : ''}
        ${error ? 'aria-invalid="true"' : ''}
        aria-describedby="${escapeAttr(described.join(' '))}"${help ? ` aria-describedby-extra` : ''}>
      ${error ? `<p class="field-error" id="field-${id}-error">${escapeHtml(error)}</p>` : ''}
      ${help ? `<p class="field-help" id="field-${id}-help">${escapeHtml(help)}</p>` : ''}
      ${hint ? `<p class="field-hint" id="field-${id}-hint">${escapeHtml(hint)}</p>` : ''}
    </div>`;
}

export function selectField({ id, name, label, value = '', error = '', disabled = false }) {
  const options = FIELD_LABELS[name]?.options || [];
  return `
    <div class="field${error ? ' field--error' : ''}">
      <label for="${id}">${escapeHtml(label)}<span class="req" aria-hidden="true">*</span></label>
      <select id="${id}" name="${name}" ${disabled ? 'disabled' : ''}${error ? 'aria-invalid="true"' : ''}>
        <option value="">Choose</option>
        ${options.map(option => `<option value="${escapeAttr(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}
      </select>
      ${error ? `<p class="field-error" id="field-${id}-error">${escapeHtml(error)}</p>` : ''}
    </div>`;
}

export const FIELD_LABELS = {
  fullName: 'Full name',
  email: 'Email',
  phone: { label: 'Mobile number' },
  address1: 'Address line 1',
  address2: 'Address line 2',
  city: 'City',
  state: { label: 'State', options: ['Maharashtra'] },
  pin: 'PIN',
};

// Shared Tailwind class strings for mcp-studio form controls + panel actions.
// Extracted so the byte-identical strings aren't redefined in every component
// (ConnectionForm/SchemaForm inputs, the four capability-panel action buttons).

export const FIELD_INPUT_CLS =
  'w-full bg-surface-raised border border-border rounded-lg px-2.5 py-1.5 text-xs text-on-surface outline-none font-[inherit] focus:border-accent transition-colors duration-150'

export const FIELD_LABEL_CLS = 'text-[0.65rem] text-on-surface-muted'

export const PANEL_ACTION_BTN_CLS =
  'px-3 py-1.5 bg-accent text-accent-text text-xs rounded-lg font-medium hover:bg-accent-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed'

# DevHub — Coding Standards

## Styling

### Tailwind-first — no inline styles

**Never** use `style={{}}` props for static or conditional styling. Use Tailwind utility classes.

```tsx
// ❌
<div style={{ display: 'flex', gap: 8, backgroundColor: 'var(--surface)' }}>

// ✅
<div className="flex gap-2 bg-surface">
```

**Exception:** Runtime-dynamic values that are not expressible as Tailwind utilities — e.g., colors coming from a JavaScript data array (`style={{ backgroundColor: t.surface }}`). These are the only permitted inline styles and must be data-driven, not hardcoded.

### No JS style mutations

**Never** use `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` to mutate `e.target.style` or `e.currentTarget.style`. Use Tailwind state variants instead.

```tsx
// ❌
onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}

// ✅
className="border-border hover:border-accent transition-colors duration-150"
```

```tsx
// ❌
onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
onBlur={e => (e.target.style.borderColor = 'var(--border)')}

// ✅
className="border-border focus:border-accent transition-colors duration-150"
```

```tsx
// ❌
onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}

// ✅
className="active:scale-95 transition-transform duration-150"
```

### Conditional classes use `cn()`

Import `cn` from `@/lib/utils` for all conditional or merged class strings. Never use template literals or ternaries inside `className` directly.

```tsx
// ❌
className={`flex ${isActive ? 'text-accent' : 'text-on-surface-muted'}`}

// ✅
import { cn } from '@/lib/utils'
className={cn('flex', isActive ? 'text-accent' : 'text-on-surface-muted')}
```

### Companion `.css` files for pseudo-selectors Tailwind can't express

When a CSS rule requires a selector that Tailwind cannot express cleanly (e.g., `:not([aria-current="page"]):hover`), create a companion CSS file with the same name as the component.

```
Sidebar.tsx  →  Sidebar.css
```

Import it at the top of the component file:

```tsx
import './Sidebar.css'
```

Keep companion files thin — only rules that genuinely cannot be Tailwind.

### CSS custom property → Tailwind mapping

The project uses `@theme inline` in `src/index.css` to map CSS custom properties to Tailwind color utilities. Use these everywhere:

| CSS var | Tailwind class |
|---------|---------------|
| `var(--surface)` | `bg-surface` / `text-surface` |
| `var(--surface-raised)` | `bg-surface-raised` |
| `var(--surface-hover)` | `bg-surface-hover` |
| `var(--on-surface)` | `text-on-surface` |
| `var(--on-surface-muted)` | `text-on-surface-muted` |
| `var(--border)` | `border-border` / `bg-border` |
| `var(--accent)` | `bg-accent` / `text-accent` / `border-accent` |
| `var(--accent-hover)` | `bg-accent-hover` |
| `var(--accent-text)` | `text-accent-text` |

### Reusable style patterns

Extract repeated Tailwind class strings to a `const` rather than duplicating them inline.

```tsx
// ❌ Repeated across 5 select elements
<select style={selectStyle}>

// ✅
const SELECT_CLS = 'w-full bg-surface-raised border border-border rounded-lg px-[10px] py-1.5 text-xs text-on-surface outline-none font-[inherit] cursor-pointer'
<select className={SELECT_CLS}>
```

### Animations

- Keep animations simple and minimal
- Use Tailwind transition utilities: `transition-colors`, `transition-[width]`, `transition-transform`, `transition-all`
- Use `duration-150` for UI interactions, `duration-200` for layout transitions (sidebar collapse)
- Complex keyframe animations go in a companion `.css` file — not inline, not JS-driven

### Non-standard values

Use Tailwind arbitrary values for non-standard sizes rather than inline styles:

```tsx
// ❌
style={{ width: 220, borderRadius: 18 }}

// ✅
className="w-[220px] rounded-[18px]"
```

---

## Components

- Use `cn()` for any className that has conditional logic
- Give important layout elements a semantic class name (e.g., `sidebar-nav-link`, `topbar-search`, `studio-card`) for readability and CSS hook points
- `font-[inherit]` replaces `fontFamily: 'inherit'` when needed

## TypeScript

- Run `npx tsc --noEmit` after every file change
- No `@ts-ignore` or `as any` unless absolutely unavoidable with a comment explaining why

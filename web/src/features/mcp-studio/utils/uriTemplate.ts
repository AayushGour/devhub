// Minimal RFC-6570 URI-template handling for the resource-templates panel.
// Split out of TemplatesPanel (pure + unit-tested) mirroring schemaFormFields.
//
// Supports the common operators — simple {var}, reserved {+var}, fragment
// {#var}, label {.var}, path {/var}, path-style {;var}, query {?var}, and
// query-continuation {&var} — plus comma-separated variable lists ({?a,b}).
// Value modifiers (explode `*`, prefix `:N`) are recognised in the variable
// name but not applied to the plain-string values this UI collects.

interface OpSpec {
  prefix: string
  sep: string
  named: boolean
  reserved: boolean
}

const OPERATORS: Record<string, OpSpec> = {
  '': { prefix: '', sep: ',', named: false, reserved: false },
  '+': { prefix: '', sep: ',', named: false, reserved: true },
  '#': { prefix: '#', sep: ',', named: false, reserved: true },
  '.': { prefix: '.', sep: '.', named: false, reserved: false },
  '/': { prefix: '/', sep: '/', named: false, reserved: false },
  ';': { prefix: ';', sep: ';', named: true, reserved: false },
  '?': { prefix: '?', sep: '&', named: true, reserved: false },
  '&': { prefix: '&', sep: '&', named: true, reserved: false },
}

const EXPRESSION_RE = /\{([^}]+)\}/g
const OPERATOR_RE = /^[+#./;?&]/

// RFC-3986 reserved set, left unencoded under reserved (`+`/`#`) expansion.
const RESERVED = ":/?#[]@!$&'()*+,;="

/** Strip explode/prefix modifiers to get the bare variable name. */
function varName(varSpec: string): string {
  return varSpec.replace(/\*$/, '').replace(/:\d+$/, '').trim()
}

function pctEncode(str: string, allowReserved: boolean): string {
  let out = ''
  for (const ch of str) {
    if (/[A-Za-z0-9\-._~]/.test(ch) || (allowReserved && RESERVED.includes(ch))) {
      out += ch
    } else {
      out += encodeURIComponent(ch)
    }
  }
  return out
}

/**
 * Extract the ordered, de-duplicated list of variable names from a URI template.
 * E.g. `file:///logs/{date}/{level}.log` → ['date', 'level']
 *      `search{?q,page}` → ['q', 'page']
 */
export function extractTemplateParams(uriTemplate: string): string[] {
  const params: string[] = []
  const seen = new Set<string>()

  for (const [, expr] of uriTemplate.matchAll(EXPRESSION_RE)) {
    const body = OPERATOR_RE.test(expr) ? expr.slice(1) : expr
    for (const varSpec of body.split(',')) {
      const name = varName(varSpec)
      if (name && !seen.has(name)) {
        params.push(name)
        seen.add(name)
      }
    }
  }

  return params
}

/**
 * Expand a URI template against filled-in parameter values. Uses a single
 * expression-matching pass (no per-key RegExp built from untrusted names, so a
 * name containing regex metacharacters can't crash or mis-match), applies the
 * correct operator prefix/separator/named form, and percent-encodes each value.
 * Variables with no value are omitted.
 */
export function expandUriTemplate(
  uriTemplate: string,
  paramValues: Record<string, string>,
): string {
  return uriTemplate.replace(EXPRESSION_RE, (_match, expr: string) => {
    const op = OPERATOR_RE.test(expr) ? expr[0] : ''
    const body = op ? expr.slice(1) : expr
    const spec = OPERATORS[op] ?? OPERATORS['']

    const parts: string[] = []
    for (const varSpec of body.split(',')) {
      const name = varName(varSpec)
      const value = paramValues[name]
      if (name === '' || value === undefined || value === '') continue
      const encoded = pctEncode(value, spec.reserved)
      parts.push(spec.named ? `${name}=${encoded}` : encoded)
    }

    return parts.length === 0 ? '' : spec.prefix + parts.join(spec.sep)
  })
}

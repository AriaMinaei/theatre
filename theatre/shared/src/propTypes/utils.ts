import type {
  PropTypeConfig,
  PropTypeConfig_Compound,
  PropTypeConfig_Enum,
} from '@theatre/core/propTypes'
import type {PathToProp} from '@theatre/shared/utils/addresses'
import type {$IntentionalAny} from '@theatre/shared/utils/types'

export function isPropConfigComposite(
  c: PropTypeConfig,
): c is PropTypeConfig_Compound<{}> | PropTypeConfig_Enum {
  return c.type === 'compound' || c.type === 'enum'
}

export function getPropConfigByPath(
  parentConf: PropTypeConfig | undefined,
  path: PathToProp,
): undefined | PropTypeConfig {
  if (!parentConf) return undefined
  const [key, ...rest] = path
  if (typeof key === 'undefined') return parentConf
  if (!isPropConfigComposite(parentConf)) return undefined

  const sub =
    parentConf.type === 'enum'
      ? parentConf.cases[key]
      : (parentConf as $IntentionalAny).props[key]

  return getPropConfigByPath(sub, rest)
}

/**
 * @param value An arbitrary value. May be matching the prop's type or not
 * @param propConfig The configuration object for a prop
 * @returns value if it matches the prop's type, otherwise returns the default value for the prop
 */
export function valueInProp(value: unknown, propConfig: PropTypeConfig) {
  const sanitizedVal = propConfig.sanitize!(value)
  if (typeof sanitizedVal === 'undefined') {
    return propConfig.default
  } else {
    return sanitizedVal
  }
}

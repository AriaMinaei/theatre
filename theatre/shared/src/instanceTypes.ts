import type {IProject, ISheet, ISheetObject} from '@theatre/core'
import type Project from '@theatre/core/projects/Project'
import type SheetObject from '@theatre/core/sheetObjects/SheetObject'
import type SheetObjectTemplate from '@theatre/core/sheetObjects/SheetObjectTemplate'
import type Sheet from '@theatre/core/sheets/Sheet'
import type SheetTemplate from '@theatre/core/sheets/SheetTemplate'
import type {$IntentionalAny} from './utils/types'
import type Sequence from '@theatre/core/sequences/Sequence'

/**
 * Since \@theatre/core and \@theatre/studio are separate bundles,
 * they cannot use `x instanceof Y` to detect object types.
 *
 * The functions in this module are supposed to be a replacement for that.
 */

export const isProject = typeAsserter<Project>('Theatre_Project')

export const isSheet = typeAsserter<Sheet>('Theatre_Sheet')
export const isSheetTemplate = typeAsserter<SheetTemplate>(
  'Theatre_SheetTemplate',
)

export const isSheetObject = typeAsserter<SheetObject>('Theatre_SheetObject')

export const isSequence = typeAsserter<Sequence>('Theatre_Sequence')

export const isSheetObjectTemplate = typeAsserter<SheetObjectTemplate>(
  'Theatre_SheetObjectTemplate',
)

export const isProjectPublicAPI = typeAsserter<IProject>(
  'Theatre_Project_PublicAPI',
)

export const isSheetPublicAPI = typeAsserter<ISheet>('Theatre_Sheet_PublicAPI')

export const isSheetObjectPublicAPI = typeAsserter<ISheetObject>(
  'Theatre_SheetObject_PublicAPI',
)

function typeAsserter<T extends {type: string}>(
  t: T['type'],
): (v: unknown) => v is T {
  return (v: unknown): v is T =>
    typeof v === 'object' && !!v && (v as $IntentionalAny).type === t
}

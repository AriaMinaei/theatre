import type {Pointer} from '@theatre/dataverse'
import {isSequence, isSheetObject} from '@theatre/shared/instanceTypes'
import type {$FixMe, $IntentionalAny} from '@theatre/shared/utils/types'
import get from 'lodash-es/get'
import isInteger from 'lodash-es/isInteger'
import type {ITransactionPrivateApi} from './StudioStore'
import forEachPropDeep from '@theatre/shared/utils/forEachDeep'
import getDeep from '@theatre/shared/utils/getDeep'
import type {SequenceTrackId} from '@theatre/shared/utils/ids'
import {getPointerParts} from '@theatre/dataverse'
import type {
  PropTypeConfig,
  PropTypeConfig_AllSimples,
  PropTypeConfig_Compound,
} from '@theatre/core/propTypes'
import type {PathToProp} from '@theatre/shared/src/utils/addresses'
import {getPropConfigByPath} from '@theatre/shared/propTypes/utils'
import {isPlainObject} from 'lodash-es'
import userReadableTypeOfValue from '@theatre/shared/utils/userReadableTypeOfValue'

/**
 * Deep-clones a plain JS object or a `string | number | boolean`. In case of a plain
 * object, all its sub-props that aren't `string | number | boolean` get pruned. Also,
 * all empty objects (i.e. `{}`) get pruned.
 *
 * This is only used by {@link ITransactionPrivateApi.set} and it follows the global rule
 * that values pointed to by `object.props[...]` are never `null | undefined` or an empty object.
 */
function cloneDeepSerializableAndPrune<T>(v: T): T | undefined {
  if (
    typeof v === 'boolean' ||
    typeof v === 'string' ||
    typeof v === 'number'
  ) {
    return v
  } else if (isPlainObject(v)) {
    const cloned: $IntentionalAny = {}
    let clonedAtLeastOneProp = false
    for (const [key, val] of Object.entries(v as {})) {
      const clonedVal = cloneDeepSerializableAndPrune(val)
      if (clonedVal !== undefined) {
        cloned[key] = val
        clonedAtLeastOneProp = true
      }
    }
    if (clonedAtLeastOneProp) {
      return cloned
    }
  } else {
    return undefined
  }
}

/**
 * TODO replace with {@link iteratePropType}
 */
function forEachDeepSimplePropOfCompoundProp(
  propType: PropTypeConfig_Compound<$IntentionalAny>,
  path: Array<string | number>,
  callback: (
    propType: PropTypeConfig_AllSimples,
    path: Array<string | number>,
  ) => void,
) {
  for (const [key, subType] of Object.entries(propType.props)) {
    if (subType.type === 'compound') {
      forEachDeepSimplePropOfCompoundProp(subType, [...path, key], callback)
    } else if (subType.type === 'enum') {
      throw new Error(`Not yet implemented`)
    } else {
      callback(subType, [...path, key])
    }
  }
}

export default function createTransactionPrivateApi(
  ensureRunning: () => void,
  stateEditors: ITransactionPrivateApi['stateEditors'],
  drafts: ITransactionPrivateApi['drafts'],
): ITransactionPrivateApi {
  return {
    set: (pointer, value) => {
      ensureRunning()
      const _value = cloneDeepSerializableAndPrune(value)
      if (typeof _value === 'undefined') return

      const {root, path} = getPointerParts(pointer as Pointer<$FixMe>)
      if (isSheetObject(root)) {
        const sequenceTracksTree = root.template
          .getMapOfValidSequenceTracks_forStudio()
          .getValue()

        const propConfig = getPropConfigByPath(root.template.staticConfig, path)

        if (!propConfig) {
          throw new Error(
            `Object ${
              root.address.objectKey
            } does not have a prop at ${JSON.stringify(path)}`,
          )
        }

        // if (isPropConfigComposite(propConfig)) {
        //   propConfig.validate(_value)
        // } else {

        //   propConfig.validate(_value)
        // }

        const setStaticOrKeyframeProp = <T>(
          value: T,
          propConfig: PropTypeConfig_AllSimples,
          path: PathToProp,
        ) => {
          if (value === undefined || value === null) {
            return
          }

          const deserialized = cloneDeepSerializableAndPrune(
            propConfig.deserializeAndSanitize(value),
          )
          if (deserialized === undefined) {
            throw new Error(
              `Invalid value ${userReadableTypeOfValue(
                value,
              )} for object.props${path
                .map((key) => `[${JSON.stringify(key)}]`)
                .join('')} is invalid`,
            )
          }

          const propAddress = {...root.address, pathToProp: path}

          const trackId = get(sequenceTracksTree, path) as $FixMe as
            | SequenceTrackId
            | undefined

          if (typeof trackId === 'string') {
            const seq = root.sheet.getSequence()
            seq.position = seq.closestGridPosition(seq.position)
            stateEditors.coreByProject.historic.sheetsById.sequence.setKeyframeAtPosition(
              {
                ...propAddress,
                trackId,
                position: seq.position,
                value: value as $FixMe,
                snappingFunction: seq.closestGridPosition,
                type: 'bezier',
              },
            )
          } else {
            stateEditors.coreByProject.historic.sheetsById.staticOverrides.byObject.setValueOfPrimitiveProp(
              {...propAddress, value: value as $FixMe},
            )
          }
        }

        if (propConfig.type === 'compound') {
          const pathToTopPointer = getPointerParts(
            pointer as $IntentionalAny,
          ).path

          const lengthOfTopPointer = pathToTopPointer.length
          // If we are dealing with a compound prop, we recurse through its
          // nested properties.
          forEachDeepSimplePropOfCompoundProp(
            propConfig,
            pathToTopPointer,
            (primitivePropConfig, pathToProp) => {
              const pathToPropInProvidedValue =
                pathToProp.slice(lengthOfTopPointer)

              const v = getDeep(_value as {}, pathToPropInProvidedValue)
              if (typeof v !== 'undefined') {
                setStaticOrKeyframeProp(v, primitivePropConfig, pathToProp)
              } else {
                throw new Error(
                  `Property object.props${pathToProp
                    .map((key) => `[${JSON.stringify(key)}]`)
                    .join('')} is required but not provided`,
                )
              }
            },
          )
        } else if (propConfig.type === 'enum') {
          throw new Error(`Enums aren't implemented yet`)
        } else {
          setStaticOrKeyframeProp(_value, propConfig, path)
        }
      } else if (isSequence(root)) {
        const [prop] = path
        if (prop === 'subUnitsPerUnit') {
          if (typeof _value !== 'number' || !isInteger(_value) || _value < 1) {
            throw new Error(
              `Value ${_value} is not an integer, which is required for setting sequence prop ${prop}`,
            )
          }
          stateEditors.coreByProject.historic.sheetsById.sequence.setSubUnitsPerUnit(
            {
              ...root.address,
              subUnitsPerUnit: _value,
            },
          )
        } else if (prop === 'length') {
          if (typeof _value !== 'number' || _value <= 0.001) {
            throw new Error(
              `Value ${_value} is not a positive number, which is required for setting sequence prop ${prop}`,
            )
          }
          stateEditors.coreByProject.historic.sheetsById.sequence.setLength({
            ...root.address,
            length: _value,
          })
        } else {
          throw new Error(`Setting sequence prop ${prop} is not supported`)
        }
      } else {
        throw new Error(
          'Only setting props of SheetObject-s and sequences is supported in a transaction so far',
        )
      }
    },
    unset: (pointer) => {
      ensureRunning()
      const {root, path} = getPointerParts(pointer as Pointer<$FixMe>)
      if (isSheetObject(root)) {
        const sequenceTracksTree = root.template
          .getMapOfValidSequenceTracks_forStudio()
          .getValue()

        const defaultValue = getDeep(
          root.template.getDefaultValues().getValue(),
          path,
        )

        const propConfig = getPropConfigByPath(
          root.template.staticConfig,
          path,
        ) as PropTypeConfig

        const unsetStaticOrKeyframeProp = <T>(value: T, path: PathToProp) => {
          const propAddress = {...root.address, pathToProp: path}

          const trackId = get(sequenceTracksTree, path) as $FixMe as
            | SequenceTrackId
            | undefined

          if (typeof trackId === 'string') {
            stateEditors.coreByProject.historic.sheetsById.sequence.unsetKeyframeAtPosition(
              {
                ...propAddress,
                trackId,
                position: root.sheet.getSequence().positionSnappedToGrid,
              },
            )
          } else if (propConfig !== undefined) {
            stateEditors.coreByProject.historic.sheetsById.staticOverrides.byObject.unsetValueOfPrimitiveProp(
              propAddress,
            )
          }
        }

        if (propConfig.type === 'compound') {
          forEachPropDeep(
            defaultValue,
            (v, pathToProp) => {
              unsetStaticOrKeyframeProp(v, pathToProp)
            },
            getPointerParts(pointer).path,
          )
        } else {
          unsetStaticOrKeyframeProp(defaultValue, path)
        }
      } else {
        throw new Error(
          'Only setting props of SheetObject-s is supported in a transaction so far',
        )
      }
    },
    get drafts() {
      ensureRunning()
      return drafts
    },
    get stateEditors() {
      return stateEditors
    },
  }
}

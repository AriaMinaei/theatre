import type Project from '@theatre/core/projects/Project'
import Sequence from '@theatre/core/sequences/Sequence'
import type SheetObject from '@theatre/core/sheetObjects/SheetObject'
import type {SheetObjectPropTypeConfig} from '@theatre/core/sheets/TheatreSheet'
import TheatreSheet from '@theatre/core/sheets/TheatreSheet'
import type {SheetAddress} from '@theatre/shared/utils/addresses'
import {Atom, Box, valueDerivation} from '@theatre/dataverse'
import type SheetTemplate from './SheetTemplate'
import type {ObjectAddressKey, SheetInstanceId} from '@theatre/shared/utils/ids'
import type {StrictRecord} from '@theatre/shared/utils/types'
import type {ILogger} from '@theatre/shared/logger'
import {isInteger} from 'lodash-es'

type SheetObjectMap = StrictRecord<ObjectAddressKey, SheetObject>

/**
 * Future: `nativeObject` Idea is to potentially allow the user to provide their own
 * object in to the object call as a way to keep a handle to an underlying object via
 * the {@link ISheetObject}.
 *
 * For example, a THREEjs object or an HTMLElement is passed in.
 */
export type ObjectNativeObject = unknown

export default class Sheet {
  private readonly _objects: Atom<SheetObjectMap> = new Atom<SheetObjectMap>({})
  private _sequences: undefined | Sequence[]
  readonly address: SheetAddress
  readonly publicApi: TheatreSheet
  readonly project: Project
  readonly objectsP = this._objects.pointer
  type: 'Theatre_Sheet' = 'Theatre_Sheet'
  readonly _logger: ILogger

  constructor(
    readonly template: SheetTemplate,
    public readonly instanceId: SheetInstanceId,
  ) {
    this._logger = template.project._logger.named('Sheet', instanceId)
    this._logger._trace('creating sheet')
    this.project = template.project
    this.address = {
      ...template.address,
      sheetInstanceId: this.instanceId,
    }

    this.publicApi = new TheatreSheet(this)
  }

  /**
   * @remarks At some point, we have to reconcile the concept of "an object"
   * with that of "an element."
   */
  createObject(
    objectKey: ObjectAddressKey,
    nativeObject: ObjectNativeObject,
    config: SheetObjectPropTypeConfig,
  ): SheetObject {
    const objTemplate = this.template.getObjectTemplate(
      objectKey,
      nativeObject,
      config,
    )

    const object = objTemplate.createInstance(this, nativeObject, config)

    this._objects.setIn([objectKey], object)

    return object
  }

  getObject(key: ObjectAddressKey): SheetObject | undefined {
    return this._objects.getState()[key]
  }

  getSequences(): Sequence[] {
    if (!this._sequences) {
      const sequences = valueDerivation(
        this.project.pointers.historic.sheetsById[this.address.sheetId]
          .sequences,
      )
      // const lengthD = sequences.map((sequences) =>
      //   sanitizeSequenceLength(sequences?.[0].length),
      // )
      // const subUnitsPerUnitD = sequences.map((sequences) =>
      //   sanitizeSequenceSubUnitsPerUnit(sequences?.[0].subUnitsPerUnit),
      // )

      // this._sequences = [
      //   new Sequence(this.template.project, this, lengthD, subUnitsPerUnitD),
      // ]

      const sequences2 = sequences.getValue()

      this._sequences =
        sequences2?.map((sequence) => {
          const box = new Box(sanitizeSequenceLength(sequence.length))
          const obox = new Box(
            sanitizeSequenceSubUnitsPerUnit(sequence.subUnitsPerUnit),
          )
          return new Sequence(
            this.template.project,
            this,
            box.derivation,
            obox.derivation,
            undefined,
            'wow',
          )
        }) ?? []
    }

    return this._sequences
  }
}

const sanitizeSequenceLength = (len: number | undefined): number =>
  typeof len === 'number' && isFinite(len) && len > 0 ? len : 10

const sanitizeSequenceSubUnitsPerUnit = (subs: number | undefined): number =>
  typeof subs === 'number' && isInteger(subs) && subs >= 1 && subs <= 1000
    ? subs
    : 30

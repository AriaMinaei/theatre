import type Project from '@theatre/core/projects/Project'
import type Sheet from '@theatre/core/sheets/Sheet'
import {encodePathToProp} from '@theatre/shared/utils/addresses'
import type {SequenceAddress} from '@theatre/shared/utils/addresses'
import didYouMean from '@theatre/shared/utils/didYouMean'
import {InvalidArgumentError} from '@theatre/shared/utils/errors'
import type {
  Prism,
  Pointer,
  Ticker,
  PointerToPrismProvider,
} from '@theatre/dataverse'
import {getPointerParts} from '@theatre/dataverse'
import {Atom} from '@theatre/dataverse'
import {pointer} from '@theatre/dataverse'
import {prism, val} from '@theatre/dataverse'
import {padStart} from 'lodash-es'
import type {
  IPlaybackController,
  IPlaybackState,
} from './playbackControllers/DefaultPlaybackController'
import DefaultPlaybackController from './playbackControllers/DefaultPlaybackController'
import TheatreSequence from './TheatreSequence'
import type {Keyframe} from '@theatre/core/projects/store/types/SheetState_Historic'
import type {ILogger} from '@theatre/shared/logger'
import type {ISequence} from '..'
import {notify} from '@theatre/shared/notify'
import type {$IntentionalAny} from '@theatre/dataverse/src/types'
import {isSheetObject} from '@theatre/shared/instanceTypes'

export type IPlaybackRange = [from: number, to: number]

export type IPlaybackDirection =
  | 'normal'
  | 'reverse'
  | 'alternate'
  | 'alternateReverse'

const possibleDirections = [
  'normal',
  'reverse',
  'alternate',
  'alternateReverse',
]

export default class Sequence implements PointerToPrismProvider {
  get type(): 'Theatre_Sequence' {
    return 'Theatre_Sequence'
  }
  public readonly address: SequenceAddress
  publicApi: TheatreSequence

  private _playbackControllerBox: Atom<IPlaybackController>
  private _prismOfStatePointer: Prism<Pointer<IPlaybackState>>
  private _positionD: Prism<number>
  private _positionFormatterD: Prism<ISequencePositionFormatter>
  _playableRangeD: undefined | Prism<{start: number; end: number}>

  readonly pointer: ISequence['pointer'] = pointer({root: this, path: []})
  readonly $$isPointerToPrismProvider = true
  readonly _logger: ILogger

  constructor(
    readonly _project: Project,
    readonly _sheet: Sheet,
    readonly _lengthD: Prism<number>,
    readonly _subUnitsPerUnitD: Prism<number>,
    playbackController?: IPlaybackController,
  ) {
    this._logger = _project._logger
      .named('Sheet', _sheet.address.sheetId)
      .named('Instance', _sheet.address.sheetInstanceId)

    this.address = {...this._sheet.address, sequenceName: 'default'}

    this.publicApi = new TheatreSequence(this)

    this._playbackControllerBox = new Atom(
      playbackController ?? new DefaultPlaybackController(),
    )

    this._prismOfStatePointer = prism(
      () => this._playbackControllerBox.prism.getValue().statePointer,
    )

    this._positionD = prism(() => {
      const statePointer = this._prismOfStatePointer.getValue()
      return val(statePointer.position)
    })

    this._positionFormatterD = prism(() => {
      const subUnitsPerUnit = val(this._subUnitsPerUnitD)
      return new TimeBasedPositionFormatter(subUnitsPerUnit)
    })
  }

  pointerToPrism<V>(pointer: Pointer<V>): Prism<V> {
    const {path} = getPointerParts(pointer)
    if (path.length === 0) {
      return prism((): ISequence['pointer']['$$__pointer_type'] => ({
        length: val(this.pointer.length),
        playing: val(this.pointer.playing),
        position: val(this.pointer.position),
        subUnitsPerUnit: val(this.pointer.subUnitsPerUnit),
      })) as $IntentionalAny as Prism<V>
    }
    if (path.length > 1) {
      return prism(() => undefined) as $IntentionalAny as Prism<V>
    }
    const [prop] = path
    if (prop === 'length') {
      return this._lengthD as $IntentionalAny as Prism<V>
    } else if (prop === 'subUnitsPerUnit') {
      return this._subUnitsPerUnitD as $IntentionalAny as Prism<V>
    } else if (prop === 'position') {
      return this._positionD as $IntentionalAny as Prism<V>
    } else if (prop === 'playing') {
      return prism(() => {
        return val(this._prismOfStatePointer.getValue().playing)
      }) as $IntentionalAny as Prism<V>
    } else {
      return prism(() => undefined) as $IntentionalAny as Prism<V>
    }
  }

  /**
   * Takes a pointer to a property of a SheetObject and returns the keyframes of that property.
   *
   * Theoretically, this method can be called from inside a prism so it can be reactive.
   */
  getKeyframesOfSimpleProp<V>(prop: Pointer<any>): Keyframe[] {
    const {path, root} = getPointerParts(prop)

    if (!isSheetObject(root)) {
      throw new InvalidArgumentError(
        'Argument prop must be a pointer to a SheetObject property',
      )
    }

    const trackP = val(
      this._project.pointers.historic.sheetsById[this._sheet.address.sheetId]
        .sequence.tracksByObject[root.address.objectKey],
    )

    if (!trackP) {
      return []
    }

    const {trackData, trackIdByPropPath} = trackP
    const objectAddress = encodePathToProp(path)
    const id = trackIdByPropPath[objectAddress]

    if (!id) {
      return []
    }

    const track = trackData[id]

    if (!track) {
      return []
    }

    return track.keyframes
  }

  get positionFormatter(): ISequencePositionFormatter {
    return this._positionFormatterD.getValue()
  }

  get prismOfStatePointer() {
    return this._prismOfStatePointer
  }

  get length() {
    return this._lengthD.getValue()
  }

  get positionPrism() {
    return this._positionD
  }

  get position() {
    return this._playbackControllerBox.get().getCurrentPosition()
  }

  get subUnitsPerUnit(): number {
    return this._subUnitsPerUnitD.getValue()
  }

  get positionSnappedToGrid(): number {
    return this.closestGridPosition(this.position)
  }

  closestGridPosition = (posInUnitSpace: number): number => {
    const subUnitsPerUnit = this.subUnitsPerUnit
    const gridLength = 1 / subUnitsPerUnit

    return parseFloat(
      (Math.round(posInUnitSpace / gridLength) * gridLength).toFixed(3),
    )
  }

  set position(requestedPosition: number) {
    let position = requestedPosition
    this.pause()
    if (process.env.NODE_ENV !== 'production') {
      if (typeof position !== 'number') {
        console.error(
          `value t in sequence.position = t must be a number. ${typeof position} given`,
        )
        position = 0
      }
      if (position < 0) {
        console.error(
          `sequence.position must be a positive number. ${position} given`,
        )
        position = 0
      }
    }
    if (position > this.length) {
      position = this.length
    }
    const dur = this.length
    this._playbackControllerBox
      .get()
      .gotoPosition(position > dur ? dur : position)
  }

  getDurationCold() {
    return this._lengthD.getValue()
  }

  get playing() {
    return val(this._playbackControllerBox.get().statePointer.playing)
  }

  _makeRangeFromSequenceTemplate(): Prism<IPlaybackRange> {
    return prism(() => {
      return [0, val(this._lengthD)]
    })
  }

  /**
   * Controls the playback within a range. Repeats infinitely unless stopped.
   *
   * @remarks
   *   One use case for this is to play the playback within the focus range.
   *
   * @param rangeD - The prism that contains the range that will be used for the playback
   *
   * @returns  a promise that gets rejected if the playback stopped for whatever reason
   *
   */
  playDynamicRange(
    rangeD: Prism<IPlaybackRange>,
    ticker: Ticker,
  ): Promise<unknown> {
    return this._playbackControllerBox.get().playDynamicRange(rangeD, ticker)
  }

  async play(
    conf: Partial<{
      iterationCount: number
      range: IPlaybackRange
      rate: number
      direction: IPlaybackDirection
    }>,
    ticker: Ticker,
  ): Promise<boolean> {
    const sequenceDuration = this.length
    const range: IPlaybackRange =
      conf && conf.range ? conf.range : [0, sequenceDuration]

    if (process.env.NODE_ENV !== 'production') {
      if (typeof range[0] !== 'number' || range[0] < 0) {
        throw new InvalidArgumentError(
          `Argument conf.range[0] in sequence.play(conf) must be a positive number. ${JSON.stringify(
            range[0],
          )} given.`,
        )
      }
      if (range[0] >= sequenceDuration) {
        throw new InvalidArgumentError(
          `Argument conf.range[0] in sequence.play(conf) cannot be longer than the duration of the sequence, which is ${sequenceDuration}s. ${JSON.stringify(
            range[0],
          )} given.`,
        )
      }
      if (typeof range[1] !== 'number' || range[1] <= 0) {
        throw new InvalidArgumentError(
          `Argument conf.range[1] in sequence.play(conf) must be a number larger than zero. ${JSON.stringify(
            range[1],
          )} given.`,
        )
      }

      if (range[1] > sequenceDuration) {
        notify.warning(
          "Couldn't play sequence in given range",
          `Your animation will still play until the end of the sequence, however the argument \`conf.range[1]\` given in \`sequence.play(conf)\` (${JSON.stringify(
            range[1],
          )}s) is longer than the duration of the sequence (${sequenceDuration}s).

To fix this, either set \`conf.range[1]\` to be less the duration of the sequence, or adjust the sequence duration in the UI.`,
          [
            {
              url: 'https://www.theatrejs.com/docs/latest/manual/sequences',
              title: 'Sequences',
            },
            {
              url: 'https://www.theatrejs.com/docs/latest/manual/sequences',
              title: 'Playback API',
            },
          ],
        )
        range[1] = sequenceDuration
      }

      if (range[1] <= range[0]) {
        throw new InvalidArgumentError(
          `Argument conf.range[1] in sequence.play(conf) must be larger than conf.range[0]. ${JSON.stringify(
            range,
          )} given.`,
        )
      }
    }

    const iterationCount =
      conf && typeof conf.iterationCount === 'number' ? conf.iterationCount : 1
    if (process.env.NODE_ENV !== 'production') {
      if (
        !(Number.isInteger(iterationCount) && iterationCount > 0) &&
        iterationCount !== Infinity
      ) {
        throw new InvalidArgumentError(
          `Argument conf.iterationCount in sequence.play(conf) must be an integer larger than 0. ${JSON.stringify(
            iterationCount,
          )} given.`,
        )
      }
    }

    const rate = conf && typeof conf.rate !== 'undefined' ? conf.rate : 1

    if (process.env.NODE_ENV !== 'production') {
      if (typeof rate !== 'number' || rate === 0) {
        throw new InvalidArgumentError(
          `Argument conf.rate in sequence.play(conf) must be a number larger than 0. ${JSON.stringify(
            rate,
          )} given.`,
        )
      }

      if (rate < 0) {
        throw new InvalidArgumentError(
          `Argument conf.rate in sequence.play(conf) must be a number larger than 0. ${JSON.stringify(
            rate,
          )} given. If you want the animation to play backwards, try setting conf.direction to 'reverse' or 'alternateReverse'.`,
        )
      }
    }

    const direction = conf && conf.direction ? conf.direction : 'normal'

    if (process.env.NODE_ENV !== 'production') {
      if (possibleDirections.indexOf(direction) === -1) {
        throw new InvalidArgumentError(
          `Argument conf.direction in sequence.play(conf) must be one of ${JSON.stringify(
            possibleDirections,
          )}. ${JSON.stringify(direction)} given. ${didYouMean(
            direction,
            possibleDirections,
          )}`,
        )
      }
    }

    return await this._play(
      iterationCount,
      [range[0], range[1]],
      rate,
      direction,
      ticker,
    )
  }

  protected _play(
    iterationCount: number,
    range: IPlaybackRange,
    rate: number,
    direction: IPlaybackDirection,
    ticker: Ticker,
  ): Promise<boolean> {
    return this._playbackControllerBox
      .get()
      .play(iterationCount, range, rate, direction, ticker)
  }

  pause() {
    this._playbackControllerBox.get().pause()
  }

  replacePlaybackController(playbackController: IPlaybackController) {
    this.pause()
    const oldController = this._playbackControllerBox.get()
    this._playbackControllerBox.set(playbackController)

    const time = oldController.getCurrentPosition()
    oldController.destroy()
    playbackController.gotoPosition(time)
  }
}

export interface ISequencePositionFormatter {
  formatSubUnitForGrid(posInUnitSpace: number): string
  formatFullUnitForGrid(posInUnitSpace: number): string
  formatForPlayhead(posInUnitSpace: number): string
  formatBasic(posInUnitSpace: number): string
}

class TimeBasedPositionFormatter implements ISequencePositionFormatter {
  constructor(private readonly _fps: number) {}
  formatSubUnitForGrid(posInUnitSpace: number): string {
    const subSecondPos = posInUnitSpace % 1
    const frame = 1 / this._fps

    const frames = Math.round(subSecondPos / frame)
    return frames + 'f'
  }

  formatFullUnitForGrid(posInUnitSpace: number): string {
    let p = posInUnitSpace

    let s = ''

    if (p >= hour) {
      const hours = Math.floor(p / hour)
      s += hours + 'h'
      p = p % hour
    }

    if (p >= minute) {
      const minutes = Math.floor(p / minute)
      s += minutes + 'm'
      p = p % minute
    }

    if (p >= second) {
      const seconds = Math.floor(p / second)
      s += seconds + 's'
      p = p % second
    }

    const frame = 1 / this._fps

    if (p >= frame) {
      const frames = Math.floor(p / frame)
      s += frames + 'f'
      p = p % frame
    }

    return s.length === 0 ? '0s' : s
  }

  formatForPlayhead(posInUnitSpace: number): string {
    let p = posInUnitSpace

    let s = ''

    if (p >= hour) {
      const hours = Math.floor(p / hour)
      s += padStart(hours.toString(), 2, '0') + 'h'
      p = p % hour
    }

    if (p >= minute) {
      const minutes = Math.floor(p / minute)
      s += padStart(minutes.toString(), 2, '0') + 'm'
      p = p % minute
    } else if (s.length > 0) {
      s += '00m'
    }

    if (p >= second) {
      const seconds = Math.floor(p / second)
      s += padStart(seconds.toString(), 2, '0') + 's'
      p = p % second
    } else {
      s += '00s'
    }

    const frameLength = 1 / this._fps

    if (p >= frameLength) {
      const frames = Math.round(p / frameLength)
      s += padStart(frames.toString(), 2, '0') + 'f'
      p = p % frameLength
    } else if (p / frameLength > 0.98) {
      const frames = 1
      s += padStart(frames.toString(), 2, '0') + 'f'
      p = p % frameLength
    } else {
      s += '00f'
    }

    return s.length === 0 ? '00s00f' : s
  }

  formatBasic(posInUnitSpace: number): string {
    return posInUnitSpace.toFixed(2) + 's'
  }
}

const second = 1
const minute = second * 60
const hour = minute * 60

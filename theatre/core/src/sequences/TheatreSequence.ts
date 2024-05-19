import {privateAPI, setPrivateAPI} from '@theatre/core/privateAPIs'
import {defer} from '@theatre/shared/utils/defer'
import type Sequence from './Sequence'
import type {IPlaybackDirection, IPlaybackRange} from './Sequence'
import type {Keyframe} from '@theatre/core/projects/store/types/SheetState_Historic'
import AudioPlaybackController from './playbackControllers/AudioPlaybackController'
import {getCoreTicker} from '@theatre/core/coreTicker'
import type {Pointer} from '@theatre/dataverse'
import {notify} from '@theatre/shared/notify'
import type {IRafDriver} from '@theatre/core/rafDrivers'

interface IAttachAudioArgs {
  /**
   * Either a URL to the audio file (eg "http://localhost:3000/audio.mp3") or an instance of AudioBuffer
   */
  source: string | AudioBuffer
  /**
   * An optional AudioContext. If not provided, one will be created.
   */
  audioContext?: AudioContext
  /**
   * An AudioNode to feed the audio into. Will use audioContext.destination if not provided.
   */
  destinationNode?: AudioNode
}

export interface ISequence {
  readonly type: 'Theatre_Sequence_PublicAPI'

  /**
   * Starts playback of a sequence.
   * Returns a promise that either resolves to true when the playback completes,
   * or resolves to false if playback gets interrupted (for example by calling sequence.pause())
   *
   * @returns A promise that resolves when the playback is finished, or rejects if interruped
   *
   * @example
   * Usage:
   * ```ts
   * // plays the sequence from the current position to sequence.length
   * sheet.sequence.play()
   *
   * // plays the sequence at 2.4x speed
   * sheet.sequence.play({rate: 2.4})
   *
   * // plays the sequence from second 1 to 4
   * sheet.sequence.play({range: [1, 4]})
   *
   * // plays the sequence 4 times
   * sheet.sequence.play({iterationCount: 4})
   *
   * // plays the sequence in reverse
   * sheet.sequence.play({direction: 'reverse'})
   *
   * // plays the sequence back and forth forever (until interrupted)
   * sheet.sequence.play({iterationCount: Infinity, direction: 'alternateReverse})
   *
   * // plays the sequence and logs "done" once playback is finished
   * sheet.sequence.play().then(() => console.log('done'))
   * ```
   */
  play(conf?: {
    /**
     * The number of times the animation must run. Must be an integer larger
     * than 0. Defaults to 1. Pick Infinity to run forever
     */
    iterationCount?: number
    /**
     * Limits the range to be played. Default is [0, sequence.length]
     */
    range?: IPlaybackRange
    /**
     * The playback rate. Defaults to 1. Choosing 2 would play the animation
     * at twice the speed.
     */
    rate?: number
    /**
     * The direction of the playback. Similar to CSS's animation-direction
     */
    direction?: IPlaybackDirection

    /**
     * Optionally provide a rafDriver to use for the playback. It'll default to
     * the core driver if not provided, which is a `requestAnimationFrame()` driver.
     * Learn how to use `rafDriver`s [from the docs](https://www.theatrejs.com/docs/latest/manual/advanced#rafdrivers).
     */
    rafDriver?: IRafDriver
  }): Promise<boolean>

  /**
   * Pauses the currently playing animation
   */
  pause(): void

  /**
   * The current position of the playhead.
   * In a time-based sequence, this represents the current time in seconds.
   */
  position: number

  /**
   * A Pointer to the sequence's inner state.
   *
   * @remarks
   * As with any Pointer, you can use this with {@link onChange | onChange()} to listen to its value changes
   * or with {@link val | val()} to read its current value.
   *
   * @example Usage
   * ```ts
   * import {onChange, val} from '@theatre/core'
   *
   * // let's assume `sheet` is a sheet
   * const sequence = sheet.sequence
   *
   * onChange(sequence.pointer.length, (len) => {
   *   console.log("Length of the sequence changed to:", len)
   * })
   *
   * onChange(sequence.pointer.position, (position) => {
   *   console.log("Position of the sequence changed to:", position)
   * })
   *
   * onChange(sequence.pointer.playing, (playing) => {
   *   console.log(playing ? 'playing' : 'paused')
   * })
   *
   * // we can also read the current value of the pointer
   * console.log('current length is', val(sequence.pointer.length))
   * ```
   */
  pointer: Pointer<{
    playing: boolean
    length: number
    position: number
    subUnitsPerUnit: number
  }>

  /**
   * Given a property, returns a list of keyframes that affect that property.
   *
   * @example
   * Usage:
   * ```ts
   * // let's assume `sheet` is a sheet and obj is one of its objects
   * const keyframes = sheet.sequence.__experimental_getKeyframes(obj.pointer.x)
   * console.log(keyframes) // an array of keyframes
   * ```
   */
  __experimental_getKeyframes(prop: Pointer<{}>): Keyframe[]

  /**
   * Attaches an audio source to the sequence. Playing the sequence automatically
   * plays the audio source and their times are kept in sync.
   *
   * @returns A promise that resolves once the audio source is loaded and decoded
   *
   * Learn more [here](https://www.theatrejs.com/docs/latest/manual/audio).
   *
   * @example
   * Usage:
   * ```ts
   * // Loads and decodes audio from the URL and then attaches it to the sequence
   * await sheet.sequence.attachAudio({source: "http://localhost:3000/audio.mp3"})
   * sheet.sequence.play()
   *
   * // Providing your own AudioAPI Context, destination, etc
   * const audioContext: AudioContext = {...} // create an AudioContext using the Audio API
   * const audioBuffer: AudioBuffer = {...} // create an AudioBuffer
   * const destinationNode = audioContext.destination
   *
   * await sheet.sequence.attachAudio({source: audioBuffer, audioContext, destinationNode})
   * ```
   *
   * Note: It's better to provide the `audioContext` rather than allow Theatre.js to create it.
   * That's because some browsers [suspend the audioContext](https://developer.chrome.com/blog/autoplay/#webaudio)
   * unless it's initiated by a user gesture, like a click. If that happens, Theatre.js will
   * wait for a user gesture to resume the audioContext. But that's probably not an
   * optimal user experience. It is better to provide a button or some other UI element
   * to communicate to the user that they have to initiate the animation.
   *
   * @example
   * Example:
   * ```ts
   * // html: <button id="#start">start</button>
   * const button = document.getElementById('start')
   *
   * button.addEventListener('click', async () => {
   *   const audioContext = ...
   *   await sheet.sequence.attachAudio({audioContext, source: '...'})
   *   sheet.sequence.play()
   * })
   * ```
   */
  attachAudio(args: IAttachAudioArgs): Promise<{
    /**
     * An {@link https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer | AudioBuffer}.
     * If `args.source` is a URL, then `decodedBuffer` would be the result
     * of {@link https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData | audioContext.decodeAudioData()}
     * on the audio file at that URL.
     *
     * If `args.source` is an `AudioBuffer`, then `decodedBuffer` would be equal to `args.source`
     */
    decodedBuffer: AudioBuffer
    /**
     * The `AudioContext`. It is either equal to `source.audioContext` if it is provided, or
     * one that's created on the fly.
     */
    audioContext: AudioContext
    /**
     * Equals to either `args.destinationNode`, or if none is provided, it equals `audioContext.destinationNode`.
     *
     * See `gainNode` for more info.
     */
    destinationNode: AudioNode

    /**
     * This is an intermediate GainNode that Theatre.js feeds its audio to. It is by default
     * connected to destinationNode, but you can disconnect the gainNode and feed it to your own graph.
     *
     * @example
     * For example:
     * ```ts
     * const {gainNode, audioContext} = await sequence.attachAudio({source: '/audio.mp3'})
     * // disconnect the gainNode (at this point, the sequence's audio track won't be audible)
     * gainNode.disconnect()
     * // create our own gain node
     * const lowerGain = audioContext.createGain()
     * // lower its volume to 10%
     * lowerGain.gain.setValueAtTime(0.1, audioContext.currentTime)
     * // feed the sequence's audio to our lowered gainNode
     * gainNode.connect(lowerGain)
     * // feed the lowered gainNode to the audioContext's destination
     * lowerGain.connect(audioContext.destination)
     * // now audio will be audible, with 10% the volume
     * ```
     */
    gainNode: GainNode
  }>
}

export default class TheatreSequence implements ISequence {
  get type(): 'Theatre_Sequence_PublicAPI' {
    return 'Theatre_Sequence_PublicAPI'
  }

  /**
   * @internal
   */
  constructor(sheet: Sequence) {
    setPrivateAPI(this, sheet)
  }

  play(
    conf?: Partial<{
      iterationCount: number
      range: IPlaybackRange
      rate: number
      direction: IPlaybackDirection
      rafDriver: IRafDriver
    }>,
  ): Promise<boolean> {
    const priv = privateAPI(this)
    if (priv._project.isReady()) {
      const ticker = conf?.rafDriver
        ? privateAPI(conf.rafDriver).ticker
        : getCoreTicker()
      return priv.play(conf ?? {}, ticker)
    } else {
      if (process.env.NODE_ENV !== 'production') {
        notify.warning(
          "Sequence can't be played",
          'You seem to have called `sequence.play()` before the project has finished loading.\n\n' +
            'This would **not** a problem in production when using `@theatre/core`, since Theatre.js loads instantly in core mode. ' +
            "However, when using `@theatre/studio`, it takes a few milliseconds for it to load your project's state, " +
            `before which your sequences cannot start playing.\n` +
            `\n` +
            'To fix this, simply defer calling `sequence.play()` until after the project is loaded, like this:\n\n' +
            '```\n' +
            `project.ready.then(() => {\n` +
            `  sequence.play()\n` +
            `})\n` +
            '```',
          [
            {
              url: 'https://www.theatrejs.com/docs/0.5/api/core#project.ready',
              title: 'Project.ready',
            },
          ],
        )
      }
      const d = defer<boolean>()
      d.resolve(true)
      return d.promise
    }
  }

  pause() {
    privateAPI(this).pause()
  }

  get position() {
    return privateAPI(this).position
  }

  set position(position: number) {
    privateAPI(this).position = position
  }

  __experimental_getKeyframes(prop: Pointer<any>): Keyframe[] {
    return privateAPI(this).getKeyframesOfSimpleProp(prop)
  }

  async attachAudio(args: IAttachAudioArgs): Promise<{
    decodedBuffer: AudioBuffer
    audioContext: AudioContext
    destinationNode: AudioNode
    gainNode: GainNode
  }> {
    const {audioContext, destinationNode, decodedBuffer, gainNode} =
      await resolveAudioBuffer(args)

    const playbackController = new AudioPlaybackController(
      decodedBuffer,
      audioContext,
      gainNode,
    )

    privateAPI(this).replacePlaybackController(playbackController)

    return {audioContext, destinationNode, decodedBuffer, gainNode}
  }

  get pointer(): ISequence['pointer'] {
    return privateAPI(this).pointer
  }
}

async function resolveAudioBuffer(args: IAttachAudioArgs): Promise<{
  decodedBuffer: AudioBuffer
  audioContext: AudioContext
  destinationNode: AudioNode
  gainNode: GainNode
}> {
  function getAudioContext(): Promise<AudioContext> {
    if (args.audioContext) return Promise.resolve(args.audioContext)
    const ctx = new AudioContext()
    if (ctx.state === 'running') return Promise.resolve(ctx)

    // AudioContext is suspended, probably because the browser
    // has blocked it since it is not initiated by a user gesture

    // if in SSR, just resolve the promise, as there is not much more to be done
    if (typeof window === 'undefined') {
      return Promise.resolve(ctx)
    }
    return new Promise<AudioContext>((resolve) => {
      const listener = () => {
        ctx.resume().catch((err) => {
          console.error(err)
        })
      }

      const eventsToHookInto: Array<keyof WindowEventMap> = [
        'mousedown',
        'keydown',
        'touchstart',
      ]

      const eventListenerOpts = {capture: true, passive: false}
      eventsToHookInto.forEach((eventName) => {
        window.addEventListener(eventName, listener, eventListenerOpts)
      })

      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running') {
          eventsToHookInto.forEach((eventName) => {
            window.removeEventListener(eventName, listener, eventListenerOpts)
          })
          resolve(ctx)
        }
      })
    })
  }

  async function getAudioBuffer(): Promise<AudioBuffer> {
    if (args.source instanceof AudioBuffer) {
      return args.source
    }

    const decodedBufferDeferred = defer<AudioBuffer>()
    if (typeof args.source !== 'string') {
      throw new Error(
        `Error validating arguments to sequence.attachAudio(). ` +
          `args.source must either be a string or an instance of AudioBuffer.`,
      )
    }

    let fetchResponse
    try {
      fetchResponse = await fetch(args.source)
    } catch (e) {
      console.error(e)
      throw new Error(
        `Could not fetch '${args.source}'. Network error logged above.`,
      )
    }

    let arrayBuffer
    try {
      arrayBuffer = await fetchResponse.arrayBuffer()
    } catch (e) {
      console.error(e)
      throw new Error(`Could not read '${args.source}' as an arrayBuffer.`)
    }

    const audioContext = await audioContextPromise

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    audioContext.decodeAudioData(
      arrayBuffer,
      decodedBufferDeferred.resolve,
      decodedBufferDeferred.reject,
    )

    let decodedBuffer
    try {
      decodedBuffer = await decodedBufferDeferred.promise
    } catch (e) {
      console.error(e)
      throw new Error(`Could not decode ${args.source} as an audio file.`)
    }

    return decodedBuffer
  }

  const audioContextPromise = getAudioContext()
  const audioBufferPromise = getAudioBuffer()

  const [audioContext, decodedBuffer] = await Promise.all([
    audioContextPromise,
    audioBufferPromise,
  ])

  const destinationNode = args.destinationNode || audioContext.destination
  const gainNode = audioContext.createGain()
  gainNode.connect(destinationNode)

  return {
    audioContext,
    decodedBuffer,
    gainNode,
    destinationNode,
  }
}

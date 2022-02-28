import {Ticker} from '@theatre/dataverse'

const studioTicker = new Ticker()

export default studioTicker

let defaultTickerEnabled = true

export function enableDefaultTicker() {
  if (!defaultTickerEnabled) {
    defaultTickerEnabled = true
    window.requestAnimationFrame(onAnimationFrame)
  }
}

export function disableDefaultTicker() {
  defaultTickerEnabled = false
}

const onAnimationFrame = (t: number) => {
  studioTicker.tick(t)
  if (defaultTickerEnabled) window.requestAnimationFrame(onAnimationFrame)
}
if (defaultTickerEnabled) window.requestAnimationFrame(onAnimationFrame)

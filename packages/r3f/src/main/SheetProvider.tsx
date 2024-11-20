import type {ReactNode} from 'react'
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
} from 'react'
import {useThree} from '@react-three/fiber'
import type {ISheet} from '@theatre/core'
import {bindToCanvas} from './store'

export type R3FSheetConfig = {
  namespacePrefix?: string; 
}

export type R3FSheetContext = {
  sheet: ISheet,
  config?: R3FSheetConfig
}

const ctx = createContext<R3FSheetContext>(undefined!)

const useWrapperContext = (): R3FSheetContext => {
  const val = useContext(ctx)
  if (!val || !val.sheet) {
    throw new Error(
      `No sheet found. You need to add a <SheetProvider> higher up in the tree. https://docs.theatrejs.com/r3f.html#sheetprovider`,
    )
  }
  return val
}

export const useCurrentSheet = (): ISheet | undefined => {
  return useWrapperContext().sheet
}

export const useCurrentR3FSheetConfig = (): R3FSheetConfig | undefined => {
  return useWrapperContext().config
}



const SheetProvider: React.FC<{
  sheet: ISheet
  children: ReactNode
  config?: R3FSheetConfig
}> = ({sheet, children, config}) => {
  const {scene, gl} = useThree((s) => ({scene: s.scene, gl: s.gl}))

  useEffect(() => {
    if (!sheet || sheet.type !== 'Theatre_Sheet_PublicAPI') {
      throw new Error(`sheet in <Wrapper sheet={sheet}> has an invalid value`)
    }
  }, [sheet])

  useLayoutEffect(() => {
    bindToCanvas({gl, scene})
  }, [scene, gl])

  return <ctx.Provider value={{sheet, config}}>{children}</ctx.Provider>
}

export default SheetProvider

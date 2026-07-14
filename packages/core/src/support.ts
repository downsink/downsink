import type {PickerWindow} from './types.ts'

export interface DownsinkSupport {
  /** OPFS streaming write is available: the core path works. */
  opfs: boolean
  /** showSaveFilePicker is available (Chromium): the opt-in direct-save path works. */
  picker: boolean
}

export function support(): DownsinkSupport {
  const hasNavigator = typeof navigator !== 'undefined'
  return {
    opfs: hasNavigator && typeof navigator.storage?.getDirectory === 'function',
    picker: typeof (globalThis as PickerWindow).showSaveFilePicker === 'function',
  }
}

export function isSupported(): boolean {
  const s = support()
  return s.opfs || s.picker
}

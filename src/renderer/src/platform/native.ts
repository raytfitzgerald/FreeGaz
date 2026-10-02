// The iPhone app (Capacitor): what it can do that a browser can't, behind
// small helpers the web shim calls. Everything is loaded on first use, so the
// Mac app and the web app never pull the native plugins in.
import { Capacitor } from '@capacitor/core'

/** True inside the App Store build (a native iOS shell around the web app). */
export const isNative = (): boolean => Capacitor.isNativePlatform()

const toBase64 = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Saves into the app's Documents folder, which the Files app shows under
 * "On My iPhone → FreeGaz". With `share`, the share sheet opens too, so the
 * file can go to AirDrop, Files, Mail or Strava's own app.
 */
export async function saveFile(folder: string, fileName: string, bytes: Uint8Array, share = false): Promise<string> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  const path = `FreeGaz/${folder ? `${folder}/` : ''}${fileName}`
  const { uri } = await Filesystem.writeFile({ path, data: toBase64(bytes), directory: Directory.Documents, recursive: true })
  if (share) {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: fileName, files: [uri] }).catch(() => undefined)
  }
  return path
}

/** Opens a link in an in-app Safari sheet (Strava, GitHub, Garmin…). */
export async function openUrl(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url })
}

/** Keeps the screen on during a ride. */
export async function keepAwake(on: boolean): Promise<void> {
  const { KeepAwake } = await import('@capacitor-community/keep-awake')
  await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep())
}

// The iPhone app: a native iOS shell (Capacitor) around the web build, with
// CoreBluetooth for the trainer. `npm run ios:sync` rebuilds the web app into
// out/ios-web and copies it into ios/; open ios/App in Xcode to run or archive.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.raytfitzgerald.freegaz',
  appName: 'FreeGaz',
  webDir: 'out/ios-web',
  ios: {
    // the web app draws its own safe-area padding (viewport-fit=cover)
    contentInset: 'never',
    backgroundColor: '#111d36',
    scheme: 'FreeGaz',
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Looking for trainers and sensors…',
        cancel: 'Cancel',
        availableDevices: 'Nearby devices',
        noDeviceFound: 'Nothing found. Wake the trainer (turn the cranks) and try again.',
      },
    },
  },
}

export default config

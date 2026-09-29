import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Encrypts/decrypts strings. In the app this is Electron's safeStorage (macOS Keychain). */
export interface Cipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(cipher: Buffer): string
}

/**
 * API keys and OAuth tokens. Stored encrypted (Keychain-derived key) in a
 * 0600 file in userData; never sent to the renderer. Values are plain strings;
 * callers JSON-encode structured secrets.
 */
export class SecretStore {
  private cache: Record<string, string> | null = null

  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {}

  static inDir(dir: string, cipher: Cipher): SecretStore {
    return new SecretStore(join(dir, 'secrets.bin'), cipher)
  }

  get(name: string): string | null {
    return this.load()[name] ?? null
  }

  getJson<T>(name: string): T | null {
    const v = this.get(name)
    if (v === null) return null
    try {
      return JSON.parse(v) as T
    } catch {
      return null
    }
  }

  set(name: string, value: string): void {
    const all = { ...this.load(), [name]: value }
    this.save(all)
  }

  setJson(name: string, value: unknown): void {
    this.set(name, JSON.stringify(value))
  }

  delete(name: string): void {
    const all = { ...this.load() }
    delete all[name]
    this.save(all)
  }

  has(name: string): boolean {
    return this.get(name) !== null
  }

  private load(): Record<string, string> {
    if (this.cache) return this.cache
    try {
      const raw = readFileSync(this.file)
      this.cache = JSON.parse(this.cipher.decrypt(raw)) as Record<string, string>
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  private save(all: Record<string, string>): void {
    if (!this.cipher.isAvailable()) throw new Error('Secure storage is unavailable on this system')
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, this.cipher.encrypt(JSON.stringify(all)), { mode: 0o600 })
    renameSync(tmp, this.file)
    chmodSync(this.file, 0o600)
    this.cache = all
  }
}

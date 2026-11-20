import { existsSync } from 'fs'
import { stripVTControlCharacters } from 'util'

export const positionedErrorPattern =
  /^(.+)\((\d+),(\d+)\): error (\w+): (.+)$/s

export const findPositionlessDiagnostics = (output: string): string[] => {
  const diagnostics: string[] = []
  let inDiagnostic = false

  for (const rawLine of output.split(/\r?\n/)) {
    const line = stripVTControlCharacters(rawLine)
    if (/^error TS\d+: /.test(line)) {
      // A filename can start with the same prefix. Prefer the positioned form
      // when the apparent file exists, otherwise report the compiler error.
      const positioned = line.match(positionedErrorPattern)
      inDiagnostic = !positioned || !existsSync(positioned[1])
    } else if (!/^[ \t]+\S/.test(line)) {
      inDiagnostic = false
    }

    if (inDiagnostic) {
      diagnostics.push(line)
    }
  }

  return diagnostics
}

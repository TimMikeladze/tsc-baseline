import { readFileSync, writeFileSync } from 'fs'
import objectHash from 'object-hash'

export interface ErrorInfo {
  code: string
  column: number
  file: string
  line: number
  message: string
}

export const parseTypeScriptErrors = (
  errorLog: string
): Map<string, ErrorInfo> => {
  const errorPattern = /^(.+)\((\d+),(\d+)\): error (\w+): (.+)$/

  const lines = errorLog.split('\n')
  const errors = new Map<string, ErrorInfo>()

  for (const line of lines) {
    const match = line.match(errorPattern)
    if (match) {
      const [, file, lineStr, columnStr, code, message] = match
      const error: ErrorInfo = {
        file,
        line: parseInt(lineStr),
        column: parseInt(columnStr),
        code,
        message
      }
      const key = objectHash(error)
      errors.set(key, error)
    }
  }

  return errors
}

export const writeTypeScriptErrorsToFile = (
  map: Map<string, ErrorInfo>,
  filepath: string
): void => {
  writeFileSync(filepath, JSON.stringify(Object.fromEntries(map)))
}

export const readTypeScriptErrorsFromFile = (
  filepath: string
): Map<string, ErrorInfo> => {
  const text = readFileSync(filepath, {
    encoding: 'utf-8'
  })
  const json = JSON.parse(text)

  return new Map(Object.entries(json))
}

export const getNewErrors = (
  oldErrors: Map<string, ErrorInfo>,
  newErrors: Map<string, ErrorInfo>
): Map<string, ErrorInfo> => {
  const result = new Map<string, ErrorInfo>()

  for (const [id, error] of newErrors) {
    if (!oldErrors.has(id)) {
      result.set(id, error)
    }
  }

  return result
}

export const toHumanReadableText = (
  errorMap: Map<string, ErrorInfo>
): string => {
  let log = ''

  for (const [key, error] of errorMap) {
    log += `File: ${error.file}\n`
    log += `Message: ${error.message}\n`
    log += `Code: ${error.code}\n`
    log += `Location: Line ${error.line}, Column ${error.column}\n`
    log += `Hash: ${key}\n\n`
  }

  return log.trim()
}

export const addHashToBaseline = (hash: string, filepath: string): void => {
  const oldErrors = readTypeScriptErrorsFromFile(filepath)
  const newErrors = new Map<string, ErrorInfo>()

  for (const [key, error] of oldErrors) {
    newErrors.set(key, error)
  }

  newErrors.set(hash, {
    code: '0000',
    column: 0,
    file: '0000',
    line: 0,
    message: '0000'
  })

  writeTypeScriptErrorsToFile(newErrors, filepath)
}

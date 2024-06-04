import { readFileSync, writeFileSync } from 'fs'
import objectHash from 'object-hash'

export interface ErrorInfo {
  code: string
  file: string
  message: string
  count: number
}

// Hash just the error info, not the count so that we can easily
// modify the count independently
const getErrorInfoHash = (errorInfo: ErrorInfo) => {
  const { count, ...rest } = errorInfo
  return objectHash(rest)
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
      let error: ErrorInfo = {
        file,
        code,
        message,
        count: 1
      }
      const key = getErrorInfoHash(error)

      const existingError = errors.get(key)
      if (existingError) {
        error = { ...existingError }
        error.count += 1
      }
      errors.set(key, error)
    }
  }

  return errors
}

export const writeTypeScriptErrorsToFile = (
  map: Map<string, ErrorInfo>,
  filepath: string
): void => {
  writeFileSync(filepath, JSON.stringify(Object.fromEntries(map), null, 2))
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
    } else {
      const oldErrCount = oldErrors.get(id)?.count ?? 0
      const newErrCount = newErrors.get(id)?.count ?? 0
      if (oldErrCount < newErrCount) {
        const newErrors = { ...error, count: newErrCount - oldErrCount }
        result.set(id, newErrors)
      }
    }
  }

  return result
}

export const getTotalErrorsCount = (errorMap: Map<string, ErrorInfo>): number =>
  [...errorMap.values()].reduce((sum, info) => sum + info.count, 0)

export const toHumanReadableText = (
  errorMap: Map<string, ErrorInfo>
): string => {
  let log = ''

  for (const [key, error] of errorMap) {
    log += `File: ${error.file}\n`
    log += `Message: ${error.message}\n`
    log += `Code: ${error.code}\n`
    log += `Count of new errors: ${error.count}\n`
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
    file: '0000',
    message: '0000',
    count: 1
  })

  writeTypeScriptErrorsToFile(newErrors, filepath)
}

import { readFileSync, writeFileSync } from 'fs'
import objectHash from 'object-hash'

export interface ErrorSummary {
  code: string
  count: number
  file: string
  message: string
}

export interface SpecificError {
  code: string
  column: number
  file: string
  line: number
  message: string
}

export type SpecificErrorsMap = Map<string, SpecificError[]>
export type ErrorSummaryMap = Map<string, ErrorSummary>

export interface ParsingResult {
  errorSummaryMap: ErrorSummaryMap
  specificErrorsMap: SpecificErrorsMap
}

// Hash just the error summary, not the count so that we can easily
// modify the count independently
const getErrorSummaryHash = (errorSummary: ErrorSummary) => {
  const { count, ...rest } = errorSummary
  return objectHash(rest)
}

export const parseTypeScriptErrors = (errorLog: string): ParsingResult => {
  const errorPattern = /^(.+)\((\d+),(\d+)\): error (\w+): (.+)$/

  const lines = errorLog.split('\n')
  const specificErrorsMap: SpecificErrorsMap = new Map<
    string,
    SpecificError[]
  >()
  const errorSummaryMap: ErrorSummaryMap = new Map<string, ErrorSummary>()

  const addSpecificErrorToMap = (
    filePathName: string,
    error: SpecificError
  ) => {
    const existingFile = specificErrorsMap.get(filePathName)
    if (existingFile) {
      existingFile.push(error)
    } else {
      specificErrorsMap.set(filePathName, [error])
    }
  }

  const addErrorToSummary = (error: SpecificError) => {
    const { file, code, message } = error
    let errorSummary: ErrorSummary = {
      file,
      code,
      message,
      count: 1
    }
    const key = getErrorSummaryHash(errorSummary)

    const existingError = errorSummaryMap.get(key)
    if (existingError) {
      errorSummary = { ...existingError }
      errorSummary.count += 1
    }
    errorSummaryMap.set(key, errorSummary)
  }

  for (const line of lines) {
    const match = line.match(errorPattern)
    if (match) {
      const [, file, lineStr, columnStr, code, message] = match
      const error: SpecificError = {
        file,
        code,
        message,
        line: parseInt(lineStr),
        column: parseInt(columnStr)
      }
      addSpecificErrorToMap(error.file, error)
      addErrorToSummary(error)
    }
  }

  return { specificErrorsMap, errorSummaryMap }
}

export const writeTypeScriptErrorsToFile = (
  map: ErrorSummaryMap,
  filepath: string
): void => {
  writeFileSync(filepath, JSON.stringify(Object.fromEntries(map), null, 2))
}

export const readTypeScriptErrorsFromFile = (
  filepath: string
): ErrorSummaryMap => {
  const text = readFileSync(filepath, {
    encoding: 'utf-8'
  })
  const json = JSON.parse(text)

  return new Map(Object.entries(json))
}

export const getNewErrors = (
  oldErrors: ErrorSummaryMap,
  newErrors: ErrorSummaryMap
): ErrorSummaryMap => {
  const result = new Map<string, ErrorSummary>()

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

export const getTotalErrorsCount = (errorMap: ErrorSummaryMap): number =>
  // NOTE: Previously, this was written with an array spread, but there was a bug
  // with microbundle that was incorrectly compiling that (see: https://github.com/TimMikeladze/tsc-baseline/issues/21).
  // Until that is resolved or the bundler is switched for this repo, this has been
  // rewritten with Array.from
  Array.from(errorMap.values()).reduce((sum, info) => sum + info.count, 0)

export const toHumanReadableText = (
  errorSummaryMap: ErrorSummaryMap,
  specificErrorMap: SpecificErrorsMap
): string => {
  let log = ''

  for (const [key, error] of errorSummaryMap) {
    const specificErrors = getSpecificErrorsMatchingSummary(
      error,
      specificErrorMap
    )

    log += `File: ${error.file}\n`
    log += `Message: ${error.message}\n`
    log += `Code: ${error.code}\n`
    log += `Hash: ${key}\n`
    log += `Count of new errors: ${error.count}\n`
    log += `${specificErrors.length} current error${
      specificErrors.length === 1 ? '' : 's'
    }:\n`

    log += specificErrors
      .map(
        (specificError) =>
          `${specificError.file}(${specificError.line},${specificError.column})`
      )
      .join('\n')

    log += '\n\n'
  }

  return log.trim()
}

export const getSpecificErrorsMatchingSummary = (
  errorSummary: ErrorSummary,
  specificErrorsMap: SpecificErrorsMap
): SpecificError[] => {
  return (
    specificErrorsMap
      .get(errorSummary.file)
      ?.filter(
        (specificError) =>
          specificError.file === errorSummary.file &&
          specificError.message === errorSummary.message &&
          specificError.code === errorSummary.code
      ) || []
  )
}

export const addHashToBaseline = (hash: string, filepath: string): void => {
  const oldErrors = readTypeScriptErrorsFromFile(filepath)
  const newErrors = new Map<string, ErrorSummary>()

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

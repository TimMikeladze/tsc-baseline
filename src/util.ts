import { readFileSync, writeFileSync } from 'fs'
import objectHash from 'object-hash'

export const CURRENT_BASELINE_VERSION = 1

export interface ErrorSummary {
  code: string
  count: number
  file: string
  line: number
  message?: string
}

export interface SpecificError {
  code: string
  column: number
  file: string
  line: number
  message: string
}

export interface OldBaselineFile {
  [hash: string]: ErrorSummary | SpecificError
}

export interface BaselineFile {
  meta: {
    baselineFileVersion: number
    ignoreMessages: boolean
  }
  // eslint-disable-next-line typescript-sort-keys/interface
  errors: {
    [hash: string]: ErrorSummary
  }
}

export type SpecificErrorsMap = Map<string, SpecificError[]>
export type ErrorSummaryMap = Map<string, ErrorSummary>
export type GitLabErrorFormat = {
  check_name: string
  description: string
  fingerprint: string
  location: {
    lines: {
      begin: number
    }
    path: string
  }
  severity: string
}

export interface ParsingResult {
  errorSummaryMap: ErrorSummaryMap
  specificErrorsMap: SpecificErrorsMap
}

type ErrorOptions = {
  ignoreMessages: boolean
}

// Hash just the error summary, not the count so that we can easily
// modify the count independently
const getErrorSummaryHash = (
  errorSummary: ErrorSummary,
  { ignoreMessages }: ErrorOptions
) => {
  const { code, file, message } = errorSummary
  if (ignoreMessages) {
    return objectHash({ code, file })
  }
  return objectHash({ code, file, message })
}

export const parseTypeScriptErrors = (
  errorLog: string,
  { ignoreMessages }: ErrorOptions
): ParsingResult => {
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
    const { file, code, message, line } = error
    let errorSummary: ErrorSummary = {
      file,
      code,
      line,
      count: 1
    }
    if (!ignoreMessages) {
      errorSummary.message = message
    }
    const key = getErrorSummaryHash(errorSummary, { ignoreMessages })

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
  filepath: string,
  errorOptions: ErrorOptions
): void => {
  const newBaselineFile: BaselineFile = {
    meta: {
      baselineFileVersion: CURRENT_BASELINE_VERSION,
      ignoreMessages: errorOptions.ignoreMessages
    },
    errors: Object.fromEntries(map)
  }
  writeFileSync(filepath, JSON.stringify(newBaselineFile, null, 2))
}

export const readBaselineErrorsFile = (
  filepath: string
): BaselineFile | OldBaselineFile => {
  const text = readFileSync(filepath, {
    encoding: 'utf-8'
  })
  return JSON.parse(text)
}

export const getBaselineFileVersion = (
  baselineFile: BaselineFile | OldBaselineFile
) => {
  if (
    typeof baselineFile?.meta === 'object' &&
    'baselineFileVersion' in baselineFile?.meta
  ) {
    return baselineFile?.meta?.baselineFileVersion
  }
  return 0
}

export const isBaselineVersionCurrent = (
  baselineFile: BaselineFile | OldBaselineFile
): baselineFile is BaselineFile => {
  return getBaselineFileVersion(baselineFile) === CURRENT_BASELINE_VERSION
}

export const getErrorSummaryMap = (baselineFile: BaselineFile) => {
  return new Map(Object.entries(baselineFile.errors))
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
  specificErrorMap: SpecificErrorsMap,
  errorOptions: ErrorOptions
): string => {
  let log = ''

  for (const [key, error] of errorSummaryMap) {
    const specificErrors = getSpecificErrorsMatchingSummary(
      error,
      specificErrorMap,
      errorOptions
    )

    log += `File: ${error.file}\n`
    if (error.message) {
      log += `Message: ${error.message}\n`
    }
    log += `Code: ${error.code}\n`
    log += `Hash: ${key}\n`
    log += `Line: ${error.line}\n`
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
  specificErrorsMap: SpecificErrorsMap,
  errorOptions: ErrorOptions
): SpecificError[] => {
  return (
    specificErrorsMap
      .get(errorSummary.file)
      ?.filter(
        (specificError) =>
          specificError.file === errorSummary.file &&
          (errorOptions.ignoreMessages
            ? true
            : specificError.message === errorSummary.message) &&
          specificError.code === errorSummary.code
      ) || []
  )
}

export const addHashToBaseline = (hash: string, filepath: string): void => {
  const baselineErrorsFile = readBaselineErrorsFile(filepath)
  if (!isBaselineVersionCurrent(baselineErrorsFile)) {
    throw new Error(
      'The .tsc-baseline.json is not current. Please make sure your packages are up to date and save a new baseline file'
    )
  }

  const oldErrors = getErrorSummaryMap(baselineErrorsFile)
  const newErrors = new Map<string, ErrorSummary>()

  for (const [key, error] of oldErrors) {
    newErrors.set(key, error)
  }

  newErrors.set(hash, {
    code: '0000',
    file: '0000',
    message: '0000',
    line: 0,
    count: 1
  })

  writeTypeScriptErrorsToFile(newErrors, filepath, {
    ignoreMessages: baselineErrorsFile.meta.ignoreMessages
  })
}

export const formatForGitLab = (
  errors: ErrorSummaryMap
): GitLabErrorFormat[] => {
  console.log(errors)
  return Array.from(errors.values()).map((error: any) => ({
    description: error.message || 'Unknown error message',
    check_name: 'typescript-errors',
    fingerprint: error.hash || 'unknown-fingerprint',
    severity: error.severity || 'minor',
    location: {
      path: error.file || 'unknown-file',
      lines: {
        begin: error.line || 0
      }
    }
  }))
}

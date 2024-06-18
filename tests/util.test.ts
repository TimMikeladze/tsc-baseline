import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import fs from 'fs'
import { resolve } from 'path'
import {
  BaselineFile,
  parseTypeScriptErrors,
  ErrorSummary,
  writeTypeScriptErrorsToFile,
  readBaselineErrorsFile,
  getBaselineFileVersion,
  getErrorSummaryMap,
  getNewErrors,
  getTotalErrorsCount,
  toHumanReadableText,
  addHashToBaseline,
  SpecificError,
  SpecificErrorsMap,
  ErrorSummaryMap
} from '../src'

describe('Utility Functions', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync('test-dir-')
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true })
  })

  it('parseTypeScriptErrors correctly parses errors', () => {
    const errorLog = `warning package.json: License should be a valid SPDX license expression
error Command failed with exit code 2.
yarn run v1.22.19
$ /Users/tim/workspace/tsc-baseline/node_modules/.bin/tsc
src/util.ts(35,7): error TS1005: ',' expected.
src/util.ts(35,12): error TS1389: 'if' is not allowed as a variable declaration name.
src/util.ts(40,3): error TS1128: Declaration or statement expected.
src/util.ts(43,1): error TS1128: Declaration or statement expected.
src/util.ts(81,1): error TS1128: Declaration or statement expected.
src/somethingElse.ts(2,1): error TS1128: Declaration or statement expected.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

    const { specificErrorsMap, errorSummaryMap } =
      parseTypeScriptErrors(errorLog)

    expect(specificErrorsMap.size).toBe(2)
    const utilFileErrors = specificErrorsMap.get('src/util.ts')
    if (!utilFileErrors)
      throw new Error(
        'Could not find the errors for the util.ts file in the fake test data.'
      )
    const firstError: SpecificError = utilFileErrors[0]
    if (!firstError) {
      throw new Error(
        'Could not find the first error for the util.ts file in the fake test data.'
      )
    }
    expect(firstError.code).toBe('TS1005')
    expect(firstError.message).toBe("',' expected.")
    expect(firstError.file).toBe('src/util.ts')
    expect(firstError.line).toBe(35)
    expect(firstError.column).toBe(7)

    const errorTs1128 = Array.from(errorSummaryMap.values()).find(
      (summary) => summary.code === 'TS1128'
    )
    if (!errorTs1128) {
      throw new Error('Could not find error TS1128 in the parsed result.')
    }
    expect(errorTs1128.message).toBe('Declaration or statement expected.')
    expect(errorTs1128.file).toBe('src/util.ts')
    expect(errorTs1128.count).toBe(3)
  })

  it('writeTypeScriptErrorsToFile correctly writes errors to a file', () => {
    const errorMap = new Map<string, ErrorSummary>()
    errorMap.set('8d4f5b0a6c282e236e4f437a50410d72', {
      code: 'error1234',
      message: 'An error message for TS1234',
      file: 'example.ts',
      count: 2
    })

    const filePath = resolve(tempDir, 'test-errors.json')
    writeTypeScriptErrorsToFile(errorMap, filePath)

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const parsedContent = JSON.parse(fileContent)
    expect(parsedContent).toEqual({
      meta: {
        baselineFileVersion: 1
      },
      errors: {
        '8d4f5b0a6c282e236e4f437a50410d72': {
          code: 'error1234',
          message: 'An error message for TS1234',
          file: 'example.ts',
          count: 2
        }
      }
    })
  })

  it('getBaselineFileVersion assigns a version of 0 to versions before meta field in file', () => {
    const version = getBaselineFileVersion({
      '8d4f5b0a6c282e236e4f437a50410d72': {
        code: 'error1234',
        message: 'An error message for TS1234',
        file: 'example.ts',
        count: 2
      }
    })
    expect(version).toBe(0)
  })

  it('correctly reads errors from a baseline file with associated utilities', () => {
    const filePath = resolve(tempDir, 'test-errors.json')
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          meta: {
            baselineFileVersion: 1
          },
          errors: {
            '8d4f5b0a6c282e236e4f437a50410d72': {
              code: 'error1234',
              message: 'An error message for TS1234',
              file: 'example.ts',
              count: 2
            }
          }
        },
        null,
        2
      )
    )
    const baselineFile = readBaselineErrorsFile(filePath)
    const errorMap = getErrorSummaryMap(baselineFile as BaselineFile)
    expect(errorMap.size).toBe(1)
    const errorInfo = errorMap.get(
      '8d4f5b0a6c282e236e4f437a50410d72'
    ) as ErrorSummary
    expect(errorInfo.code).toBe('error1234')
    expect(errorInfo.message).toBe('An error message for TS1234')
    expect(errorInfo.file).toBe('example.ts')
    expect(errorInfo.count).toBe(2)
  })

  it('should return new errors', () => {
    const oldErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 2,
          message: 'Error 1'
        }
      ]
    ])

    const newErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 2,
          message: 'Error 1'
        }
      ],
      [
        'error2',
        {
          code: 'error2',
          file: 'file2.ts',
          count: 1,
          message: 'Error 2'
        }
      ],
      [
        'error3',
        {
          code: 'error3',
          file: 'file3.ts',
          count: 1,
          message: 'Error 3'
        }
      ]
    ])

    const result = getNewErrors(oldErrors, newErrors)

    expect(result.size).toBe(2) // error2 and error3 are new errors
    expect(result.get('error2')).toEqual(newErrors.get('error2'))
    expect(result.get('error3')).toEqual(newErrors.get('error3'))
  })

  it('should return a new error if the number of those errors has increased', () => {
    const oldErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 1,
          message: 'Error 1'
        }
      ]
    ])

    const newErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 5,
          message: 'Error 1'
        }
      ]
    ])

    const result = getNewErrors(oldErrors, newErrors)

    expect(result.size).toBe(1) // error2 and error3 are new errors
    expect(result.get('error1')).toEqual({
      code: 'error1',
      file: 'file1.ts',
      count: 4,
      message: 'Error 1'
    })
  })

  it('should return an empty map if there are no new errors', () => {
    const oldErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 1,
          message: 'Error 1'
        }
      ]
    ])

    const newErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 1,
          message: 'Error 1'
        }
      ]
    ])

    const result = getNewErrors(oldErrors, newErrors)

    expect(result.size).toBe(0) // No new errors
  })

  it('counts all errors properly', () => {
    const newErrors = new Map<string, ErrorSummary>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          count: 3,
          message: 'Error 1'
        }
      ],
      [
        'error2',
        {
          code: 'error2',
          file: 'file2.ts',
          count: 1,
          message: 'Error 2'
        }
      ],
      [
        'error3',
        {
          code: 'error3',
          file: 'file3.ts',
          count: 1,
          message: 'Error 3'
        }
      ]
    ])
    expect(getTotalErrorsCount(newErrors)).toBe(5)
  })

  it('should format error map to human-readable text', () => {
    const specificErrorsMap: SpecificErrorsMap = new Map([
      [
        'file1.ts',
        [
          {
            code: 'E001',
            file: 'file1.ts',
            message: 'Syntax error',
            line: 1,
            column: 2
          },
          {
            code: 'E001',
            file: 'file1.ts',
            message: 'Syntax error',
            line: 3,
            column: 4
          }
        ]
      ],
      [
        'file2.ts',
        [
          {
            code: 'E002',
            file: 'file2.ts',
            message: 'Type mismatch',
            line: 5,
            column: 6
          }
        ]
      ]
    ])

    const errorSummaryMap: ErrorSummaryMap = new Map([
      [
        'f3f953ce4418dad07eb9aa5df5d846ffdf8f4b4d',
        {
          code: 'E001',
          file: 'file1.ts',
          message: 'Syntax error',
          count: 2
        }
      ],
      [
        '08f2382addc40a426eec5ac4f57c144143460680',
        {
          code: 'E002',
          file: 'file2.ts',
          message: 'Type mismatch',
          count: 1
        }
      ]
    ])

    const expectedOutput = `
File: file1.ts
Message: Syntax error
Code: E001
Hash: f3f953ce4418dad07eb9aa5df5d846ffdf8f4b4d
Count of new errors: 2
2 current errors:
file1.ts(1,2)
file1.ts(3,4)

File: file2.ts
Message: Type mismatch
Code: E002
Hash: 08f2382addc40a426eec5ac4f57c144143460680
Count of new errors: 1
1 current error:
file2.ts(5,6)
    `.trim() // Remove leading newline

    const result = toHumanReadableText(errorSummaryMap, specificErrorsMap)
    expect(result).toBe(expectedOutput)
  })

  it('add hash to baseline', () => {
    const errorMap = new Map<string, ErrorSummary>()
    errorMap.set('8d4f5b0a6c282e236e4f437a50410d72', {
      code: 'error1234',
      message: 'An error message for TS1234',
      file: 'example.ts',
      count: 1
    })

    const filePath = resolve(tempDir, 'test-errors.json')
    writeTypeScriptErrorsToFile(errorMap, filePath)

    addHashToBaseline('hash1234', filePath)

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const parsedContent = JSON.parse(fileContent)
    expect(parsedContent).toEqual({
      meta: {
        baselineFileVersion: 1
      },
      errors: {
        '8d4f5b0a6c282e236e4f437a50410d72': {
          code: 'error1234',
          message: 'An error message for TS1234',
          file: 'example.ts',
          count: 1
        },
        hash1234: {
          code: '0000',
          file: '0000',
          message: '0000',
          count: 1
        }
      }
    })
  })

  it('does not show errors that have simply moved as new errors', () => {
    const originalErrorLog = `warning package.json: License should be a valid SPDX license expression
error Command failed with exit code 2.
yarn run v1.22.19
$ /Users/tim/workspace/tsc-baseline/node_modules/.bin/tsc
src/util.ts(35,7): error TS1005: ',' expected.
src/util.ts(35,12): error TS1389: 'if' is not allowed as a variable declaration name.
src/util.ts(40,3): error TS1128: Declaration or statement expected.
src/util.ts(43,1): error TS1128: Declaration or statement expected.
src/util.ts(81,1): error TS1128: Declaration or statement expected.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

    const originalErrorsParsingResult = parseTypeScriptErrors(originalErrorLog)

    const newErrorLog = `warning package.json: License should be a valid SPDX license expression
error Command failed with exit code 2.
yarn run v1.22.19
$ /Users/tim/workspace/tsc-baseline/node_modules/.bin/tsc
src/util.ts(35,7): error TS1005: ',' expected.
src/util.ts(35,22): error TS1389: 'if' is not allowed as a variable declaration name.
src/util.ts(42,3): error TS1128: Declaration or statement expected.
src/util.ts(43,1): error TS1128: Declaration or statement expected.
src/util.ts(181,1): error TS1128: Declaration or statement expected.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

    const newErrorsParsingResult = parseTypeScriptErrors(newErrorLog)

    const newErrors = getNewErrors(
      originalErrorsParsingResult.errorSummaryMap,
      newErrorsParsingResult.errorSummaryMap
    )

    expect(newErrors.size).toBe(0)
  })

  it('should properly count the number of new errors', () => {
    const originalErrorLog = `warning package.json: License should be a valid SPDX license expression
error Command failed with exit code 2.
yarn run v1.22.19
$ /Users/tim/workspace/tsc-baseline/node_modules/.bin/tsc
src/util.ts(35,12): error TS1389: 'if' is not allowed as a variable declaration name.
src/util.ts(40,3): error TS1128: Declaration or statement expected.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

    const originalErrorsParsingResult = parseTypeScriptErrors(originalErrorLog)

    const newErrorLog = `warning package.json: License should be a valid SPDX license expression
error Command failed with exit code 2.
yarn run v1.22.19
$ /Users/tim/workspace/tsc-baseline/node_modules/.bin/tsc
src/util.ts(35,7): error TS1005: ',' expected.
src/util.ts(35,22): error TS1389: 'if' is not allowed as a variable declaration name.
src/util.ts(42,3): error TS1128: Declaration or statement expected.
src/util.ts(43,1): error TS1128: Declaration or statement expected.
src/util.ts(181,1): error TS1128: Declaration or statement expected.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

    const newErrorsParsingResult = parseTypeScriptErrors(newErrorLog)

    const newErrors = getNewErrors(
      originalErrorsParsingResult.errorSummaryMap,
      newErrorsParsingResult.errorSummaryMap
    )
    expect(newErrors.size).toBe(2)

    const newErrorValues = [...newErrors.values()]
    expect(newErrorValues[0].count).toBe(1) // TS1005 is a new error
    expect(newErrorValues[1].count).toBe(2) // There are 2 more TS1128 errors now
  })
})

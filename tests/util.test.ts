import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import fs from 'fs'
import { resolve } from 'path'
import {
  parseTypeScriptErrors,
  ErrorInfo,
  writeTypeScriptErrorsToFile,
  readTypeScriptErrorsFromFile,
  getNewErrors,
  getTotalErrorsCount,
  toHumanReadableText,
  addHashToBaseline
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
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

    const errorMap = parseTypeScriptErrors(errorLog)

    expect(errorMap.size).toBe(3)

    const error1234 = errorMap.values().next().value as ErrorInfo

    expect(error1234.code).toBe('TS1005')
    expect(error1234.message).toBe("',' expected.")
    expect(error1234.file).toBe('src/util.ts')
    expect(error1234.count).toBe(1)
  })

  it('writeTypeScriptErrorsToFile correctly writes errors to a file', () => {
    const errorMap = new Map<string, ErrorInfo>()
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
      '8d4f5b0a6c282e236e4f437a50410d72': {
        code: 'error1234',
        message: 'An error message for TS1234',
        file: 'example.ts',
        count: 2
      }
    })
  })

  it('readTypeScriptErrorsFromFile correctly reads errors from a file', () => {
    const filePath = resolve(tempDir, 'test-errors.json')
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        '8d4f5b0a6c282e236e4f437a50410d72': {
          code: 'error1234',
          message: 'An error message for TS1234',
          file: 'example.ts',
          count: 2
        }
      }, null, 2)
    )

    const errorMap = readTypeScriptErrorsFromFile(filePath)
    expect(errorMap.size).toBe(1)
    const errorInfo = errorMap.get(
      '8d4f5b0a6c282e236e4f437a50410d72'
    ) as ErrorInfo
    expect(errorInfo.code).toBe('error1234')
    expect(errorInfo.message).toBe('An error message for TS1234')
    expect(errorInfo.file).toBe('example.ts')
    expect(errorInfo.count).toBe(2)
  })

  it('should return new errors', () => {
    const oldErrors = new Map<string, ErrorInfo>([
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

    const newErrors = new Map<string, ErrorInfo>([
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
    const oldErrors = new Map<string, ErrorInfo>([
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

    const newErrors = new Map<string, ErrorInfo>([
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
    const oldErrors = new Map<string, ErrorInfo>([
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

    const newErrors = new Map<string, ErrorInfo>([
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
    const newErrors = new Map<string, ErrorInfo>([
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
    const errorMap: Map<string, ErrorInfo> = new Map([
      [
        'error1',
        {
          code: 'E001',
          file: 'file1.ts',
          message: 'Syntax error',
          count: 2,
          hash: 'error1'
        }
      ],
      [
        'error2',
        {
          code: 'E002',
          file: 'file2.ts',
          message: 'Type mismatch',
          count: 1,
          hash: 'error2'
        }
      ]
    ])

    const expectedOutput = `
File: file1.ts
Message: Syntax error
Code: E001
Count of new errors: 2
Hash: error1

File: file2.ts
Message: Type mismatch
Code: E002
Count of new errors: 1
Hash: error2
    `.trim() // Remove leading newline

    const result = toHumanReadableText(errorMap)
    expect(result).toBe(expectedOutput)
  })

  it('add hash to baseline', () => {
    const errorMap = new Map<string, ErrorInfo>()
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

    const originalErrorMap = parseTypeScriptErrors(originalErrorLog)

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

    const newErrorMap = parseTypeScriptErrors(newErrorLog)

    const newErrors = getNewErrors(originalErrorMap, newErrorMap)

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

    const originalErrorMap = parseTypeScriptErrors(originalErrorLog)

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

    const newErrorMap = parseTypeScriptErrors(newErrorLog)

    const newErrors = getNewErrors(originalErrorMap, newErrorMap)
    expect(newErrors.size).toBe(2)

    const newErrorValues = [...newErrors.values()]
    expect(newErrorValues[0].count).toBe(1) // TS1005 is a new error
    expect(newErrorValues[1].count).toBe(2) // There are 2 more TS1128 errors now
  })
})

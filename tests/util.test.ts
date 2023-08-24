import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import fs from 'fs'
import { resolve } from 'path'
import {
  parseTypeScriptErrors,
  ErrorInfo,
  writeTypeScriptErrorsToFile,
  readTypeScriptErrorsFromFile,
  getNewErrors,
  toHumanReadableText
} from '../src'

describe('Utility Functions', () => {
  let tempDir: string

  beforeAll(() => {
    tempDir = fs.mkdtempSync('test-dir-')
  })

  afterAll(() => {
    fs.rmdirSync(tempDir, { recursive: true })
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

    expect(errorMap.size).toBe(5)

    const error1234 = errorMap.values().next().value as ErrorInfo

    expect(error1234.code).toBe('TS1005')
    expect(error1234.message).toBe("',' expected.")
    expect(error1234.file).toBe('src/util.ts')
    expect(error1234.line).toBe(35)
    expect(error1234.column).toBe(7)
  })

  it('writeTypeScriptErrorsToFile correctly writes errors to a file', () => {
    const errorMap = new Map<string, ErrorInfo>()
    errorMap.set('8d4f5b0a6c282e236e4f437a50410d72', {
      code: 'error1234',
      message: 'An error message for TS1234',
      file: 'example.ts',
      line: 5,
      column: 10
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
        line: 5,
        column: 10
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
          line: 5,
          column: 10
        }
      })
    )

    const errorMap = readTypeScriptErrorsFromFile(filePath)
    expect(errorMap.size).toBe(1)
    const errorInfo = errorMap.get(
      '8d4f5b0a6c282e236e4f437a50410d72'
    ) as ErrorInfo
    expect(errorInfo.code).toBe('error1234')
    expect(errorInfo.message).toBe('An error message for TS1234')
    expect(errorInfo.file).toBe('example.ts')
    expect(errorInfo.line).toBe(5)
    expect(errorInfo.column).toBe(10)
  })

  it('should return new errors', () => {
    const oldErrors = new Map<string, ErrorInfo>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          line: 10,
          column: 5,
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
          line: 10,
          column: 5,
          message: 'Error 1'
        }
      ],
      [
        'error2',
        {
          code: 'error2',
          file: 'file2.ts',
          line: 20,
          column: 3,
          message: 'Error 2'
        }
      ],
      [
        'error3',
        {
          code: 'error3',
          file: 'file3.ts',
          line: 5,
          column: 15,
          message: 'Error 3'
        }
      ]
    ])

    const result = getNewErrors(oldErrors, newErrors)

    expect(result.size).toBe(2) // error2 and error3 are new errors
    expect(result.get('error2')).toEqual(newErrors.get('error2'))
    expect(result.get('error3')).toEqual(newErrors.get('error3'))
  })

  it('should return an empty map if there are no new errors', () => {
    const oldErrors = new Map<string, ErrorInfo>([
      [
        'error1',
        {
          code: 'error1',
          file: 'file1.ts',
          line: 10,
          column: 5,
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
          line: 10,
          column: 5,
          message: 'Error 1'
        }
      ]
    ])

    const result = getNewErrors(oldErrors, newErrors)

    expect(result.size).toBe(0) // No new errors
  })
  it('should format error map to human-readable text', () => {
    const errorMap: Map<string, ErrorInfo> = new Map([
      [
        'error1',
        {
          code: 'E001',
          column: 5,
          file: 'file1.ts',
          line: 10,
          message: 'Syntax error'
        }
      ],
      [
        'error2',
        {
          code: 'E002',
          column: 12,
          file: 'file2.ts',
          line: 5,
          message: 'Type mismatch'
        }
      ]
    ])

    const expectedOutput = `
File: file1.ts
Message: Syntax error
Code: E001
Location: Line 10, Column 5

File: file2.ts
Message: Type mismatch
Code: E002
Location: Line 5, Column 12
    `.trim() // Remove leading newline

    const result = toHumanReadableText(errorMap)
    expect(result).toBe(expectedOutput)
  })
})

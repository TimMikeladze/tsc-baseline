import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'

import fs from 'fs'
import path from 'path'
import { ExecException, exec } from 'child_process'

/**
 * NOTE: This is the compiled CLI for this package to test that everything works end-to-end
 * and avoid bugs like this: https://github.com/TimMikeladze/tsc-baseline/issues/21
 *
 * You'll need to compile the CLI with `yarn dev` and make sure it successfully compiles the
 * latest changes to be able to test them here.
 */
const CLI_PATH = path.resolve(__dirname, '../dist/cli.module.js')

let tempDir: string

const getBaselinePath = () => path.resolve(tempDir, '.tsc-baseline.json')

type CliOutput = {
  code: number
  error: ExecException | null
  stderr: string
  stdout: string
}

/**
 * A utility function for running the compiled CLI.
 *
 * @param input The CLI input command and arguments
 * @param stdin The string input passed to stdin for the CLI
 * @param cwd The directory to run the command from
 * @returns The output of the CLI including exit code, output error, stdout, and stderr
 *
 * Tips for using this:
 * - The input piped to stdin from the TypeScript output is not the same as what is
 *   seen in the terminal. To get this value on mac use `yarn type-check | pbcopy`
 * - Make sure the CLI has properly compiled and is up-to-date before running tests
 *   in this file.
 * - Logging in the CLI won't show up in the test, it will only show up in the
 *   returned `stdout`/`stderr` from this function
 */
const cli = (
  input: string,
  stdin: string | null = null,
  cwd = tempDir
): Promise<CliOutput> =>
  new Promise((resolve) => {
    const cliProcess = exec(
      `node ${CLI_PATH} ${input}`,
      { cwd },
      (error, stdout, stderr) => {
        resolve({
          code: error && error.code ? error.code : 0,
          error,
          stdout,
          stderr
        })
      }
    )
    // NOTE: Currently running this cli utility without stdin isn't fully supported
    // because process.stdin.isTTY (which is currently used to check if the CLI is
    // run without stdio) isn't defined for child processes: https://github.com/nodejs/node/issues/51750
    if (stdin !== null) {
      cliProcess.stdin?.write(stdin)
      cliProcess.stdin?.end()
    }
  })

/**
 * Utility function to remove leading indentation from a multi-line template string
 *
 * NOTE: This currently doesn't support string template expression variables
 */
const removeIndent = (strings: TemplateStringsArray) => {
  const lines = strings[0].split('\n')
  const firstActualLine = lines[1]
  if (!firstActualLine) {
    throw new Error('removeIndent expects more than 1 line of a string')
  }
  const leftPadding = firstActualLine.match(/\s+/)?.[0] ?? ''
  return lines.map((line) => line.substring(leftPadding.length)).join('\n')
}

const basicTsErrorOutput = `yarn run v1.22.22
$ tsc
src/util.ts(134,7): error TS2322: Type 'number' is not assignable to type 'string'.
info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`

describe('End-to-end tests', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync('test-dir-')

    const builtOutputExists = fs.existsSync(CLI_PATH)
    if (!builtOutputExists) {
      throw new Error(
        [
          'The end-to-end tests require that this package is built.',
          '',
          'Run "yarn dev" to build the package into the dist/ directory.'
        ].join('\n')
      )
    }
  })

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(getBaselinePath())) {
      fs.rmSync(getBaselinePath())
    }
  })

  it('has the expected output description and options when no arguments are passed', async () => {
    const output = await cli('')
    expect(output.stderr).toMatchInlineSnapshot(`
      "Usage: tsc-baseline [options] [command]

      Save a baseline of TypeScript errors and compare new errors against it.Useful
      for type-safe feature development in TypeScript projects that have a lot of
      errors. This tool will filter out errors that are already in the baseline and
      only show new errors.

      Options:
        -p --path <path>  Path to file to save baseline errors to. Defaults to
                          .tsc-baseline.json
        -h, --help        display help for command

      Commands:
        save [message]
        add [hash]
        check [message]
        clear
        help [command]    display help for command
      "
    `)
  })

  describe('save', () => {
    it('writes a file with no recorded errors when there are no TypeScript errors', async () => {
      const output = await cli('save', ' ')

      expect(output.error).toBeNull()
      expect(output.code).toBe(0)
      expect(output.stdout).toMatch(
        new RegExp(`Saved baseline errors to '${getBaselinePath()}'`)
      )
      expect(fs.existsSync(getBaselinePath())).toBe(true)
      expect(fs.readFileSync(getBaselinePath(), 'utf-8'))
        .toMatchInlineSnapshot(`
        "{
          \\"meta\\": {
            \\"baselineFileVersion\\": 1
          },
          \\"errors\\": {}
        }"
      `)
    })

    it('saves errors on separate lines so that it works well with version control', async () => {
      const saveOutput = await cli('save', basicTsErrorOutput)
      expect(saveOutput.code).toBe(0)
      expect(fs.existsSync(getBaselinePath())).toBe(true)
      const baselineFileContent = fs.readFileSync(getBaselinePath(), 'utf-8')
      expect(baselineFileContent.split('\n').length).toBeGreaterThan(1)
      expect(baselineFileContent).toMatchInlineSnapshot(`
        "{
          \\"meta\\": {
            \\"baselineFileVersion\\": 1
          },
          \\"errors\\": {
            \\"74fbc5bc3645b575167c6eca966b224014ff7e42\\": {
              \\"file\\": \\"src/util.ts\\",
              \\"code\\": \\"TS2322\\",
              \\"message\\": \\"Type 'number' is not assignable to type 'string'.\\",
              \\"count\\": 1
            }
          }
        }"
      `)
    })
  })

  describe('check', () => {
    it('does not show errors if all the errors already exist', async () => {
      await cli('save', basicTsErrorOutput)
      const checkOutput = await cli('check', basicTsErrorOutput)
      expect(checkOutput.code).toBe(0)
      expect(checkOutput.stderr).toMatchInlineSnapshot(`
        "


        0 new errors found. 1 error already in baseline.
        "
      `)
    })

    it('fails if there were no errors previously and now there is one', async () => {
      await cli('save', ' ')
      const checkOutput = await cli('check', basicTsErrorOutput)
      expect(checkOutput.code).toBe(1)
      expect(checkOutput.stderr).toMatchInlineSnapshot(`
        "
        New errors found:
        File: src/util.ts
        Message: Type 'number' is not assignable to type 'string'.
        Code: TS2322
        Hash: 74fbc5bc3645b575167c6eca966b224014ff7e42
        Count of new errors: 1
        1 current error:
        src/util.ts(134,7)

        1 new error found. 0 errors already in baseline.
        "
      `)
    })

    it('only shows new errors', async () => {
      const originalErrors = removeIndent`
        > tsc-baseline@1.4.0 type-check
        > tsc

        src/util.ts(13,17): error TS2322: Type 'number' is not assignable to type 'string'.
      `
      await cli('save', originalErrors)

      const newErrors = removeIndent`
        > tsc-baseline@1.4.0 type-check
        > tsc

        src/util.ts(133,7): error TS2322: Type 'number' is not assignable to type 'string'.
        src/util.ts(135,7): error TS2322: Type '{ invalid: number; }' is not assignable to type 'number'.
      `
      const checkOutput = await cli('check', newErrors)

      expect(checkOutput.code).toBe(1)
      expect(checkOutput.stderr).toMatchInlineSnapshot(`
        "
        New errors found:
        File: src/util.ts
        Message: Type '{ invalid: number; }' is not assignable to type 'number'.
        Code: TS2322
        Hash: c1b4ab07321ca58aac93307f3be23bc0a8592ee7
        Count of new errors: 1
        1 current error:
        src/util.ts(135,7)

        1 new error found. 1 error already in baseline.
        "
      `)
    })

    it('gives a helpful error if no baseline file is found', async () => {
      const checkOutput = await cli('check', ' ')

      expect(checkOutput.code).toBe(1)
      expect(checkOutput.stderr).toMatch(
        new RegExp(
          `Unable to read the .tsc-baseline.json file at "${getBaselinePath()}".`
        )
      )
      expect(checkOutput.stderr).toMatch(
        /Has the baseline file been properly saved with the 'save' command\?/
      )
    })

    it('fails if using an earlier version of the baseline errors file that does not have metadata', async () => {
      fs.writeFileSync(getBaselinePath(), '{}')

      const checkOutput = await cli('check', ' ')

      expect(checkOutput.code).toBe(1)
      expect(checkOutput.stderr).toMatch(
        new RegExp(
          `The .tsc-baseline.json file at "${getBaselinePath()}"\nis out of date for this version of tsc-baseline.`
        )
      )
      expect(checkOutput.stderr).toMatch(
        /Please update the baseline file using the 'save' command./
      )
    })

    it('warns about being the wrong package version if the baseline file version is a future version', async () => {
      fs.writeFileSync(
        getBaselinePath(),
        JSON.stringify(
          {
            meta: { baselineFileVersion: 10000 },
            errors: {}
          },
          null,
          2
        )
      )
      const checkOutput = await cli('check', ' ')

      expect(checkOutput.code).toBe(1)
      expect(checkOutput.stderr).toMatch(
        new RegExp(
          `The .tsc-baseline.json file at "${getBaselinePath()}"\nis from a future version of tsc-baseline.`
        )
      )
      expect(checkOutput.stderr).toMatch(
        /Are your installed packages up to date\?/
      )
    })
  })
})

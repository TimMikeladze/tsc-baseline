#!/usr/bin/env node

import { Command, Option } from 'commander'
import {
  addHashToBaseline,
  getNewErrors,
  parseTypeScriptErrors,
  getTotalErrorsCount,
  toHumanReadableText,
  writeTypeScriptErrorsToFile,
  readBaselineErrorsFile,
  isBaselineVersionCurrent,
  getErrorSummaryMap,
  getBaselineFileVersion,
  toGitLabOutputFormat,
  CURRENT_BASELINE_VERSION,
  ErrorFormat,
  filterErrorsByFiles,
  readChangedFilesFile
} from './util'
import { resolve } from 'path'
import { rmSync } from 'fs'
;(async () => {
  const program = new Command()

  program
    .name('tsc-baseline')
    .description(
      'Save a baseline of TypeScript errors and compare new errors against it.Useful for type-safe feature development in TypeScript projects that have a lot of errors. This tool will filter out errors that are already in the baseline and only show new errors.'
    )

  let stdin = ''

  program.option(
    '-p --path <path>',
    `Path to file to save baseline errors to. Defaults to .tsc-baseline.json`
  )

  program.option(
    '--ignoreMessages',
    'Ignores specific type error messages and only counts errors by code.'
  )

  program.option(
    '--exclude <pattern>',
    'Ignores errors in files matching this pattern. Repeat the flag for several patterns. A trailing "/" excludes a whole directory, "*" matches within a path segment and "**" across segments.',
    (pattern: string, previous: string[] = []) => [...previous, pattern]
  )

  const getConfig = () => {
    const config = program.opts()
    return {
      path: resolve(process.cwd(), config.path || '.tsc-baseline.json'),
      ignoreMessages: config.ignoreMessages || false,
      // Deduplicated because argv is parsed more than once below, which would
      // otherwise make the collected patterns pile up
      exclude: Array.from(new Set<string>(config.exclude || []))
    }
  }

  program.command('save [message]').action((message) => {
    if (stdin) {
      message = stdin
      if (message) {
        const config = getConfig()
        const errorOptions = {
          ignoreMessages: config.ignoreMessages,
          exclude: config.exclude
        }
        writeTypeScriptErrorsToFile(
          parseTypeScriptErrors(message, errorOptions).errorSummaryMap,
          config.path,
          errorOptions
        )
        console.log("\nSaved baseline errors to '" + config.path + "'")
      }
    }
  })

  program.command('add [hash]').action((hash) => {
    if (!hash) {
      console.error('Missing hash')
    } else {
      const config = getConfig()
      addHashToBaseline(hash, config.path)
    }
  })

  program
    .command('check [message]')
    .addOption(
      new Option(
        '--error-format [error-format]',
        'Specifies the format for outputting errors.'
      )
        .default(ErrorFormat.HUMAN)
        .choices(Object.values(ErrorFormat))
    )
    .option(
      '--reportUnmatchedIgnoredErrors',
      'Reports unmatched ignored errors that are in the baseline but not in the new errors.'
    )
    .option(
      '--changedFiles <path>',
      'Path to a file listing changed files, one per line. Only new errors in those files fail the command; new errors elsewhere are still reported.'
    )
    .action((message, options) => {
      if (stdin) {
        message = stdin
        if (message) {
          const config = getConfig()
          let baselineFile
          try {
            baselineFile = readBaselineErrorsFile(config.path)
          } catch (err) {
            console.error(
              `
  Unable to read the .tsc-baseline.json file at "${config.path}".
  
  Has the baseline file been properly saved with the 'save' command?
  `
            )
            process.exit(1)
          }
          if (!isBaselineVersionCurrent(baselineFile)) {
            const baselineFileVersion = getBaselineFileVersion(baselineFile)
            if (baselineFileVersion < CURRENT_BASELINE_VERSION) {
              console.error(
                `
The .tsc-baseline.json file at "${config.path}"
is out of date for this version of tsc-baseline.

Please update the baseline file using the 'save' command.
`
              )
              process.exit(1)
            } else {
              console.error(
                `
The .tsc-baseline.json file at "${config.path}"
is from a future version of tsc-baseline.

Are your installed packages up to date?
`
              )
              process.exit(1)
            }
          }

          const oldErrorSummaries = getErrorSummaryMap(baselineFile)
          // Exclusions come from the baseline, so the check cannot end up
          // comparing against a set of errors that was filtered differently
          const errorOptions = {
            ignoreMessages: baselineFile.meta.ignoreMessages,
            exclude: baselineFile.meta.exclude ?? []
          }
          const { specificErrorsMap, errorSummaryMap } = parseTypeScriptErrors(
            message,
            errorOptions
          )
          const newErrorSummaries = getNewErrors(
            oldErrorSummaries,
            errorSummaryMap
          )
          const newErrorsCount = getTotalErrorsCount(newErrorSummaries)
          const oldErrorsCount = getTotalErrorsCount(oldErrorSummaries)

          // Only errors in the changed files decide the exit code. The others are
          // still printed, they just belong to code this run did not touch.
          const blockingErrorSummaries = options.changedFiles
            ? filterErrorsByFiles(
                newErrorSummaries,
                readChangedFilesFile(options.changedFiles)
              )
            : newErrorSummaries
          const blockingErrorsCount = getTotalErrorsCount(
            blockingErrorSummaries
          )

          const newErrorsCountMessage = options.changedFiles
            ? `${blockingErrorsCount} new error${
                blockingErrorsCount === 1 ? '' : 's'
              } found in the changed files, ${
                newErrorsCount - blockingErrorsCount
              } elsewhere`
            : `${newErrorsCount} new error${
                newErrorsCount === 1 ? '' : 's'
              } found`

          if (options.errorFormat === ErrorFormat.GITLAB) {
            console.error(
              toGitLabOutputFormat(
                newErrorSummaries,
                specificErrorsMap,
                errorOptions
              )
            )
          } else if (options.errorFormat === ErrorFormat.HUMAN) {
            console.error(`${newErrorsCount > 0 ? '\nNew errors found:' : ''}
${toHumanReadableText(newErrorSummaries, specificErrorsMap, errorOptions)}

${newErrorsCountMessage}. ${oldErrorsCount} error${
              oldErrorsCount === 1 ? '' : 's'
            } already in baseline.`)
          } else {
            console.error(`Invalid error format: ${options.errorFormat}`)
            process.exit(1)
          }

          let unmatchedIgnoredErrorsCount = 0
          if (options.reportUnmatchedIgnoredErrors) {
            const unmatchedIgnoredErrors = getNewErrors(
              errorSummaryMap,
              oldErrorSummaries
            )
            unmatchedIgnoredErrorsCount = getTotalErrorsCount(
              unmatchedIgnoredErrors
            )
            if (unmatchedIgnoredErrorsCount > 0) {
              console.error(`
Unmatched ignored errors:
${toHumanReadableText(
  unmatchedIgnoredErrors,
  specificErrorsMap,
  errorOptions,
  true
)}
Count of unmatched ignored errors: ${unmatchedIgnoredErrorsCount}
`)
            }
          }

          if (blockingErrorsCount > 0 || unmatchedIgnoredErrorsCount > 0) {
            // Exit with a failure code so new errors fail CI by default
            process.exit(1)
          }
        }
      }
    })

  program.command('clear').action(() => {
    const config = getConfig()
    rmSync(config.path)
    console.log("Removed baseline file '" + config.path + "'")
  })

  if (process.stdin.isTTY) {
    program.parse(process.argv)
  } else {
    process.stdin.on('readable', function () {
      // @ts-ignore
      const chunk = this.read()
      if (chunk !== null) {
        stdin += chunk
      }
    })
    process.stdin.on('end', function () {
      program.parse(process.argv)
    })
  }

  try {
    await program.parseAsync(process.argv)
  } catch (err: any) {
    console.error(err.message)
  }
})()

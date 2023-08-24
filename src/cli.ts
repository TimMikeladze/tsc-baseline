#!/usr/bin/env node

import { Command } from 'commander'
import {
  getNewErrors,
  parseTypeScriptErrors,
  readTypeScriptErrorsFromFile,
  toHumanReadableText,
  writeTypeScriptErrorsToFile
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

  const getConfig = () => {
    const config = program.opts()
    return {
      path: resolve(process.cwd(), config.path || '.tsc-baseline.json')
    }
  }

  program.command('save [message]').action((message) => {
    if (stdin) {
      message = stdin
      if (message) {
        const config = getConfig()
        writeTypeScriptErrorsToFile(parseTypeScriptErrors(message), config.path)
        console.log("\nSaved baseline errors to '" + config.path + "'")
      }
    }
  })

  program.command('check [message]').action((message) => {
    if (stdin) {
      message = stdin
      if (message) {
        const config = getConfig()
        const oldErrors = readTypeScriptErrorsFromFile(config.path)
        const newErrors = getNewErrors(
          oldErrors,
          parseTypeScriptErrors(message)
        )
        const newErrorsCount =
          newErrors.size === 0
            ? '0 errors found'
            : `${newErrors.size} error${newErrors.size > 1 ? 's' : ''} found`

        console.error(`
${toHumanReadableText(newErrors)}

${newErrorsCount}. ${oldErrors.size} error${
          oldErrors.size > 1 ? 's' : ''
        } already in baseline.`)
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

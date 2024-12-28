# 🌡️ tsc-baseline

Often times when working on a large codebase or joining a new project, you'll be faced with a lot pre-existing type errors. While it's important to fix these errors, practically speaking, it's not realistic to fix them all at once and will likely be done incrementally over time.

`tsc-baseline` helps you reduce the noise of pre-existing type errors by allowing you to save a baseline of errors and filter them out of future type-checks.

This is especially useful when you're working on a new feature branch and want to focus on the errors introduced by your changes, rather than the errors that were already present in the codebase.

> 👋 Hello there! Follow me [@linesofcode](https://twitter.com/linesofcode) or visit [linesofcode.dev](https://linesofcode.dev) for more cool projects like this one.

## 📡 Install

```console
npm install tsc-baseline

yarn add tsc-baseline

pnpm add tsc-baseline
```

## 🚀 Getting Started

First, run a type-check in a project containing errors and save the results to a file. We refer to this file as the baseline.

```console
yarn tsc | yarn tsc-baseline save
```

Next, make some changes to your codebase that introduce new errors, and run the type-check again. This time, we'll compare the results to the baseline and filter out pre-existing errors.

Running the following command will print out the new errors to the console.

```console
yarn tsc | yarn tsc-baseline check
```

If you need to explicitly add an error to the baseline, you can do so by copying the error's hash from the console output and running the following command.

```console
yarn tsc-baseline add 1234
```

When you're done, you can delete the baseline file.

```console
yarn tsc-baseline clear
```
### Error Format Options

You can specify the error format to be used when checking for new errors with the `check` command. This option affects the output to `stderr`. By default, the standard error message format is used. However, if you want the output in a GitLab-friendly format, you can use the `--error-format` option:

- **Default Format (`human`):** Shows standard human-readable error messages.
- **GitLab Format (`gitlab`):** Outputs errors in a format suitable for GitLab pipelines, making it easier to process in CI/CD workflows.

Example for GitLab format:

```console
yarn tsc | yarn tsc-baseline check --error-format gitlab

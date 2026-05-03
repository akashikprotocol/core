# Contributing to @akashikprotocol/core

Thanks for your interest in contributing! This document covers how to get started.

## Local development

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/akashikprotocol/core.git
   cd core
   npm install
   ```

2. Run the dev workflow:

   ```bash
   npm test          # run tests
   npm run build     # build ESM + CJS + types
   npm run lint      # lint and format check
   npm run typecheck # TypeScript type checking
   ```

   Requires **Node 22** (LTS). Use `nvm use` to pick up the `.nvmrc`.

## Pull request process

1. Branch from `main`.
2. Make your changes, keeping commits focused and well-described.
3. Before opening a PR, ensure all of these pass locally:

   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

4. Open a pull request against `main`. CI must be green before merge.

## Contributor License Agreement

By submitting a pull request or other contribution to this project, you agree
that your contribution is licensed under the Apache-2.0 license (the same
license as the project) and that you have the right to grant that license. If
your employer holds the copyright to your work, you confirm that you have
permission to make the contribution under these terms.

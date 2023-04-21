Hijack NPM Registry
===================

Creates a faux NPM registry server, which will intercept select
npm install requests, providing unpublished, local packages while
forwarding all other packages to the official NPM registry.

This can be used to test how a package will behave once published,
before actually publishing it, including all `pakage.json` imports.

Configuration
-------------

This package was designed to test ethers under various installation
conditions, so the below example assumes the package being hijacked
(in the `./faux-npm/ethers/` folder) also contains the tests.

```
name: Test TypeScript Import

on:
  push:
    bracnhes:
      - master

jobs:

  test-import-typescript:
    name: Test Import TypeScript

    runs-on: ubuntu-latest
    env:
      npm_config_registry: http://localhost:8043

    steps:
      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: 18.x

      - name: Checkout repository
        uses: actions/checkout@v3
        with:
          path: "faux-npm/ethers"

      - name: Install and run Faux Registry
        uses: ethers-io/hijack-npm-action

      - name: Copy tests to working directory
        run: cp faux-npm/ethers/testcases/test-env/ts-import/* .

      - name: Install packages
        run: npm install

      - name: Run tests
        run: npm test
```

License
-------

MIT License.

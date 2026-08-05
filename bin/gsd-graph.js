#!/usr/bin/env node
// gsd-graph — npm bin entry (PKG-03)
'use strict';
const { main } = require('../dist/cli.js');
Promise.resolve(main(process.argv)).then((code) => {
  process.exitCode = code;
});

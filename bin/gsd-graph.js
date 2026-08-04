#!/usr/bin/env node
// gsd-graph — npm bin entry (PKG-03)
'use strict';
const { main } = require('../dist/cli.js');
process.exitCode = main(process.argv);

#!/usr/bin/env node
// gsd-graph — npm bin entry (PKG-03)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>
'use strict';
const { main } = require('../dist/cli.js');
process.exitCode = main(process.argv);

#!/usr/bin/env node
import { Command } from 'commander';
import pageLoader from '../index.js';

const program = new Command();

program
  .name('page-loader')
  .version('1.0.0')
  .description('Something script for download pages')
  .option('-o, --output [dir]', 'output dir', process.cwd())
  .arguments('<link>')
  .action(async (link) => {
    const options = program.opts();
    try {
      pageLoader(link, options.output)
    } catch(error) {
      console.error(error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

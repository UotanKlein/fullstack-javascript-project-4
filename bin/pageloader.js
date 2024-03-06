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
  .action((link) => {
    const options = program.opts();
    pageLoader(link, options.output);
  });

program.parse(process.argv);

#!/usr/bin/env node
import { Command } from 'commander';
import { PageLoader } from '../src/pageloader.js';

const program = new Command();

program
  .name('page-loader')
  .version('1.0.0')
  .description('Something script for download pages')
  .option('-o, --output [dir]', 'output dir', process.cwd())
  .arguments('<link>')
  .action((link) => {
    const options = program.opts();
    const loader = new PageLoader(link, options.output);
    loader.downloadPage();
  });

program.parse(process.argv);

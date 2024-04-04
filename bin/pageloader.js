#!/usr/bin/env node
import { Command } from 'commander';
import pageLoader from '../index.js';

const program = new Command();

program
  .name('page-loader')
  .version('1.0.0')
  .description('Utility for downloading pages')
  .option('-o, --output [dir]', 'output dir', process.cwd())
  .arguments('<link>')
  .action((link) => {
    const options = program.opts();
    pageLoader(link, options.output).then((ctx) => {
      console.log(`Page was successfully downloaded into '${options.output}'`);
    }).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  });

program.parse(process.argv);

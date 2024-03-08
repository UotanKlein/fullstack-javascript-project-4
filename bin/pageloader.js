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
    (async () => {
      try {
        const options = program.opts();
        await pageLoader(link, options.output);
        console.log(`Page was successfully downloaded into '${options.output}'`);
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    })();
  });

program.parse(process.argv);
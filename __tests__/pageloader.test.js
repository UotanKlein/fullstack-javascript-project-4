import nock from 'nock';
import tmp from 'tmp';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import PageLoader from '../src/pageloader.js';
import pageLoader from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testLink = 'http://example.com';

const getFixturePath = (fixtureFile) => path.join(path.resolve(__dirname, '..'), '__fixtures__', fixtureFile);

const normalized = (html) => html.replace(/\r\n/g, '\n');

describe('Page Loader Tests', () => {
  let beforeFixtureHTML;
  let beforeFixtureJS;
  let beforeFixtureCSS;
  let beforeFixturePNG;
  let afterFixtureHTML;
  // let fixtureLog;
  let tempDir;
  let loader;

  beforeAll(() => {
    beforeFixtureHTML = fs.readFileSync(getFixturePath('before.html'), 'utf8');
    beforeFixtureJS = fs.readFileSync(getFixturePath('before.js'), 'utf8');
    beforeFixtureCSS = fs.readFileSync(getFixturePath('before.css'), 'utf8');
    beforeFixturePNG = fs.readFileSync(getFixturePath('test.jpg'));
    afterFixtureHTML = fs.readFileSync(getFixturePath('after.html'), 'utf8');
    // fixtureLog = fs.readFileSync(getFixturePath('fixtureLog.log'), 'utf8');
  });

  beforeEach(async () => {
    tempDir = tmp.dirSync({ unsafeCleanup: true }).name;

    nock(testLink)
      .get('/')
      .reply(200, beforeFixtureHTML, { 'Content-Type': 'text/html' });

    nock(testLink)
      .get('/assets/test.css')
      .reply(200, beforeFixtureCSS, { 'Content-Type': 'text/css' });

    nock(testLink)
      .get('/assets/test.js')
      .reply(200, beforeFixtureJS, { 'Content-Type': 'application/javascript' });

    nock(testLink)
      .get('/assets/test.png')
      .reply(200, beforeFixturePNG, { 'Content-Type': 'image/png' });

    loader = new PageLoader(testLink, tempDir);
    await loader.downloadPage();
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true });
    nock.cleanAll();
  });

  test('Structure', async () => {
    const contentPath = path.join(tempDir, 'example-com_files');
    await expect(fsp.access(contentPath)).resolves.toBeUndefined();
  });

  test('HTML', async () => {
    const contentPath = path.join(tempDir, 'example-com.html');
    expect(loader.htmlPath).toEqual(contentPath);

    await expect(fsp.access(contentPath)).resolves.toBeUndefined();

    const html = await fsp.readFile(contentPath, 'utf-8');
    expect(normalized(html)).toEqual(normalized(afterFixtureHTML));
  });

  test('CSS', async () => {
    const contentPath = path.join(tempDir, 'example-com_files', 'example-com-assets-test.css');

    await expect(fsp.access(contentPath)).resolves.toBeUndefined();

    const css = await fsp.readFile(contentPath, 'utf-8');
    expect(normalized(css)).toEqual(normalized(beforeFixtureCSS));
  });

  test('JS', async () => {
    const contentPath = path.join(tempDir, 'example-com_files', 'example-com-assets-test.js');

    await expect(fsp.access(contentPath)).resolves.toBeUndefined();

    const js = await fsp.readFile(contentPath, 'utf-8');
    expect(normalized(js)).toEqual(normalized(beforeFixtureJS));
  });

  test('PNG', async () => {
    const contentPath = path.join(tempDir, 'example-com_files', 'example-com-assets-test.png');

    await expect(fsp.access(contentPath)).resolves.toBeUndefined();

    const actualImageBuffer = await fsp.readFile(contentPath);

    expect(actualImageBuffer.equals(beforeFixturePNG)).toBe(true);
  });

  test('logs', async () => {
    const contentPath = path.join(tempDir, 'logs');

    await expect(fsp.access(contentPath)).resolves.toBeUndefined();

    const logFile = (await fsp.readdir(contentPath))[0];
    await expect(fsp.access(path.join(contentPath, logFile))).resolves.toBeUndefined();
  });
});

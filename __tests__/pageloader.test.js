import nock from 'nock';
import tmp from 'tmp';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { jest } from '@jest/globals';
import { fileURLToPath } from 'url';
import pageLoader from '../index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testLink = 'http://example.com';
const invalidLink = 'http://exampleinvalidlink.com';

const getFixturePath = (fixtureFile) => path.join(path.resolve(__dirname, '..'), '__fixtures__', fixtureFile);

const normalized = (html) => html.replace(/\r\n/g, '\n');

describe('Page Loader Tests', () => {
  let beforeFixtureHTML;
  let beforeFixtureJS;
  let beforeFixtureCSS;
  let beforeFixturePNG;
  let afterFixtureHTML;
  let tempDir;

  beforeAll(() => {
    beforeFixtureHTML = fs.readFileSync(getFixturePath('before.html'), 'utf8');
    beforeFixtureJS = fs.readFileSync(getFixturePath('before.js'), 'utf8');
    beforeFixtureCSS = fs.readFileSync(getFixturePath('before.css'), 'utf8');
    beforeFixturePNG = fs.readFileSync(getFixturePath('test.jpg'));
    afterFixtureHTML = fs.readFileSync(getFixturePath('after.html'), 'utf8');
  });

  beforeEach(() => {
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

    return pageLoader(testLink, tempDir).catch((error) => {
      this.cb(error);
    });
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
      nock.cleanAll();
    } catch (error) {
      this.cb(error);
    }
  });

  test('Structure', async () => {
    try {
      const contentPath = path.join(tempDir, 'example-com_files');
      await expect(fsp.access(contentPath)).resolves.toBeUndefined();
    } catch (error) {
      this.cb(error);
    }
  });

  test('HTML', async () => {
    try {
      const contentPath = path.join(tempDir, 'example-com.html');
      await expect(fsp.access(contentPath)).resolves.toBeUndefined();
      const html = await fsp.readFile(contentPath, 'utf-8');
      expect(normalized(html)).toEqual(normalized(afterFixtureHTML));
    } catch (error) {
      this.cb(error);
    }
  });

  test('CSS', async () => {
    try {
      const contentPath = path.join(tempDir, 'example-com_files', 'example-com-assets-test.css');
      await expect(fsp.access(contentPath)).resolves.toBeUndefined();
      const css = await fsp.readFile(contentPath, 'utf-8');
      expect(normalized(css)).toEqual(normalized(beforeFixtureCSS));
    } catch (error) {
      this.cb(error);
    }
  });

  test('JS', async () => {
    try {
      const contentPath = path.join(tempDir, 'example-com_files', 'example-com-assets-test.js');
      await expect(fsp.access(contentPath)).resolves.toBeUndefined();
      const js = await fsp.readFile(contentPath, 'utf-8');
      expect(normalized(js)).toEqual(normalized(beforeFixtureJS));
    } catch (error) {
      this.cb(error);
    }
  });

  test('PNG', async () => {
    try {
      const contentPath = path.join(tempDir, 'example-com_files', 'example-com-assets-test.png');
      await expect(fsp.access(contentPath)).resolves.toBeUndefined();
      const actualImageBuffer = await fsp.readFile(contentPath);
      expect(actualImageBuffer.equals(beforeFixturePNG)).toBe(true);
    } catch (error) {
      this.cb(error);
    }
  });

  test('logs', async () => {
    try {
      const contentPath = path.join(tempDir, 'logs');
      await expect(fsp.access(contentPath)).resolves.toBeUndefined();
      const logFile = (await fsp.readdir(contentPath))[0];
      await expect(fsp.access(path.join(contentPath, logFile))).resolves.toBeUndefined();
    } catch (error) {
      this.cb(error);
    }
  });
});

describe('Invalid Link Tests', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = tmp.dirSync({ unsafeCleanup: true }).name;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    console.error.mockRestore();

    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      this.cb(error);
    }
  });

  test('Should fail with invalid link', async () => {
    await expect(pageLoader(invalidLink, tempDir)).rejects.toThrow();
  });
});

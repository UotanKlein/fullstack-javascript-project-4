import nock from 'nock';
import mock from 'mock-fs';
import path from 'path';
// import axios from 'axios';
// import fsp from 'fs/promises';
import fs from 'fs';
import { fileURLToPath } from 'url';
// import { PageLoader } from '../src/pageloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getFixturePath = (fixtureFile) => path.join(path.resolve(__dirname, '..'), '__fixtures__', fixtureFile);

describe('Page Loader Tests', () => {
  let beforeFixture;
  // let afterFixture;

  beforeEach(() => {
    beforeFixture = fs.readFileSync(getFixturePath('before.html'), 'utf8');
    // afterFixture = fs.readFileSync(getFixturePath('before.html'), 'utf8');

    mock({});
    nock('http://example.com')
      .get('/')
      .reply(200, beforeFixture);
  });

  afterEach(() => {
    mock.restore();
    nock.cleanAll();
  });

  test('ReadHTML', async () => {
    // const loader = new PageLoader('http://example.com', '');
    // const html = await loader.readHTML();
  });
});

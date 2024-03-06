import Listr from 'listr';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import cheerio from 'cheerio';
import path from 'path';
import { pipeline } from 'stream';
import { promisify } from 'util';
import Logs from './logs.js';

const pipelinePromise = promisify(pipeline);

process.on('uncaughtException', (error) => {
  console.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error(`Unhandled rejection: ${error.message}`);
  process.exit(1);
});

const compareDomainAndSubdomains = (url1, url2) => {
  const getRootDomain = (url) => {
    const { hostname } = new URL(url);
    const hostnameParts = hostname.split('.').reverse();

    if (hostnameParts.length >= 2) {
      return `${hostnameParts[1]}.${hostnameParts[0]}`;
    }
    return hostname;
  };

  return getRootDomain(url1) === getRootDomain(url2);
};

const getAbsolute = (url, baseUrl) => {
  try {
    const fullUrl = new URL(url, baseUrl);
    return fullUrl.href;
  } catch (error) {
    console.error(`Ошибка при обработке URL: ${error}`);
    return url;
  }
};

// function isUrl(href) {
//   const regex = /^(https?:\/\/)/;
//   return regex.test(href);
// }

export const convertLinkToFileName = (link) => {
  const fileName = link.split('?')[0];
  return fileName.replace(/^https?:\/\//, '').replace(/[^\w]/g, '-');
};

export class PageLoader {
  constructor(link, outputPath, isFile, cb = () => {}) {
    this.link = link;
    this.outputPath = outputPath;
    this.isFile = isFile;
    this.cb = cb;
    this.htmlPath = '';
    this.contentPath = '';
    this.logs = new Logs(process.cwd());
  }

  getLink() {
    return this.link;
  }

  getHtmlPath() {
    return this.htmlPath;
  }

  getContentPath() {
    return this.contentPath;
  }

  getOutputPath() {
    return this.outputPath;
  }

  setCB(cb) {
    this.cb = cb;
  }

  readHTML() {
    const htmlPromise = this.isFile ? fsp.readFile(this.link, 'utf-8') : axios.get(this.link).then((res) => res.data);
    this.htmlPromise = htmlPromise;
    return htmlPromise;
  }

  downloadAndSave(url, savePath) {
    const tasks = new Listr([
      {
        title: url,
        task: () => axios.get(url).then((response) => {
          if (response.status !== 200) {
            throw new Error(`Failed to load page, status code: ${response.status}`);
          }
          this.logs.addLog(`The content was uploaded successfully: '${url}'`);
          return fsp.writeFile(savePath, response.data);
        }),
      },
    ], {
      rendererOptions: {
        collapse: false,
        collapseSkips: false,
        showSubtasks: true,
        clearOutput: false,
      },
      renderer: 'default',
    });

    return tasks.run().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }

  ensureDirExists(dirPath) {
    return Promise.resolve().then(() => fsp.mkdir(dirPath, { recursive: true })).catch((error) => {
      console.error(`Failed to create directory: ${error.message}`);
      process.exit(1);
    });
  }

  downloadAndSaveImage(imageUrl, imagePath) {
    const dirPath = path.dirname(imagePath);

    const tasks = new Listr([
      {
        title: imageUrl,
        task: () => this.ensureDirExists(dirPath)
          .then(() => axios.get(imageUrl, { responseType: 'stream' }))
          .then((response) => pipelinePromise(
            response.data,
            fs.createWriteStream(imagePath),
          ))
          .then(() => {
            this.logs.addLog(`The image was uploaded successfully: '${imageUrl}'`);
          })
          .catch((error) => {
            this.logs.addLog(`An error occurred while uploading the image: '${imageUrl}' Error: ${error.message}`);
            console.error(`Ошибка при сохранении изображения: ${error.message}`);
          }),
      },
    ], {
      rendererOptions: {
        collapse: false,
        collapseSkips: false,
        showSubtasks: true,
        clearOutput: false,
      },
      renderer: 'default',
    });

    return tasks.run().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }

  downloadContent() {
    return this.htmlPromise
      .then((content) => {
        const $ = cheerio.load(content);
        const contentPromises = [];

        const processElement = (element, attributeName, resourceType = 'default') => {
          const url = $(element).attr(attributeName);
          const pathNameUrl = getAbsolute(url, this.link);

          if (!url || !compareDomainAndSubdomains(this.link, pathNameUrl) || (resourceType === 'style' && $(element).attr('rel') !== 'stylesheet')) return;

          const splitUrl = pathNameUrl.split('.');
          const extension = splitUrl.pop();
          const fileName = `${convertLinkToFileName(splitUrl.join('.'))}.${extension}`;
          const filePath = path.join(this.contentPath, fileName);

          $(element).attr(attributeName, filePath);

          let promise;
          if (resourceType === 'image') {
            promise = this.downloadAndSaveImage(pathNameUrl, filePath);
          } else {
            promise = this.downloadAndSave(pathNameUrl, filePath);
          }

          contentPromises.push(promise);
        };

        $('img').each((index, element) => processElement(element, 'src', 'image'));
        $('script').each((index, element) => processElement(element, 'src'));
        $('link').each((index, element) => processElement(element, 'href', 'style'));

        return Promise.all(contentPromises).then(() => $.html());
      })
      .then((updatedHtml) => {
        this.logs.addLog(`The page content was saved successfully: '${this.link}'`);
        this.saveHTML(updatedHtml);
        this.cb(null);
      })
      .catch((error) => {
        this.logs.addLog(`An error occurred while uploading the page content: '${this.link}' Error: ${error}`);
        this.cb(error);
      });
  }

  downloadPage() {
    this.logs.addLog(`The page ${this.link} has started loading.`);

    const convertLink = convertLinkToFileName(this.link);
    const fullPathHTML = path.normalize(path.join(this.outputPath, `${convertLink}.html`));
    const fullPathContent = `${convertLink}_files`;

    this.htmlPath = fullPathHTML;
    this.contentPath = fullPathContent;

    this.requestInterceptor = axios.interceptors.request.use((request) => {
      this.logs.addLog(`Request: ${request.method.toUpperCase()} ${request.url}`);
      return request;
    }, (error) => {
      this.logs.addLog(`Request Error: ${error.message}`);
      return Promise.reject(error);
    });

    this.responseInterceptor = axios.interceptors.response.use((response) => {
      this.logs.addLog(`Response: ${response.status} ${response.config.url}`);
      return response;
    }, (error) => {
      this.logs.addLog(`Response Error: ${error.message}`);
      return Promise.reject(error);
    });

    const tasks = new Listr([
      {
        title: `The page is saved in: '${this.htmlPath}'`,
        task: () => this.readHTML()
          .then(() => this.downloadAndSave(this.link, fullPathHTML))
          .then(() => this.downloadContent())
          .then(() => this.afterDownloadedPage())
          .catch((error) => console.error('An error occurred during the page download process:', error)),
      },
    ], {
      rendererOptions: {
        collapse: false,
        collapseSkips: false,
        showSubtasks: true,
        clearOutput: false,
      },
      renderer: 'default',
    });

    tasks.run().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }

  afterDownloadedPage() {
    this.logs.addLog(`Page was successfully downloaded into '${this.htmlPath}'`);

    axios.interceptors.request.eject(this.requestInterceptor);
    axios.interceptors.response.eject(this.responseInterceptor);

    return this.logs.saveLogs();
  }

  async saveHTML(content) {
    try {
      await fsp.writeFile(this.htmlPath, content);
      this.logs.addLog(`The HTML was saved successfully: '${this.link}'`);
    } catch (err) {
      this.logs.addLog(`An error occurred during the html saved process: '${this.link}' Error: ${err.message}`);
      console.error(`Failed to write file: ${error.message}`);
      process.exit(1);
    }
  }
}

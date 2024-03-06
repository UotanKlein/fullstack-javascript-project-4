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

const getExtensionByContentType = (contentType) => {
  const mimeType = contentType.split(';')[0];

  const mappings = {
    'text/html': 'html',
    'text/css': 'css',
    'application/javascript': 'js',
    'text/javascript': 'js',
    'application/json': 'json',
    'application/xml': 'xml',
    'text/xml': 'xml',
    'text/plain': 'txt',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'application/vnd.rar': 'rar',
    'application/x-7z-compressed': '7z',
    'application/octet-stream': 'bin',
  };

  return mappings[mimeType] || 'bin';
};

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

const ensureDirExists = async (dirPath) => Promise.resolve()
  .then(() => fsp.mkdir(dirPath, { recursive: true }))
  .catch((error) => {
    console.error(`Failed to create directory: ${error.message}`);
    process.exit(1);
  });

const getAbsolute = (url, baseUrl) => {
  try {
    const fullUrl = new URL(url, baseUrl);
    return fullUrl.href;
  } catch (error) {
    console.error(`Ошибка при обработке URL: ${error}`);
    return url;
  }
};

export const convertLinkToFileName = (link) => {
  const fileName = link.split('?')[0];
  return fileName.replace(/^https?:\/\//, '').replace(/[^\w]/g, '-');
};

export class PageLoader {
  constructor(link, outputPath, cb = () => {}) {
    this.link = link;
    this.outputPath = outputPath;
    this.cb = cb;
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
    const htmlPromise = axios.get(this.link).then((res) => res.data);
    this.htmlPromise = htmlPromise;
    return htmlPromise;
  }

  async downloadAndSave(url, savePath) {
    const tasks = new Listr([
      {
        title: `Downloading Web Asset from ${url}`,
        task: (ctx, task) => axios.get(url)
          .then((response) => {
            if (response.status !== 200) {
              throw new Error(`Failed to load web asset. Status code: ${response.status}`);
            }

            const contentType = response.headers['content-type'];
            console.log(contentType);
            const extension = getExtensionByContentType(contentType);
            ctx.extension = extension

            return fsp.writeFile(`${savePath}.${extension}`, response.data);
          })
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Web asset downloaded successfully from ${url}`;
            this.logs.addLog(`Web asset was uploaded successfully from '${url}'`);
          })
          .catch((error) => {
            this.logs.addLog(`An error occurred while uploading the web asset from '${url}' Error: ${error.message}`);
            throw new Error(`Failed to download web asset from ${url}. Error: ${error.message}`);
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
      console.error(error.message);
      process.exit(1);
    });
  }

  async downloadAndSaveImage(imageUrl, imagePath) {
    const dirPath = path.dirname(imagePath);

    const tasks = new Listr([
      {
        title: `Downloading image from ${imageUrl}`,
        task: (ctx, task) => ensureDirExists(dirPath)
          .then(() => axios.get(imageUrl, { responseType: 'stream' }))
          .then((response) => {
            const contentType = response.headers['content-type'];
            const extension = getExtensionByContentType(contentType);
            ctx.extension = extension;

            return pipelinePromise(response.data, fs.createWriteStream(`${imagePath}.${extension}`));
          })
          .then(() => {
            this.logs.addLog(`Image was uploaded successfully from '${imageUrl}'`);
            // eslint-disable-next-line no-param-reassign
            task.title = `Image downloaded successfully from ${imageUrl}`;
          })
          .catch((error) => {
            this.logs.addLog(`An error occurred while uploading the image from '${imageUrl}' Error: ${error.message}`);
            // eslint-disable-next-line no-param-reassign
            task.title = `Failed to download image from ${imageUrl}`;
            throw new Error(error.message);
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
      console.error(error.message);
      process.exit(1);
    });
  }

  async downloadContent() {
    return this.htmlPromise
      .then((content) => {
        const $ = cheerio.load(content);
        const contentPromises = [];

        const processElement = (element, attributeName, resourceType = 'default') => {
          const url = $(element).attr(attributeName);
          const pathNameUrl = getAbsolute(url, this.link);

          if (!url || !compareDomainAndSubdomains(this.link, pathNameUrl) || (resourceType === 'style' && $(element).attr('rel') !== 'stylesheet')) return;

          const splitUrl = pathNameUrl.split('.');
          splitUrl.pop();
          const fileName = `${convertLinkToFileName(splitUrl.join('.'))}`;
          const filePath = path.join(this.contentPath, fileName);

          let promise;
          if (resourceType === 'image') {
            promise = this.downloadAndSaveImage(pathNameUrl, filePath);
          } else {
            promise = this.downloadAndSave(pathNameUrl, filePath);
          }

          promise.then((ctx) => {
            $(element).attr(attributeName, `${filePath}.${ctx.extension}`);
            return ctx;
          })

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

  async downloadPage() {
    this.logs.addLog(`The page ${this.link} has started loading.`);

    const convertLink = convertLinkToFileName(this.link);
    this.htmlPath = path.normalize(path.join(this.outputPath, `${convertLink}.html`));
    this.contentPath = `${convertLink}_files`;

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
        title: `Saving a page from '${this.link}'`,
        task: (ctx, task) => this.readHTML()
          .then(() => this.downloadContent())
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Page downloaded successfully from ${this.link}`;

            this.logs.addLog(`Page was successfully downloaded into '${this.htmlPath}'`);

            axios.interceptors.request.eject(this.requestInterceptor);
            axios.interceptors.response.eject(this.responseInterceptor);

            return this.logs.saveLogs();
          })
          .catch((error) => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Failed to download page from ${this.link}`;
            console.error('An error occurred during the page download process:', error);
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

    return tasks.run().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }

  async saveHTML(content) {
    try {
      await fsp.writeFile(this.htmlPath, content);
      this.logs.addLog(`The HTML was saved successfully: '${this.link}'`);
    } catch (error) {
      this.logs.addLog(`An error occurred during the html saved process: '${this.link}' Error: ${error.message}`);
      console.error(`Failed to write file: ${error.message}`);
      process.exit(1);
    }
  }
}

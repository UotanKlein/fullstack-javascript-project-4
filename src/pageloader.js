import Listr from 'listr';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import cheerio from 'cheerio';
import path from 'path';
import prettier from 'prettier';
import Logs from './logs.js';
import funcs from './func.js';

process.on('uncaughtException', (error) => {
  console.error(`Uncaught exception: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  console.error(`Unhandled rejection: ${error.message}`);
});

export default class PageLoader {
  constructor(link, outputPath, cb = () => {}) {
    this.link = link;
    this.outputPath = outputPath;
    this.cb = cb;
    this.logs = new Logs(outputPath);

    if (!funcs.isValidUrl(this.link)) {
      throw new Error(`URL '${this.link}' is invalid.`);
    }
  }

  setCB(cb) {
    this.cb = cb;
  }

  readHTML() {
    const htmlPromise = axios.get(this.link).then((res) => res.data).catch((error) => {
      throw error;
    });
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
            const extension = funcs.getExtensionByContentType(contentType);
            ctx.extension = extension;

            return fsp.writeFile(path.join(this.outputPath, `${savePath}.${extension}`), response.data).catch((error) => {
              throw error;
            });
          })
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Web asset downloaded successfully from ${url}`;
            this.logs.addLog(`Web asset was uploaded successfully from '${url}'`);
          })
          .catch((error) => {
            this.logs.addLog(`An error occurred while uploading the web asset from '${url}' Error: ${error.message}`);
            throw error;
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
      throw error;
    });
  }

  async downloadAndSaveImage(imageUrl, imagePath) {
    const dirPath = path.dirname(imagePath);

    const tasks = new Listr([
      {
        title: `Downloading image from ${imageUrl}`,
        task: (ctx, task) => funcs.ensureDirExists(path.join(this.outputPath, dirPath))
          .then(() => axios.get(imageUrl, { responseType: 'stream' }))
          .then((response) => {
            const contentType = response.headers['content-type'];
            const extension = funcs.getExtensionByContentType(contentType);
            ctx.extension = extension;

            return funcs.pipelinePromise(response.data, fs.createWriteStream(path.join(this.outputPath, `${imagePath}.${extension}`)));
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
      throw error;
    });
  }

  async downloadContent() {
    return this.htmlPromise
      .then((content) => {
        const $ = cheerio.load(content);
        const contentPromises = [];

        fsp.mkdir(path.join(this.outputPath, this.contentPath), { recursive: true }).catch((error) => {
          throw error;
        });

        const processElement = (element, attributeName, resourceType = 'default') => {
          const url = $(element).attr(attributeName);
          const pathNameUrl = funcs.getAbsolute(url, this.link);

          if (!url || !funcs.compareDomainAndSubdomains(this.link, pathNameUrl) || (resourceType === 'style' && $(element).attr('rel') !== 'stylesheet')) return;

          const splitUrl = pathNameUrl.split('.');
          splitUrl.pop();
          const fileName = `${funcs.convertLinkToFileName(splitUrl.join('.'))}`;
          const filePath = path.join(this.contentPath, fileName);

          let promise;
          if (resourceType === 'image') {
            promise = this.downloadAndSaveImage(pathNameUrl, filePath);
          } else {
            promise = this.downloadAndSave(pathNameUrl, filePath);
          }

          promise.then((ctx) => {
            $(element).attr(attributeName, `${filePath}.${ctx.extension}`);
            this.cb(null);
            return ctx;
          }).catch((error) => {
            this.logs.addLog(`An error occurred during the page download process: '${this.link}' Error: ${error}`);
            this.cb(error);
            throw error;
          });

          contentPromises.push(promise);
        };

        $('img').each((index, element) => processElement(element, 'src', 'image'));
        $('script').each((index, element) => processElement(element, 'src'));
        $('link').each((index, element) => processElement(element, 'href', 'style'));

        return Promise.all(contentPromises).then(() => $.html()).catch((error) => {
          throw error;
        });
      })
      .then((updatedHtml) => {
        this.logs.addLog(`The page content was saved successfully: '${this.link}'`);
        this.saveHTML(updatedHtml);
      })
      .catch((error) => {
        this.logs.addLog(`An error occurred while uploading the page content: '${this.link}' Error: ${error}`);
        throw error;
      });
  }

  async downloadPage() {
    this.logs.addLog(`The page ${this.link} has started loading.`);

    const convertLink = funcs.convertLinkToFileName(this.link);
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
            throw error;
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
      throw error;
    });
  }

  async saveHTML(content) {
    try {
      const formattedHtml = await prettier.format(content, {
        parser: 'html',
      });
      const normalizedHtml = formattedHtml.replace(/\\/g, '/');
      await fsp.writeFile(this.htmlPath, normalizedHtml);
      this.logs.addLog(`The HTML was saved successfully: '${this.link}'`);
    } catch (error) {
      this.logs.addLog(`An error occurred during the html saved process: '${this.link}' Error: ${error.message}`);
      console.error(`Failed to write file: ${error.message}`);
      throw error;
    }
  }
}

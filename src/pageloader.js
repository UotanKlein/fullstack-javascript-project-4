import Listr from 'listr';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import cheerio from 'cheerio';
import path from 'path';
import prettier from 'prettier';
import Logs from './logs.js';
import funcs from './func.js';

export default class PageLoader {
  constructor(link, outputPath, cb = (error, exit = false) => {
    if (error) {
      console.error(error.message);
      if (exit) {
        process.exit(1);
      } else {
        throw error;
      }
    }
  }) {
    this.link = link;
    this.outputPath = outputPath;
    this.cb = cb;
    this.logs = new Logs(outputPath);

    if (!funcs.isValidUrl(this.link)) {
      throw new Error('Invalid link');
    }
  }

  setCB(cb) {
    this.cb = cb;
  }

  readHTML() {
    const htmlPromise = axios.get(this.link).then((res) => {
      this.cb(null);
      return res.data;
    })
      .catch((error) => {
        this.cb(error);
      });
    this.htmlPromise = htmlPromise;
    return htmlPromise;
  }

  downloadAndSave(url, savePath) {
    const tasks = new Listr([
      {
        title: `Downloading Web Asset from ${url}`,
        task: (ctx, task) => axios.get(url)
          .then((response) => {
            if (response.status !== 200) {
              throw new Error('The response status is not equal to 200');
            }

            const contentType = response.headers['content-type'];
            let extension;
            if (contentType) {
              extension = funcs.getExtensionByContentType(contentType);
            } else {
              extension = funcs.getFileExtension(url);
            }
            ctx.extension = extension;

            return fsp.writeFile(path.join(this.outputPath, `${savePath}.${extension}`), response.data);
          })
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Web asset downloaded successfully from ${url}`;
            this.logs.addLog(`Web asset was uploaded successfully from '${url}'`);
          })
          .catch((error) => {
            this.logs.addLog(`An error occurred while uploading the web asset from '${url}' Error: ${error.message}`);
            this.cb(error);
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
      this.cb(error);
    });
  }

  downloadAndSaveBinary(url, imagePath) {
    const dirPath = path.dirname(imagePath);
    console.log(url);
    const tasks = new Listr([
      {
        title: `Downloading image from ${url}`,
        task: (ctx, task) => funcs.ensureDirExists(path.join(this.outputPath, dirPath))
          .then(() => axios.get(url, { responseType: 'stream' }))
          .then((response) => {
            const contentType = response.headers['content-type'];
            let extension;
            if (contentType) {
              extension = funcs.getExtensionByContentType(contentType);
            } else {
              extension = funcs.getFileExtension(url);
            }
            ctx.extension = extension;

            return funcs.pipelinePromise(response.data, fs.createWriteStream(path.join(this.outputPath, `${imagePath}.${extension}`)));
          })
          .then(() => {
            this.logs.addLog(`Image was uploaded successfully from '${url}'`);
            // eslint-disable-next-line no-param-reassign
            task.title = `Image downloaded successfully from ${url}`;
          })
          .catch((error) => {
            this.logs.addLog(`An error occurred while uploading the image from '${url}' Error: ${error.message}`);
            // eslint-disable-next-line no-param-reassign
            task.title = `Failed to download image from ${url}`;
            this.cb(error);
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
      this.cb(error);
    });
  }

  downloadContent() {
    return this.htmlPromise
      .then((content) => {
        const $ = cheerio.load(content);
        const contentPromises = [];

        fsp.mkdir(path.join(this.outputPath, this.contentPath), { recursive: true });

        const processElement = (element, attributeName, resourceType = 'default') => {
          const url = $(element).attr(attributeName);
          const pathNameUrl = funcs.getAbsolute(url, this.link);

          if (!url || !funcs.compareDomainAndSubdomains(this.link, pathNameUrl)) return;

          const splitUrl = pathNameUrl.split('.');
          splitUrl.pop();
          const fileName = `${funcs.convertLinkToFileName(splitUrl.join('.'))}`;
          const filePath = path.join(this.contentPath, fileName);

          let promise;
          if (resourceType === 'image') {
            promise = this.downloadAndSaveBinary(pathNameUrl, filePath);
          } else {
            promise = this.downloadAndSave(pathNameUrl, filePath);
          }

          promise.then((ctx) => {
            $(element).attr(attributeName, `${filePath}.${ctx.extension}`);
            return ctx;
          }).catch((error) => {
            this.cb(error);
          });

          contentPromises.push(promise);
        };

        $('img').each((index, element) => processElement(element, 'src', 'image'));
        $('script').each((index, element) => processElement(element, 'src'));
        $('link').each((index, element) => processElement(element, 'href', 'style'));

        return Promise.all(contentPromises).then(() => $.html()).catch((error) => {
          this.cb(error);
        });
      })
      .then((updatedHtml) => {
        this.logs.addLog(`The page content was saved successfully: '${this.link}'`);
        return this.saveHTML(updatedHtml);
      })
      .catch((error) => {
        this.logs.addLog(`An error occurred while uploading the page content: '${this.link}' Error: ${error}`);
        this.cb(error);
      });
  }

  downloadPage() {
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
        title: 'Downloading page...',
        task: (ctx, task) => this.readHTML()
          .then((htmlContent) => this.saveHTML(htmlContent))
          .then(() => this.downloadContent())
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Page downloaded successfully from ${this.link}`;
            this.logs.addLog(`Page was successfully downloaded into '${this.htmlPath}'`);

            axios.interceptors.request.eject(this.requestInterceptor);
            axios.interceptors.response.eject(this.responseInterceptor);

            ctx.htmlPath = this.htmlPath;

            this.cb(null);

            return this.logs.saveLogs();
          })
          .catch((error) => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Failed to download page from ${this.link}`;

            this.logs.addLog(`Failed to download page from ${this.link}`);

            this.cb(error);
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
      this.cb(error);
    });
  }

  saveHTML(content) {
    return prettier.format(content, {
      parser: 'html',
      htmlWhitespaceSensitivity: 'ignore',
      printWidth: 120,
      proseWrap: 'never',
      doctype: 'uppercase',
      vueIndentScriptAndStyle: true,
    }).then((convertedHtml) => {
      const normalizedHtml = convertedHtml.replace(/\\/g, '/');
      this.logs.addLog(`The HTML was saved successfully: '${this.link}'`);
      return fsp.writeFile(this.htmlPath, normalizedHtml);
    }).catch((error) => {
      this.logs.addLog(`An error occurred during the html saved process: '${this.link}' Error: ${error.message}`);
      this.cb(error);
    });
  }
}

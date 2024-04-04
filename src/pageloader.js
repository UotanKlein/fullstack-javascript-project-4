import Listr from 'listr';
import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import cheerio from 'cheerio';
import path from 'path';
import prettier from 'prettier';
import debug from 'debug';
import funcs from './func.js';

const log = debug('page-loader');

export default class PageLoader {
  constructor(link, outputPath, cb = (error, status = false) => {
    if (error) {
      if (status) {
        process.exit(1);
      } else {
        console.log(error.message);
        throw error;
      }
    }
  }) {
    this.link = link;
    this.outputPath = outputPath;
    this.cb = cb;

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
            console.log(`fucktype: ${typeof contentType}`);
            console.log(`afafafa: ${contentType === ''}`);
            console.log(`TyTyPE: ${contentType}`);
            if (contentType) {
              extension = funcs.getExtensionByContentType(contentType);
            } else {
              extension = funcs.getFileExtension(url);
            }
            ctx.extension = extension;
            console.log(`HaHeHu: ${url}`);
            console.log(`Aboba: ${response.data}`);
            console.log(`Biba: ${savePath}`);
            console.log(`FFF: ${extension}`);

            return fsp.writeFile(path.join(this.outputPath, `${savePath}.${extension}`), response.data);
          })
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Web asset downloaded successfully from ${url}`;
            log(`Web asset downloaded successfully from ${url}`);
          })
          .catch((error) => {
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
            // eslint-disable-next-line no-param-reassign
            task.title = `Image downloaded successfully from ${url}`;
          })
          .catch((error) => {
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

          const lastPath = pathNameUrl.split('/');
          const lastPath2 = lastPath.at(-1).split('.')[0];
          lastPath.pop();
          lastPath.push(lastPath2);
          console.log(`Gay: ${lastPath.join('/')}`);

          const fileName = `${funcs.convertLinkToFileName(lastPath.join('/'))}`;
          console.log(`Adik: ${this.contentPath}`);
          console.log(`FileName: ${fileName}`);
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
      .then((updatedHtml) => this.saveHTML(updatedHtml))
      .catch((error) => {
        this.cb(error);
      });
  }

  downloadPage() {
    const convertLink = funcs.convertLinkToFileName(this.link);
    this.htmlPath = path.normalize(path.join(this.outputPath, `${convertLink}.html`));
    this.contentPath = `${convertLink}_files`;

    this.requestInterceptor = axios.interceptors.request.use((request) => request, (error) => Promise.reject(error));

    this.responseInterceptor = axios.interceptors.response.use((response) => response, (error) => Promise.reject(error));

    const tasks = new Listr([
      {
        title: 'Downloading page...',
        task: (ctx, task) => this.readHTML()
          .then((htmlContent) => this.saveHTML(htmlContent))
          .then(() => this.downloadContent())
          .then(() => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Page downloaded successfully from ${this.link}`;

            axios.interceptors.request.eject(this.requestInterceptor);
            axios.interceptors.response.eject(this.responseInterceptor);

            ctx.htmlPath = this.htmlPath;

            this.cb(null);
          })
          .catch((error) => {
            // eslint-disable-next-line no-param-reassign
            task.title = `Failed to download page from ${this.link}`;

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
    const prettierOptions = {
      parser: 'html',
      htmlWhitespaceSensitivity: 'ignore',
      printWidth: 60,
    };
    return prettier.format(content, prettierOptions)
      .then((formattedHtml) => {
        const normalizedHtml = formattedHtml.replace(/\\/g, '/');
        return fsp.writeFile(this.htmlPath, normalizedHtml);
      })
      .catch((error) => {
        this.cb(error);
      });
  }
}

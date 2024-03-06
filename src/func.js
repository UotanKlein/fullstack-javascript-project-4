import { pipeline } from 'stream';
import { promisify } from 'util';
import fsp from 'fs/promises';

const funcs = {};

funcs.pipelinePromise = promisify(pipeline);

funcs.getExtensionByContentType = (contentType) => {
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

funcs.compareDomainAndSubdomains = (url1, url2) => {
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

funcs.ensureDirExists = async (dirPath) => Promise.resolve()
  .then(() => fsp.mkdir(dirPath, { recursive: true }))
  .catch((error) => {
    console.error(`Failed to create directory: ${error.message}`);
    process.exit(1);
  });

funcs.getAbsolute = (url, baseUrl) => {
  try {
    const fullUrl = new URL(url, baseUrl);
    return fullUrl.href;
  } catch (error) {
    console.error(`Ошибка при обработке URL: ${error}`);
    return url;
  }
};

funcs.convertLinkToFileName = (link) => {
  const fileName = link.split('?')[0];
  return fileName.replace(/^https?:\/\//, '').replace(/[^\w]/g, '-');
};

export default funcs;

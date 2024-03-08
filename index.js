import PageLoader from './src/pageloader.js';
import path from 'path';

export default async (link, output) => {
  const loader = new PageLoader(link, output);
  loader.downloadPage();
  return path.normalize(loader.htmlPath);
};

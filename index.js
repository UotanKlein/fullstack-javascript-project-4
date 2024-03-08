import PageLoader from './src/pageloader.js';
import path from 'path';

export default async (link, output) => {
  const loader = new PageLoader(link, output);
  try {
    await loader.downloadPage();
  } catch(error) {
    throw error;
  }
  return path.normalize(loader.htmlPath);
};

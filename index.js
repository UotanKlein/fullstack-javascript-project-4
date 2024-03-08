import PageLoader from './src/pageloader.js';
import path from 'path';

export default async (link, output) => {
  const loader = new PageLoader(link, output);
  await loader.downloadPage().catch((error) => {
    console.log('Error')
    process.exit(1);
  })
  return path.normalize(loader.htmlPath);
};

import PageLoader from './src/pageloader.js';

export default (link, output) => {
  const loader = new PageLoader(link, output);
  return loader.downloadPage().catch((error) => {
    loader.cb(error);
  });
};

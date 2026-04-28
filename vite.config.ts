import { defineConfig } from 'vite';

export default defineConfig({
  base: '/arcade/jigsaw/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
  },
  define: {
    __DATA_REPO__: JSON.stringify('queelius/metafunctor-data'),
    __DATA_PATH__: JSON.stringify('jigsaw/'),
    __OAUTH_CLIENT_ID__: JSON.stringify(process.env.GH_OAUTH_CLIENT_ID ?? ''),
  },
});

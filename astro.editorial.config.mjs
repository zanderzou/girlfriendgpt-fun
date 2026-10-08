import config from './astro.config.mjs';
export default {...config,vite:{...config.vite,resolve:{...config.vite?.resolve,preserveSymlinks:true},cacheDir:'.astro/vite-editorial-build'}};

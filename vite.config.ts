import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {localCourseMedia} from './scripts/dev-media';

export default defineConfig(({mode})=>{
  // Native compilation uses our existing isolated service; browser runtimes stay local.
  // Point this at a local Worker to use a separately configured local Docker runner.
  const env=loadEnv(mode,process.cwd(),'BRCLIO_DEV_');
  const apiOrigin=new URL(env.BRCLIO_DEV_API_ORIGIN||'https://edu.brclio.com').origin;
  const proxy={'^/api/run(?:\\?|$)':{target:apiOrigin,changeOrigin:true,configure(proxy:any){
    proxy.on('proxyReq',(upstream:any)=>{
      upstream.setHeader('Origin',apiOrigin);
      upstream.removeHeader('Cookie');
      upstream.removeHeader('Authorization');
    });
  }}};
  return{plugins:[react(),localCourseMedia()],build:{target:'es2022'},server:{port:5173,proxy},preview:{proxy}};
});

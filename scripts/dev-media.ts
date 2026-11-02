import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse,Server} from 'node:http';
import type {Plugin} from 'vite';
import {serveMedia} from '../worker/media';

/** Dev and preview use the same range/stream implementation as the deployed Worker. */
export function localCourseMedia():Plugin {
 const install=(middlewares:{use:(handler:any)=>void},server:Server)=>{
  middlewares.use(async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
   if(!req.url?.startsWith('/api/media/'))return next();
   const address=server.address();if(!address||typeof address==='string')return next();
   const localOrigin=`http://127.0.0.1:${address.port}`,abort=new AbortController();
   res.once('close',()=>abort.abort());
   try{
    const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(new URL(req.url,`http://${req.headers.host||`127.0.0.1:${address.port}`}`),{method:req.method,headers,signal:abort.signal});
    const response=await serveMedia(request,{fetch(assetRequest){
     // Ignore the client-supplied Host when fetching assets; only this local server is used.
     const path=new URL(assetRequest.url).pathname;
     if(!path.startsWith('/content/'))return Promise.resolve(new Response(null,{status:404}));
     return fetch(new URL(path,localOrigin),{method:assetRequest.method,headers:assetRequest.headers,signal:assetRequest.signal});
    }});
    res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));
    if(!response.body){res.end();return;}
    const body=Readable.fromWeb(response.body as any);body.on('error',error=>res.destroy(error));res.once('close',()=>body.destroy());body.pipe(res);
   }catch(error){if(!res.headersSent){res.statusCode=500;res.end('Local media is unavailable.')}else res.destroy(error as Error);}
  });
 };
 return{name:'local-course-media',configureServer(server){install(server.middlewares,server.httpServer!);},configurePreviewServer(server){install(server.middlewares,server.httpServer);}};
}

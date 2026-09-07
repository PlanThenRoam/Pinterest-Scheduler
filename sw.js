const CACHE_NAME='ptr-seller-tools-v28';
const APP_SHELL=['./','./index.html','./oauth-consent.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./core.js?v=28','./workspace.js?v=28','./workspace.css?v=28','./release.json','./master-files.js?v=28','./master-files.css?v=28'];

self.addEventListener('install',event=>{
 self.skipWaiting();
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(url.searchParams.get('demo')==='1')return;
 if(url.pathname.endsWith('/release.json')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 if(request.mode==='navigate'){
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
   const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));return response;
  }).catch(async()=>await caches.match(request)||await caches.match('./index.html'));
  return;
 }
 event.respondWith(fetch(request).then(response=>{
  const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));return response;
 }).catch(()=>caches.match(request)));
});

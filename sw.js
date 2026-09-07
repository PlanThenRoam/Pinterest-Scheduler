const CACHE_NAME='ptr-seller-tools-v35';
const APP_SHELL=['./index.html','./studio.js?v=35','./studio.css?v=35','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ptr-seller-tools-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/release.json')){event.respondWith(fetch(request,{cache:'no-store'}));return;}
 if(request.mode==='navigate'){event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));return;}
 if(APP_SHELL.some(path=>new URL(path,self.location.href).href===url.href))event.respondWith(fetch(request).catch(()=>caches.match(request)));
});

const CACHE_NAME='lefe-finances-v8';

const ARQUIVOS=[
  './',
  './index.html',
  './style.css?v=8',
  './app.js?v=8',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/casal-login.png',
  './assets/leticia-home.png',
  './assets/fernando-home.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(ARQUIVOS))
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(nomes=>Promise.all(nomes.map(nome=>nome!==CACHE_NAME?caches.delete(nome):null)))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com')
  ){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          const copia=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copia));
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response && response.status===200){
          const copia=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(request,copia));
        }
        return response;
      })
      .catch(()=>caches.match(request))
  );
});

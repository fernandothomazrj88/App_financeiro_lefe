const CACHE_NAME='lefe-home-v27-0-2';

const ARQUIVOS=[
  './',
  './index.html',
  './style.css?v=27.0.2',
  './app.js?v=27.0.2',
  './manifest.json?v=27.0.2',
  './assets/icon-192.png?v=27.0.2',
  './assets/icon-512.png?v=27.0.2',
  './assets/casal-login.png',
  './assets/leticia-home.png',
  './assets/fernando-home.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(ARQUIVOS))
      .catch(()=>{})
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(nomes=>Promise.all(
        nomes
          .filter(nome=>nome!==CACHE_NAME)
          .map(nome=>caches.delete(nome))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;

  /*
   * MUITO IMPORTANTE:
   * Nunca interceptar POST/PUT/etc.
   * As chamadas da API do Apps Script são POST.
   */
  if(request.method!=='GET'){
    return;
  }

  const url=new URL(request.url);

  /*
   * Nunca interceptar recursos externos.
   * Isso deixa Google Apps Script / Google Drive
   * conversarem diretamente com o navegador.
   */
  if(url.origin!==self.location.origin){
    return;
  }

  /* Navegação: rede primeiro, cache como fallback. */
  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          if(response && response.ok){
            const copia=response.clone();
            caches.open(CACHE_NAME)
              .then(cache=>cache.put('./index.html',copia))
              .catch(()=>{});
          }
          return response;
        })
        .catch(()=>caches.match('./index.html'))
    );
    return;
  }

  /* Arquivos locais: rede primeiro, cache como fallback. */
  event.respondWith(
    fetch(request,{cache:'no-store'})
      .then(response=>{
        if(response && response.ok){
          const copia=response.clone();
          caches.open(CACHE_NAME)
            .then(cache=>cache.put(request,copia))
            .catch(()=>{});
        }
        return response;
      })
      .catch(()=>caches.match(request))
  );
});

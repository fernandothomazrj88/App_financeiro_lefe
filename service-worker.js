const CACHE_NAME = 'lefe-finances-v6';

const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',

  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/casal-login.png',
  './assets/leticia-home.png',
  './assets/fernando-home.png'
];


/* =========================================
   INSTALAÇÃO
========================================= */

self.addEventListener(
  'install',
  event => {

    self.skipWaiting();

    event.waitUntil(

      caches
        .open(CACHE_NAME)
        .then(cache => {

          return cache.addAll(
            ARQUIVOS
          );

        })

    );

  }
);


/* =========================================
   ATIVAÇÃO
   APAGA TODOS OS CACHES ANTIGOS
========================================= */

self.addEventListener(
  'activate',
  event => {

    event.waitUntil(

      caches
        .keys()
        .then(cacheNames => {

          return Promise.all(

            cacheNames.map(
              cacheName => {

                if (
                  cacheName !== CACHE_NAME
                ) {

                  return caches.delete(
                    cacheName
                  );

                }

              }
            )

          );

        })
        .then(() => {

          return self.clients.claim();

        })

    );

  }
);


/* =========================================
   FETCH
========================================= */

self.addEventListener(
  'fetch',
  event => {

    const request =
      event.request;

    const url =
      new URL(
        request.url
      );


    /*
     * API DO GOOGLE APPS SCRIPT
     *
     * NUNCA usar cache.
     */

    if (
      url.hostname.includes(
        'script.google.com'
      ) ||
      url.hostname.includes(
        'script.googleusercontent.com'
      )
    ) {

      event.respondWith(

        fetch(
          request,
          {
            cache: 'no-store'
          }
        )

      );

      return;

    }


    /*
     * NAVEGAÇÃO / HTML
     *
     * Busca primeiro a versão mais nova.
     */

    if (
      request.mode ===
      'navigate'
    ) {

      event.respondWith(

        fetch(request)

          .then(response => {

            const copia =
              response.clone();


            caches
              .open(CACHE_NAME)
              .then(cache => {

                cache.put(
                  request,
                  copia
                );

              });


            return response;

          })

          .catch(() => {

            return caches.match(
              './index.html'
            );

          })

      );

      return;

    }


    /*
     * CSS / JS / IMAGENS
     *
     * Procura cache, mas atualiza em segundo plano.
     */

    event.respondWith(

      caches
        .match(request)
        .then(cacheResponse => {

          const atualizacao =
            fetch(request)

              .then(networkResponse => {

                if (
                  networkResponse &&
                  networkResponse.status === 200
                ) {

                  const copia =
                    networkResponse.clone();


                  caches
                    .open(CACHE_NAME)
                    .then(cache => {

                      cache.put(
                        request,
                        copia
                      );

                    });

                }


                return networkResponse;

              });


          return (
            cacheResponse ||
            atualizacao
          );

        })

    );

  }
);

// Service Worker for PWA and FCM

const CACHE_NAME = 'personal-assistant-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 설치 이벤트
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache failed:', error);
      })
  );
});

// 활성화 이벤트
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch 이벤트 (캐시 전략)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 캐시에 있으면 캐시에서 반환
        if (response) {
          return response;
        }
        // 없으면 네트워크에서 가져오기
        return fetch(event.request);
      }
    )
  );
});

// FCM 백그라운드 메시지 처리
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  const options = {
    body: 'Push 메시지를 받았습니다.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: '확인',
        icon: '/icons/icon-72.png'
      },
      {
        action: 'close',
        title: '닫기',
        icon: '/icons/icon-72.png'
      }
    ]
  };
  
  // 실제 메시지 데이터가 있는 경우
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('[SW] Push data:', payload);
      
      // 알림 내용 업데이트
      if (payload.notification) {
        options.title = payload.notification.title || '개인 비서 알림';
        options.body = payload.notification.body || options.body;
      }
      
      if (payload.data) {
        options.data = { ...options.data, ...payload.data };
      }
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
    }
  }
  
  options.title = options.title || '개인 비서 알림';
  
  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received:', event);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    // 앱 열기
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // 알림만 닫기
    return;
  } else {
    // 기본 동작: 앱 열기
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
  
  // 클라이언트에게 메시지 전송
  event.waitUntil(
    clients.matchAll().then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({
          type: 'FCM_MESSAGE',
          title: event.notification.title,
          body: event.notification.body
        });
      });
    })
  );
});

// 백그라운드 동기화 (PWA 기능)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // 백그라운드에서 수행할 작업
      console.log('Background sync performed')
    );
  }
});

// 주기적 백그라운드 동기화 (실험적 기능)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic background sync:', event.tag);
  
  if (event.tag === 'weather-check') {
    event.waitUntil(
      // 주기적으로 수행할 작업 (예: 날씨 체크)
      console.log('Periodic weather check performed')
    );
  }
});

console.log('[SW] Service Worker loaded');
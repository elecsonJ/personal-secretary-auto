// Firebase Messaging Service Worker

// Firebase SDK imports
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDOJg47e_S3-sgZJMeYZwSsy-MqS463rc0",
    authDomain: "personal-secretary-auto.firebaseapp.com",
    projectId: "personal-secretary-auto",
    storageBucket: "personal-secretary-auto.firebasestorage.app",
    messagingSenderId: "10792151581",
    appId: "1:10792151581:web:69fc187087a3566f9db4f4",
    measurementId: "G-R4097RRZ9B"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);

// Firebase Messaging 서비스 가져오기
const messaging = firebase.messaging();

// 백그라운드 메시지 처리
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);
    
    const notificationTitle = payload.notification?.title || '개인 비서 알림';
    const notificationOptions = {
        body: payload.notification?.body || '새로운 알림이 있습니다.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100],
        data: payload.data || {},
        tag: payload.data?.type || 'default',
        requireInteraction: true,
        actions: [
            {
                action: 'open',
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
    
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] 알림 클릭:', event);
    
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    } else if (event.action === 'close') {
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
});

console.log('[firebase-messaging-sw.js] Firebase Messaging Service Worker 로드됨');
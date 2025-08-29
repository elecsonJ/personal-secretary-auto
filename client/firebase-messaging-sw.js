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
    console.log('=== [firebase-messaging-sw.js] 백그라운드 메시지 수신 ===');
    console.log('[FULL PAYLOAD]', JSON.stringify(payload, null, 2));
    console.log('[PAYLOAD KEYS]', Object.keys(payload || {}));
    
    // payload.data 상세 분석
    console.log('[DATA EXISTS]', !!payload.data);
    console.log('[DATA CONTENT]', JSON.stringify(payload.data, null, 2));
    console.log('[DATA KEYS]', Object.keys(payload.data || {}));
    
    // 각 필드별 상세 분석
    if (payload.data) {
        for (const [key, value] of Object.entries(payload.data)) {
            console.log(`[DATA.${key.toUpperCase()}]`, value, `(${typeof value})`);
        }
    }
    
    // 다양한 접근 방법 시도
    let notificationTitle = null;
    let notificationBody = null;
    
    // 방법 1: 직접 접근
    if (payload.data?.title) {
        notificationTitle = payload.data.title;
        console.log('[METHOD 1] title found:', notificationTitle);
    }
    
    if (payload.data?.body) {
        notificationBody = payload.data.body;
        console.log('[METHOD 1] body found:', notificationBody);
    }
    
    // 방법 2: hasOwnProperty 확인
    if (payload.data && payload.data.hasOwnProperty('title')) {
        notificationTitle = payload.data['title'];
        console.log('[METHOD 2] title found:', notificationTitle);
    }
    
    if (payload.data && payload.data.hasOwnProperty('body')) {
        notificationBody = payload.data['body'];  
        console.log('[METHOD 2] body found:', notificationBody);
    }
    
    // fallback 설정
    notificationTitle = notificationTitle || '개인 비서 알림 (fallback)';
    notificationBody = notificationBody || '새로운 알림이 있습니다. (fallback)';
    
    console.log('[FINAL] title:', notificationTitle);
    console.log('[FINAL] body:', notificationBody);
    console.log('=== 메시지 처리 완료 ===');
    
    // 메인 스레드로 알림 데이터 전송 (localStorage 저장용)
    const notificationData = {
        id: Date.now(),
        title: notificationTitle,
        body: notificationBody,
        data: payload.data || {},
        timestamp: new Date().toISOString(),
        sent: true
    };
    
    console.log('[STORAGE] 메인 스레드로 알림 데이터 전송:', notificationData);
    
    // 모든 활성 클라이언트에게 메시지 전송
    self.clients.matchAll().then(clients => {
        console.log('[STORAGE] 활성 클라이언트 수:', clients.length);
        clients.forEach((client, index) => {
            console.log(`[STORAGE] 클라이언트 ${index + 1}에게 메시지 전송`);
            client.postMessage({
                type: 'NOTIFICATION_RECEIVED',
                notification: notificationData
            });
        });
    }).catch(error => {
        console.error('[STORAGE] 클라이언트 메시지 전송 실패:', error);
    });
    
    const notificationOptions = {
        body: notificationBody,
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
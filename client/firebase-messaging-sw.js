// Firebase Messaging Service Worker

// IndexedDB 저장 함수
async function saveToIndexedDB(notificationData) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('FCMNotifications', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('notifications')) {
                const store = db.createObjectStore('notifications', { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['notifications'], 'readwrite');
            const store = transaction.objectStore('notifications');
            
            const addRequest = store.add(notificationData);
            
            addRequest.onsuccess = () => {
                // 최대 50개까지만 보관
                const cursorRequest = store.index('timestamp').openCursor(null, 'prev');
                let count = 0;
                const toDelete = [];
                
                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        count++;
                        if (count > 50) {
                            toDelete.push(cursor.value.id);
                        }
                        cursor.continue();
                    } else {
                        // 오래된 항목 삭제
                        toDelete.forEach(id => store.delete(id));
                        resolve();
                    }
                };
            };
            
            addRequest.onerror = () => reject(addRequest.error);
        };
    });
}

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
    const timestamp = new Date().toISOString();
    console.log('=== [firebase-messaging-sw.js] 백그라운드 메시지 수신 ===');
    console.log('[TIMESTAMP]', timestamp);
    console.log('[FULL PAYLOAD]', JSON.stringify(payload, null, 2));
    console.log('[PAYLOAD KEYS]', Object.keys(payload || {}));
    
    // GitHub Actions 여부 감지
    const isFromGitHub = payload.data?.executionId ? true : false;
    console.log('[GITHUB_ACTIONS_MESSAGE]', isFromGitHub);
    if (isFromGitHub) {
        console.log('[EXECUTION_ID]', payload.data.executionId);
        console.log('🚀 [GitHub Actions에서 발송된 메시지 감지됨!]');
    }
    
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
    
    // fallback 설정 (기본값 제거 - 서버에서 전송한 내용만 사용)
    if (!notificationTitle || !notificationBody) {
        console.log('[WARNING] 알림 제목 또는 내용이 없어서 알림을 표시하지 않습니다.');
        return; // 알림을 표시하지 않음
    }
    
    console.log('[FINAL] title:', notificationTitle);
    console.log('[FINAL] body:', notificationBody);
    console.log('=== 메시지 처리 완료 ===');
    
    // Service Worker에서 직접 IndexedDB에 저장
    try {
        const notificationData = {
            id: Date.now(),
            title: notificationTitle,
            body: notificationBody,
            time: new Date().toISOString(),
            timestamp: Date.now(),
            data: payload.data || {},
            source: isFromGitHub ? 'github-actions' : 'manual',
            executionId: payload.data?.executionId || null
        };
        
        // IndexedDB에 직접 저장
        await saveToIndexedDB(notificationData);
        console.log('[INDEXEDDB] 알림 히스토리 저장 완료:', notificationData.title);
        
        // 클라이언트에게도 알림 (UI 업데이트용)
        self.clients.matchAll().then(clients => {
            console.log('[CLIENTS] 활성 클라이언트 수:', clients.length);
            clients.forEach((client, index) => {
                console.log(`[CLIENT ${index + 1}] 알림 데이터 전송`);
                client.postMessage({
                    type: 'NOTIFICATION_RECEIVED',
                    notification: notificationData
                });
            });
        });
        
    } catch (error) {
        console.error('[STORAGE] 알림 저장 실패:', error);
    }
    
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
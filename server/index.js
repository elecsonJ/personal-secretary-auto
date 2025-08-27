const admin = require('firebase-admin');
const cron = require('node-cron');
const fetch = require('node-fetch');
require('dotenv').config();

// Firebase Admin SDK 초기화
let serviceAccount = {};
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountString) {
        console.log('원본 서비스 계정 정보 길이:', serviceAccountString.length);
        console.log('원본 첫 20자:', serviceAccountString.substring(0, 20));
        
        // Base64 디코딩 시도
        let jsonString = serviceAccountString;
        
        // Base64로 인코딩된 경우 디코딩 (여러 방법 시도)
        if (!serviceAccountString.startsWith('{')) {
            let decodingSuccess = false;
            
            // 방법 1: 표준 Base64 디코딩
            try {
                jsonString = Buffer.from(serviceAccountString, 'base64').toString('utf-8');
                console.log('표준 Base64 디코딩 성공, 길이:', jsonString.length);
                decodingSuccess = true;
            } catch (decodeError) {
                console.log('표준 Base64 디코딩 실패:', decodeError.message);
            }
            
            // 방법 2: URL-safe Base64 디코딩 시도
            if (!decodingSuccess) {
                try {
                    const urlSafeFixed = serviceAccountString.replace(/-/g, '+').replace(/_/g, '/');
                    // Base64 패딩 추가
                    const paddedBase64 = urlSafeFixed + '='.repeat(4 - (urlSafeFixed.length % 4));
                    jsonString = Buffer.from(paddedBase64, 'base64').toString('utf-8');
                    console.log('URL-safe Base64 디코딩 성공, 길이:', jsonString.length);
                    decodingSuccess = true;
                } catch (decodeError) {
                    console.log('URL-safe Base64 디코딩 실패:', decodeError.message);
                }
            }
            
            // 방법 3: 원본 문자열 그대로 사용
            if (!decodingSuccess) {
                console.log('Base64 디코딩 모두 실패, 원본 사용');
                jsonString = serviceAccountString;
            }
            
            if (decodingSuccess) {
                console.log('디코딩된 첫 200자:', jsonString.substring(0, 200));
                
                // 위치 167 주변 문자 분석
                if (jsonString.length > 167) {
                    console.log('위치 160-180 문자들:', JSON.stringify(jsonString.substring(160, 180)));
                    console.log('위치 167 문자:', JSON.stringify(jsonString.charAt(167)), '(코드:', jsonString.charCodeAt(167), ')');
                }
            }
        }
        
        console.log('JSON 파싱 시도...');
        
        // JSON 문자열 정리 (일반적인 문제들 해결)
        let cleanedJson = jsonString
            .trim()  // 앞뒤 공백 제거
            .replace(/\r\n/g, '\\n')  // Windows 줄바꿈을 JSON 이스케이프로 변환
            .replace(/\r/g, '\\n')    // Mac 줄바꿈을 JSON 이스케이프로 변환  
            .replace(/\n/g, '\\n')    // Unix 줄바꿈을 JSON 이스케이프로 변환
            .replace(/\u0000/g, ''); // null 문자 제거
        
        // BOM (Byte Order Mark) 제거
        if (cleanedJson.charCodeAt(0) === 0xFEFF) {
            cleanedJson = cleanedJson.slice(1);
        }
        
        console.log('정리된 JSON 첫 200자:', cleanedJson.substring(0, 200));
        
        // JSON 파싱 시도 (여러 방법)
        try {
            serviceAccount = JSON.parse(cleanedJson);
            console.log('첫 번째 파싱 시도 성공');
        } catch (firstError) {
            console.log('첫 번째 파싱 실패:', firstError.message);
            
            // 두 번째 시도: 잠재적인 escape 문자 문제 해결
            try {
                const doubleEscapedFixed = cleanedJson.replace(/\\\\/g, '\\');
                serviceAccount = JSON.parse(doubleEscapedFixed);
                console.log('두 번째 파싱 시도 성공 (escape 문자 수정)');
            } catch (secondError) {
                console.log('두 번째 파싱 실패:', secondError.message);
                throw secondError; // 원래 오류를 다시 던짐
            }
        }
        
        // private_key의 \\n을 실제 줄바꿈으로 변환
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
        console.log('Firebase Admin SDK 초기화 완료');
    } else {
        console.log('Firebase 서비스 계정 정보가 없습니다.');
    }
} catch (error) {
    console.error('Firebase 초기화 오류:', error.message);
    if (error.message.includes('position')) {
        console.error('파싱 오류 위치 정보:', error.message);
        
        // 문제가 있는 위치의 문자들을 16진수로 출력
        const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (serviceAccountString && !serviceAccountString.startsWith('{')) {
            try {
                const decoded = Buffer.from(serviceAccountString, 'base64').toString('utf-8');
                const match = error.message.match(/position (\d+)/);
                if (match) {
                    const pos = parseInt(match[1]);
                    console.error(`위치 ${pos} 주변 문자들 (16진수):`);
                    for (let i = Math.max(0, pos - 10); i < Math.min(decoded.length, pos + 10); i++) {
                        const char = decoded.charAt(i);
                        const hex = decoded.charCodeAt(i).toString(16).padStart(2, '0');
                        console.error(`${i}: '${char}' (0x${hex})`);
                    }
                }
            } catch (decodeError) {
                console.error('디코딩 실패로 16진수 분석 불가:', decodeError.message);
            }
        }
    }
    console.error('환경변수 확인:', process.env.FIREBASE_SERVICE_ACCOUNT ? 
        `길이: ${process.env.FIREBASE_SERVICE_ACCOUNT.length}, 시작: ${process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 50)}...` : 
        '환경변수 없음');
}

// 기상청 API 설정
const KMA_API_KEY = 'q2PPa91pEMEbSn/7uPqM667GCdh5o9IjlxtTwfivd3vvnNB8uAFyUcn6KvGaV5aWhRLmo0NHEV8U1sK7UC8Tyw==';
const KMA_BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

// NYT API 설정
const NYT_API_KEY = process.env.NYT_API_KEY;
const NYT_BASE_URL = 'https://api.nytimes.com/svc';

// Notion API 설정
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_CALENDAR_DB_ID = process.env.NOTION_CALENDAR_DB_ID; // 월간 데이터베이스
const NOTION_TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID; // 공부 우선순위 데이터베이스

// 서울 좌표
const SEOUL_COORDS = { nx: 55, ny: 127 };

// 이전 날씨 데이터 저장
let lastWeatherCheck = null;
const WEATHER_CHANGE_THRESHOLD = 20;

// FCM 토큰들 (멀티 기기 지원)
const FCM_TOKENS = [
    process.env.FCM_TOKEN_MACBOOK,
    process.env.FCM_TOKEN_IPHONE,
    process.env.FCM_TOKEN // 기존 호환성
].filter(token => token && token !== 'temporary-token-will-be-replaced');

// 날씨 API 호출
async function getWeatherData() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        
        // 기상청 API 업데이트 시간
        const availableHours = ['02', '05', '08', '11', '14', '17', '20', '23'];
        let baseTime = '02';
        
        for (let i = availableHours.length - 1; i >= 0; i--) {
            if (hour >= availableHours[i]) {
                baseTime = availableHours[i];
                break;
            }
        }
        
        let baseDate = `${year}${month}${day}`;
        if (hour < '02') {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            baseDate = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
            baseTime = '23';
        }
        
        const params = new URLSearchParams({
            serviceKey: KMA_API_KEY,
            numOfRows: 60,
            pageNo: 1,
            dataType: 'JSON',
            base_date: baseDate,
            base_time: baseTime + '00',
            nx: SEOUL_COORDS.nx,
            ny: SEOUL_COORDS.ny
        });

        const response = await fetch(`${KMA_BASE_URL}/getVilageFcst?${params}`);
        const data = await response.json();
        
        if (data.response.header.resultCode !== '00') {
            throw new Error(`API Error: ${data.response.header.resultMsg}`);
        }
        
        return parseWeatherData(data.response.body.items.item);
        
    } catch (error) {
        console.error('날씨 데이터 가져오기 실패:', error);
        return null;
    }
}

// 날씨 데이터 파싱
function parseWeatherData(items) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10).replace(/-/g, '');
    const todayItems = items.filter(item => item.fcstDate === today);
    
    const rainItems = todayItems.filter(item => item.category === 'POP');
    const tempItems = todayItems.filter(item => item.category === 'TMP');
    
    const currentRainItem = rainItems[0];
    const currentTempItem = tempItems[0];
    
    return {
        rainProbability: currentRainItem ? `${currentRainItem.fcstValue}%` : '0%',
        temperature: currentTempItem ? `${currentTempItem.fcstValue}°C` : 'N/A',
        hasRain: currentRainItem ? parseInt(currentRainItem.fcstValue) > 30 : false,
        timestamp: new Date().toISOString()
    };
}

// NYT Top Stories API 호출
async function getNYTTopStories() {
    if (!NYT_API_KEY) {
        console.log('NYT API 키가 없습니다.');
        return [];
    }
    
    try {
        const response = await fetch(`${NYT_BASE_URL}/topstories/v2/world.json?api-key=${NYT_API_KEY}`);
        const data = await response.json();
        
        if (response.ok) {
            // 상위 3개 기사만 선택
            return data.results.slice(0, 3).map(article => ({
                title: article.title,
                abstract: article.abstract,
                url: article.url,
                published: article.published_date
            }));
        } else {
            console.error('NYT API 오류:', data.fault?.faultstring || 'Unknown error');
            return [];
        }
        
    } catch (error) {
        console.error('NYT 데이터 가져오기 실패:', error);
        return [];
    }
}

// 실제 Notion API 호출
async function getNotionData() {
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID || !NOTION_TASKS_DB_ID) {
        console.log('Notion API 정보가 없습니다. 모의 데이터 사용.');
        return getMockNotionData();
    }
    
    try {
        const today = new Date().toISOString().slice(0, 10);
        
        // 1. 월간 데이터베이스에서 오늘 일정 가져오기
        const calendarResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_CALENDAR_DB_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                filter: {
                    and: [
                        {
                            property: '날짜', // 날짜 속성 이름 (한글)
                            date: {
                                equals: today
                            }
                        }
                    ]
                }
            })
        });
        
        const calendarData = await calendarResponse.json();
        
        // 2. 공부 우선순위 데이터베이스에서 HIGH/Middle 우선순위 태스크 가져오기  
        const tasksResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_TASKS_DB_ID}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                filter: {
                    or: [
                        {
                            property: 'Status', // 상태 속성 이름 (실제로는 Status)
                            status: {
                                equals: 'HIGH'
                            }
                        },
                        {
                            property: 'Status',
                            status: {
                                equals: 'Middle'
                            }
                        }
                    ]
                }
            })
        });
        
        const tasksData = await tasksResponse.json();
        
        // 데이터 가공
        const todayEvents = calendarData.results?.map(page => ({
            name: page.properties.이름?.title?.[0]?.plain_text || '제목 없음', // 한글 속성명
            date: today,
            type: 'event'
        })) || [];
        
        const highMiddleTasks = tasksData.results?.map(page => ({
            name: page.properties.Name?.title?.[0]?.plain_text || '제목 없음',
            priority: page.properties.Status?.status?.name || 'Unknown' // status 속성 사용
        })) || [];
        
        console.log(`Notion 데이터 로드: 일정 ${todayEvents.length}개, 우선순위 태스크 ${highMiddleTasks.length}개`);
        
        return { todayEvents, highMiddleTasks };
        
    } catch (error) {
        console.error('Notion API 오류:', error.message);
        return getMockNotionData();
    }
}

// 노션 모의 데이터 (fallback용)
function getMockNotionData() {
    const today = new Date().toISOString().slice(0, 10);
    
    // 캘린더 이벤트
    const calendarEvents = [
        { name: '회식?', date: '2025-08-27', type: 'social' },
        { name: 'AI보안특강', date: '2025-09-03', type: 'lecture' }
    ];
    
    // 우선순위 태스크
    const priorityTasks = [
        { name: '블로그수익화', status: 'Middle', priority: 'Middle' },
        { name: '백준17352유니온파인드구현', status: 'low', priority: 'low' }
    ];
    
    const todayEvents = calendarEvents.filter(event => event.date === today);
    const highMiddleTasks = priorityTasks.filter(task => 
        task.priority === 'HIGH' || task.priority === 'Middle'
    );
    
    return { todayEvents, highMiddleTasks };
}

// FCM 푸시 알림 전송 (멀티 기디)
async function sendPushNotification(title, body, data = {}) {
    console.log('=== FCM 디버깅 정보 ===');
    console.log('FCM_TOKENS 개수:', FCM_TOKENS.length);
    console.log('FCM_TOKENS 내용:', FCM_TOKENS.map(token => token ? token.substring(0, 20) + '...' : 'null'));
    console.log('Firebase Admin Apps 개수:', admin.apps.length);
    console.log('환경 변수 체크:');
    console.log('- FCM_TOKEN_MACBOOK:', process.env.FCM_TOKEN_MACBOOK ? process.env.FCM_TOKEN_MACBOOK.substring(0, 20) + '...' : 'undefined');
    console.log('- FCM_TOKEN_IPHONE:', process.env.FCM_TOKEN_IPHONE ? process.env.FCM_TOKEN_IPHONE.substring(0, 20) + '...' : 'undefined');
    console.log('- FCM_TOKEN:', process.env.FCM_TOKEN ? process.env.FCM_TOKEN.substring(0, 20) + '...' : 'undefined');
    console.log('=======================');
    
    if (FCM_TOKENS.length === 0 || !admin.apps.length) {
        console.log('FCM 설정이 없습니다. 알림 시뮬레이션:', { title, body });
        return;
    }
    
    const results = [];
    
    for (const token of FCM_TOKENS) {
        try {
            const message = {
                notification: {
                    title: title,
                    body: body
                },
                data: data,
                token: token
            };
            
            const response = await admin.messaging().send(message);
            console.log(`푸시 알림 전송 성공 (${token.substring(0, 20)}...):`, response);
            results.push({ success: true, token: token.substring(0, 20), response });
            
        } catch (error) {
            console.error(`푸시 알림 전송 실패 (${token.substring(0, 20)}...):`, error.message);
            results.push({ success: false, token: token.substring(0, 20), error: error.message });
        }
    }
    
    console.log(`총 ${FCM_TOKENS.length}개 기기에 알림 전송 완료`);
    return results;
}

// 날씨 변화 감지 및 알림
async function checkWeatherChanges() {
    try {
        const currentWeather = await getWeatherData();
        if (!currentWeather) return;
        
        console.log('현재 날씨:', currentWeather);
        
        if (lastWeatherCheck) {
            const prevRain = parseInt(lastWeatherCheck.rainProbability.replace('%', ''));
            const currentRain = parseInt(currentWeather.rainProbability.replace('%', ''));
            const change = Math.abs(currentRain - prevRain);
            
            if (change >= WEATHER_CHANGE_THRESHOLD) {
                const direction = currentRain > prevRain ? '증가' : '감소';
                const emoji = direction === '증가' ? '☔⚠️' : '☀️✨';
                
                await sendPushNotification(
                    `${emoji} 날씨 급변 알림`,
                    `강수확률이 ${change}% ${direction}했습니다!\n` +
                    `이전: ${lastWeatherCheck.rainProbability}\n` +
                    `현재: ${currentWeather.rainProbability}\n` +
                    `온도: ${currentWeather.temperature}`,
                    { type: 'weather_urgent' }
                );
            }
        }
        
        lastWeatherCheck = currentWeather;
        
    } catch (error) {
        console.error('날씨 변화 감지 오류:', error);
    }
}

// 아침 브리핑 알림
async function sendMorningBriefing() {
    try {
        const weather = await getWeatherData();
        const { todayEvents, highMiddleTasks } = await getNotionData();
        const topStories = await getNYTTopStories();
        
        // 1. 날씨 브리핑 (간결하게)
        let weatherMessage = '';
        if (weather) {
            weatherMessage = `🌡️ ${weather.temperature} `;
            weatherMessage += weather.hasRain 
                ? `☔ ${weather.rainProbability} 🌂 우산 필요` 
                : `☀️ 맑음`;
        } else {
            weatherMessage = '날씨 정보 없음';
        }
        
        await sendPushNotification('🌅 날씨 브리핑', weatherMessage, { type: 'weather_daily' });
        
        // 0.5초 후 캘린더 알림 (간결하게)
        setTimeout(async () => {
            let calendarMessage = '';
            if (todayEvents.length === 0) {
                calendarMessage = '일정 없음 😊';
            } else {
                todayEvents.forEach((event, index) => {
                    const emoji = event.type === 'social' ? '🍻' : '📚';
                    calendarMessage += `${emoji} ${event.name}${index < todayEvents.length - 1 ? '\n' : ''}`;
                });
            }
            
            await sendPushNotification('📅 오늘 일정', calendarMessage, { type: 'task_daily' });
        }, 500);
        
        // 1초 후 우선순위 태스크 알림 (간결하게)
        setTimeout(async () => {
            let taskMessage = '';
            if (highMiddleTasks.length === 0) {
                taskMessage = '우선순위 태스크 없음 😌';
            } else {
                highMiddleTasks.forEach((task, index) => {
                    const emoji = task.priority === 'HIGH' ? '🔴' : '🟡';
                    taskMessage += `${emoji} ${task.name}${index < highMiddleTasks.length - 1 ? '\n' : ''}`;
                });
            }
            
            await sendPushNotification('🎯 우선순위 태스크', taskMessage, { type: 'task_urgent' });
        }, 1000);
        
        // 1.5초 후 뉴스 브리핑
        setTimeout(async () => {
            let newsMessage = '';
            if (topStories.length === 0) {
                newsMessage = '뉴스 정보 없음';
            } else {
                newsMessage = topStories.slice(0, 2).map((story, index) => 
                    `${index + 1}. ${story.title}`
                ).join('\n');
            }
            
            await sendPushNotification('📰 주요 뉴스', newsMessage, { type: 'news_daily' });
        }, 1500);
        
    } catch (error) {
        console.error('아침 브리핑 오류:', error);
    }
}

// 저녁 내일 준비 알림
async function sendEveningPrep() {
    try {
        const { todayEvents, highMiddleTasks } = await getNotionData();
        
        // 내일 캘린더 일정
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        
        // 임시로 내일 이벤트는 빈 배열로 처리
        const tomorrowEvents = [];
        
        let tomorrowMessage = '';
        if (tomorrowEvents.length === 0) {
            tomorrowMessage = '내일 일정 없음 😊';
        } else {
            tomorrowEvents.forEach((event, index) => {
                const emoji = event.type === 'social' ? '🍻' : '📚';
                tomorrowMessage += `${emoji} ${event.name}${index < tomorrowEvents.length - 1 ? '\n' : ''}`;
            });
        }
        
        await sendPushNotification('🗓️ 내일 일정', tomorrowMessage, { type: 'task_daily' });
        
        // 0.5초 후 남은 우선순위 작업 알림
        setTimeout(async () => {
            let remainingMessage = '🌆 오늘 남은 우선순위 작업';
            if (highMiddleTasks.length === 0) {
                remainingMessage += '\n\n우선순위 작업이 모두 완료되었습니다!\n내일을 위해 정리하고 푹 쉬세요! 🛌';
            } else {
                remainingMessage += `\n\n아직 ${highMiddleTasks.length}개의 우선순위 작업이 남아있습니다.\n내일을 위해 정리하고 푹 쉬세요! 🛌`;
            }
            
            await sendPushNotification('🌆 오늘 남은 우선순위 작업', remainingMessage, { type: 'task_daily' });
        }, 500);
        
    } catch (error) {
        console.error('저녁 준비 알림 오류:', error);
    }
}

// 크론 작업 설정
function setupCronJobs() {
    // 3시간마다 날씨 변화 감지
    cron.schedule('0 */3 * * *', () => {
        console.log('날씨 변화 감지 실행:', new Date().toISOString());
        checkWeatherChanges();
    });
    
    // 매일 오전 7시 아침 브리핑
    cron.schedule('0 7 * * *', () => {
        console.log('아침 브리핑 실행:', new Date().toISOString());
        sendMorningBriefing();
    });
    
    // 매일 오후 9시 저녁 내일 준비
    cron.schedule('0 21 * * *', () => {
        console.log('저녁 준비 알림 실행:', new Date().toISOString());
        sendEveningPrep();
    });
}

// 서버 시작
const PORT = process.env.PORT || 3000;

// 헬스체크 엔드포인트
if (require.main === module) {
    const http = require('http');
    
    const server = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                lastWeatherCheck: lastWeatherCheck ? lastWeatherCheck.timestamp : null
            }));
        } else if (req.url === '/test-notifications') {
            // 테스트용 엔드포인트
            sendMorningBriefing();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Test notifications sent');
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    
    server.listen(PORT, () => {
        console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log('크론 작업이 설정되었습니다.');
        setupCronJobs();
        
        // 서버 시작 시 초기 날씨 체크
        setTimeout(() => {
            console.log('초기 날씨 데이터 로드 중...');
            checkWeatherChanges();
        }, 5000);
    });
}

module.exports = {
    sendPushNotification,
    checkWeatherChanges,
    sendMorningBriefing,
    sendEveningPrep,
    getWeatherData
};
const admin = require('firebase-admin');
const cron = require('node-cron');
const fetch = require('node-fetch');
require('dotenv').config();

// Firebase Admin SDK 초기화
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (Object.keys(serviceAccount).length > 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
    });
}

// 기상청 API 설정
const KMA_API_KEY = 'q2PPa91pEMEbSn/7uPqM667GCdh5o9IjlxtTwfivd3vvnNB8uAFyUcn6KvGaV5aWhRLmo0NHEV8U1sK7UC8Tyw==';
const KMA_BASE_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

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

// 노션 모의 데이터 (실제로는 Notion API 호출)
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

// FCM 푸시 알림 전송 (멀티 기기)
async function sendPushNotification(title, body, data = {}) {
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
        const { todayEvents, highMiddleTasks } = getMockNotionData();
        
        // 1. 날씨 브리핑
        let weatherMessage = '🌅 좋은 아침입니다!\n\n🌤️ 서울 오늘의 날씨\n';
        if (weather) {
            weatherMessage += `🌡️ ${weather.temperature}\n`;
            weatherMessage += weather.hasRain 
                ? `☔ 강수확률: ${weather.rainProbability}\n🌂 우산을 챙기세요!` 
                : `☀️ 맑은 날씨입니다!`;
        } else {
            weatherMessage += '날씨 정보를 가져올 수 없습니다.';
        }
        
        await sendPushNotification('🌅 날씨 브리핑', weatherMessage, { type: 'weather_daily' });
        
        // 0.5초 후 캘린더 알림
        setTimeout(async () => {
            let calendarMessage = '📅 오늘 일정';
            if (todayEvents.length === 0) {
                calendarMessage += '\n\n오늘은 일정이 없습니다.\n여유로운 하루를 보내세요! 😊';
            } else {
                calendarMessage += ` (${todayEvents.length}개)\n\n`;
                todayEvents.forEach(event => {
                    const emoji = event.type === 'social' ? '🍻' : '📚';
                    calendarMessage += `${emoji} ${event.name}\n`;
                });
            }
            
            await sendPushNotification('📅 오늘 일정 알림', calendarMessage, { type: 'task_daily' });
        }, 500);
        
        // 1초 후 우선순위 태스크 알림
        setTimeout(async () => {
            let taskMessage = '🎯 우선순위 태스크';
            if (highMiddleTasks.length === 0) {
                taskMessage += '\n\n오늘은 HIGH, Middle 우선순위 태스크가 없습니다.\n여유로운 하루를 보내세요! 😌';
            } else {
                taskMessage += ` (${highMiddleTasks.length}개)\n\n`;
                highMiddleTasks.forEach(task => {
                    const emoji = task.priority === 'HIGH' ? '🔴' : '🟡';
                    taskMessage += `${emoji} ${task.name}\n`;
                });
            }
            
            await sendPushNotification('🎯 우선순위 태스크 알림', taskMessage, { type: 'task_urgent' });
        }, 1000);
        
    } catch (error) {
        console.error('아침 브리핑 오류:', error);
    }
}

// 저녁 내일 준비 알림
async function sendEveningPrep() {
    try {
        const { todayEvents, highMiddleTasks } = getMockNotionData();
        
        // 내일 캘린더 일정
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        
        // 임시로 내일 이벤트는 빈 배열로 처리
        const tomorrowEvents = [];
        
        let tomorrowMessage = '🗓️ 내일 일정';
        if (tomorrowEvents.length === 0) {
            tomorrowMessage += '\n\n내일은 일정이 없습니다.\n여유로운 하루를 준비하세요! 😊';
        } else {
            tomorrowMessage += ` (${tomorrowEvents.length}개)\n\n`;
            // 내일 이벤트 처리 로직
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
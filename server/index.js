const admin = require('firebase-admin');
const cron = require('node-cron');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
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
const WEATHER_CHANGE_THRESHOLD = 20; // 기본 임계값

// 상황별 임계값 계산
function getAdaptiveThreshold(prevRain, currentRain) {
    const prev = parseInt(prevRain.replace('%', ''));
    const curr = parseInt(currentRain.replace('%', ''));
    
    // 맑음→비 상황 (중요!)
    if (prev < 20 && curr > 40) return 15;
    
    // 비→맑음 상황 (외출 계획에 중요!)
    if (prev > 60 && curr < 30) return 20;
    
    // 폭우 관련 (80% 이상)
    if (Math.max(prev, curr) > 80) return 10;
    
    // 미세 변화 (둘 다 낮은 확률)
    if (Math.max(prev, curr) < 30) return 25;
    
    // 기본값
    return WEATHER_CHANGE_THRESHOLD;
}

// FCM 토큰들 (멀티 기기 지원)
const RAW_TOKENS = [
    process.env.FCM_TOKEN_MACBOOK,
    process.env.FCM_TOKEN_IPHONE
].filter(token => token && token !== 'temporary-token-will-be-replaced');

// 토큰 중복 체크 및 제거
const FCM_TOKENS = [...new Set(RAW_TOKENS)];

// 중복 토큰 경고
if (RAW_TOKENS.length !== FCM_TOKENS.length) {
    console.warn('⚠️ 중복된 FCM 토큰이 발견되었습니다!');
    console.warn(`원본 토큰 수: ${RAW_TOKENS.length}, 고유 토큰 수: ${FCM_TOKENS.length}`);
    
    // 어떤 토큰이 중복인지 확인
    if (process.env.FCM_TOKEN_MACBOOK === process.env.FCM_TOKEN_IPHONE) {
        console.warn('FCM_TOKEN_MACBOOK과 FCM_TOKEN_IPHONE이 같은 값입니다!');
    }
}

// 알림 내역 저장 (메모리 내 저장, 실제 환경에서는 DB 사용 권장)
let notificationHistory = [];

// 날씨 API 호출
async function getWeatherData() {
    try {
        // 한국 시간 기준으로 계산
        const koreaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const year = koreaTime.getFullYear();
        const month = String(koreaTime.getMonth() + 1).padStart(2, '0');
        const day = String(koreaTime.getDate()).padStart(2, '0');
        const hour = String(koreaTime.getHours()).padStart(2, '0');
        
        console.log(`날씨 API 호출 - 한국시간: ${year}-${month}-${day} ${hour}:00`);
        
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
            const yesterday = new Date(koreaTime);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayYear = yesterday.getFullYear();
            const yesterdayMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
            const yesterdayDay = String(yesterday.getDate()).padStart(2, '0');
            baseDate = `${yesterdayYear}${yesterdayMonth}${yesterdayDay}`;
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

// 날씨 데이터 파싱 (강수 상세정보 추가)
function parseWeatherData(items) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10).replace(/-/g, '');
    const todayItems = items.filter(item => item.fcstDate === today);
    
    // 카테고리별 데이터 추출
    const rainItems = todayItems.filter(item => item.category === 'POP').sort((a, b) => a.fcstTime.localeCompare(b.fcstTime));
    const tempItems = todayItems.filter(item => item.category === 'TMP').sort((a, b) => a.fcstTime.localeCompare(b.fcstTime));
    const maxTempItems = todayItems.filter(item => item.category === 'TMX'); // 일 최고기온
    const minTempItems = todayItems.filter(item => item.category === 'TMN'); // 일 최저기온
    const precipItems = todayItems.filter(item => item.category === 'PCP').sort((a, b) => a.fcstTime.localeCompare(b.fcstTime)); // 시간당 강수량
    const precipTypeItems = todayItems.filter(item => item.category === 'PTY').sort((a, b) => a.fcstTime.localeCompare(b.fcstTime)); // 강수형태
    
    const currentRainItem = rainItems[0];
    const currentTempItem = tempItems[0];
    const maxTempItem = maxTempItems.length > 0 ? maxTempItems[0] : null;
    const minTempItem = minTempItems.length > 0 ? minTempItems[0] : null;
    
    // TMX, TMN이 없는 경우 TMP에서 최고/최저값 계산
    let calculatedMaxTemp = null;
    let calculatedMinTemp = null;
    if (tempItems.length > 0) {
        const temps = tempItems.map(item => parseInt(item.fcstValue));
        calculatedMaxTemp = Math.max(...temps);
        calculatedMinTemp = Math.min(...temps);
    }
    
    // 강수 시간대 분석
    const rainPeriods = [];
    let rainStart = null;
    
    for (let i = 0; i < rainItems.length; i++) {
        const prob = parseInt(rainItems[i].fcstValue);
        const time = rainItems[i].fcstTime;
        const hourMin = `${time.slice(0,2)}:${time.slice(2,4)}`;
        
        if (prob > 30) { // 30% 이상을 비 가능성으로 판단
            if (!rainStart) rainStart = hourMin;
        } else if (rainStart) {
            const prevTime = i > 0 ? rainItems[i-1].fcstTime : time;
            const prevHourMin = `${prevTime.slice(0,2)}:${prevTime.slice(2,4)}`;
            rainPeriods.push({ start: rainStart, end: prevHourMin });
            rainStart = null;
        }
    }
    
    // 마지막 구간 처리
    if (rainStart) {
        const lastTime = rainItems[rainItems.length - 1].fcstTime;
        const lastHourMin = `${lastTime.slice(0,2)}:${lastTime.slice(2,4)}`;
        rainPeriods.push({ start: rainStart, end: lastHourMin });
    }
    
    // 강수량 정보 (PCP 카테고리에서)
    let maxPrecip = 0;
    precipItems.forEach(item => {
        const precip = parseFloat(item.fcstValue.replace('mm', '') || 0);
        if (precip > maxPrecip) maxPrecip = precip;
    });
    
    // 강수형태 (PTY: 0=없음, 1=비, 2=비/눈, 3=눈, 5=빗방울, 6=빗방울날림, 7=눈날림)
    const precipTypes = precipTypeItems.map(item => {
        const typeCode = parseInt(item.fcstValue);
        const typeNames = { 0: '', 1: '비', 2: '비/눈', 3: '눈', 5: '빗방울', 6: '빗방울날림', 7: '눈날림' };
        return typeNames[typeCode] || '';
    }).filter(type => type !== '');
    
    return {
        rainProbability: currentRainItem ? `${currentRainItem.fcstValue}%` : '0%',
        temperature: currentTempItem ? `${currentTempItem.fcstValue}°C` : 'N/A',
        maxTemperature: maxTempItem ? `${maxTempItem.fcstValue}°C` : 
                       calculatedMaxTemp ? `${calculatedMaxTemp}°C` : null,
        minTemperature: minTempItem ? `${minTempItem.fcstValue}°C` : 
                       calculatedMinTemp ? `${calculatedMinTemp}°C` : null,
        hasRain: currentRainItem ? parseInt(currentRainItem.fcstValue) > 30 : false,
        rainPeriods: rainPeriods,
        maxPrecipitation: maxPrecip,
        precipitationTypes: precipTypes,
        timestamp: new Date().toISOString()
    };
}

// NYT Top Stories API 호출 (다중 카테고리)
async function getNYTTopStories() {
    if (!NYT_API_KEY) {
        console.log('NYT API 키가 없습니다.');
        return { main: [], tech: [], science: [], business: [] };
    }
    
    try {
        const categories = ['home', 'technology', 'science', 'business'];
        const results = {};
        
        for (const category of categories) {
            try {
                const response = await fetch(`${NYT_BASE_URL}/topstories/v2/${category}.json?api-key=${NYT_API_KEY}`);
                const data = await response.json();
                
                if (response.ok) {
                    results[category] = data.results.slice(0, 5).map(article => ({
                        title: article.title,
                        abstract: article.abstract,
                        url: article.url,
                        published: article.published_date,
                        category: category
                    }));
                } else {
                    console.error(`NYT ${category} API 오류:`, data.fault?.faultstring || 'Unknown error');
                    results[category] = [];
                }
            } catch (error) {
                console.error(`NYT ${category} 데이터 가져오기 실패:`, error);
                results[category] = [];
            }
            
            // API 호출 간격 (rate limit 방지)
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        return {
            main: results.home || [],
            tech: results.technology || [],
            science: results.science || [],
            business: results.business || []
        };
        
    } catch (error) {
        console.error('NYT 전체 데이터 가져오기 실패:', error);
        return { main: [], tech: [], science: [], business: [] };
    }
}

// 실제 Notion API 호출
async function getNotionData() {
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID || !NOTION_TASKS_DB_ID) {
        console.log('Notion API 정보가 없습니다. 모의 데이터 사용.');
        console.log(`NOTION_API_KEY 존재: ${!!NOTION_API_KEY}`);
        console.log(`NOTION_CALENDAR_DB_ID 존재: ${!!NOTION_CALENDAR_DB_ID}`);  
        console.log(`NOTION_TASKS_DB_ID 존재: ${!!NOTION_TASKS_DB_ID}`);
        return getMockNotionData();
    }
    
    try {
        // 한국 시간 기준으로 오늘 날짜 계산
        const koreaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const today = koreaTime.toISOString().slice(0, 10);
        console.log(`Notion API 호출 시작 - 오늘 날짜 (KST): ${today}`);
        
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
                                equals: today  // 오늘 일정만
                            }
                        }
                    ]
                }
            })
        });
        
        const calendarData = await calendarResponse.json();
        console.log(`캘린더 API 응답:`, calendarData.results ? `${calendarData.results.length}개 결과` : '오류', calendarData.code || '');
        
        // API 오류 상세 정보
        if (!calendarData.results) {
            console.error('캘린더 API 전체 응답:', JSON.stringify(calendarData, null, 2));
        }
        
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
        console.log(`태스크 API 응답:`, tasksData.results ? `${tasksData.results.length}개 결과` : '오류', tasksData.code || '');
        
        // API 오류 상세 정보
        if (!tasksData.results) {
            console.error('태스크 API 전체 응답:', JSON.stringify(tasksData, null, 2));
        }
        
        // 모든 태스크의 상태 확인 (디버깅용)
        if (tasksData.results) {
            tasksData.results.slice(0, 5).forEach(task => {
                const name = task.properties.Name?.title?.[0]?.plain_text || '이름없음';
                const status = task.properties.Status?.status?.name || '상태없음';
                console.log(`태스크: ${name} - 상태: ${status}`);
            });
        }
        
        // 데이터 가공 - 캘린더 (오늘 일정만)
        const todayEvents = calendarData.results?.map(page => ({
            name: page.properties.이름?.title?.[0]?.plain_text || '제목 없음', // 한글 속성명
            date: today,
            type: 'event'
        })) || [];
        
        const highMiddleTasks = tasksData.results?.map(page => ({
            name: page.properties.Name?.title?.[0]?.plain_text || '제목 없음',
            priority: page.properties.Status?.status?.name || 'Unknown' // status 속성 사용
        })) || [];
        
        console.log(`Notion 데이터 로드: 오늘 일정 ${todayEvents.length}개, 우선순위 태스크 ${highMiddleTasks.length}개`);
        
        return { todayEvents, highMiddleTasks };
        
    } catch (error) {
        console.error('Notion API 오류:', error.message);
        return getMockNotionData();
    }
}

// 내일 일정 가져오기
async function getTomorrowEvents(tomorrowDate) {
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID) {
        console.log('Notion API 정보가 없습니다. 내일 일정 없음.');
        return [];
    }
    
    try {
        console.log(`내일 일정 조회: ${tomorrowDate}`);
        
        const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_CALENDAR_DB_ID}/query`, {
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
                            property: '날짜',
                            date: {
                                equals: tomorrowDate
                            }
                        }
                    ]
                }
            })
        });
        
        const data = await response.json();
        console.log(`내일 일정 API 응답:`, data.results ? `${data.results.length}개 결과` : '오류');
        
        if (!data.results) {
            console.error('내일 일정 API 오류:', data);
            return [];
        }
        
        const tomorrowEvents = data.results.map(page => ({
            name: page.properties.이름?.title?.[0]?.plain_text || '제목 없음',
            date: tomorrowDate,
            type: 'event'
        }));
        
        return tomorrowEvents;
        
    } catch (error) {
        console.error('내일 일정 가져오기 오류:', error.message);
        return [];
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

// 전역 실행 카운터
let globalExecutionCounter = 0;
let globalPushCounter = 0;

// FCM 푸시 알림 전송 (멀티 기디) + 내역 저장
async function sendPushNotification(title, body, data = {}) {
    const pushId = `push-${Date.now()}`;
    const execId = data.executionId || 'unknown';
    globalPushCounter++;
    
    console.log(`🔔 [${execId}] [${pushId}] "${title}" 알림 전송 시작 (글로벌 푸시 카운터: ${globalPushCounter})`);
    console.log('=== FCM 디버깅 정보 ===');
    console.log('FCM_TOKENS 개수:', FCM_TOKENS.length);
    console.log('고유 토큰 확인:', FCM_TOKENS.map((token, i) => 
        token ? `토큰${i+1}: ${token.substring(0, 10)}...${token.substring(token.length-5)}` : 'null'
    ));
    console.log('Firebase Admin Apps 개수:', admin.apps.length);
    console.log('환경 변수 체크:');
    console.log('- FCM_TOKEN_MACBOOK:', process.env.FCM_TOKEN_MACBOOK ? process.env.FCM_TOKEN_MACBOOK.substring(0, 10) + '...' : 'undefined');
    console.log('- FCM_TOKEN_IPHONE:', process.env.FCM_TOKEN_IPHONE ? process.env.FCM_TOKEN_IPHONE.substring(0, 10) + '...' : 'undefined');
    console.log('실제 전송될 토큰 수:', FCM_TOKENS.length);
    console.log('=======================');
    
    // 알림 내역 저장
    const notification = {
        id: Date.now(),
        title: title,
        body: body,
        data: data,
        timestamp: new Date().toISOString(),
        sent: true
    };
    
    notificationHistory.unshift(notification); // 최신순으로 저장
    
    // 최대 100개까지만 보관 (메모리 관리)
    if (notificationHistory.length > 100) {
        notificationHistory = notificationHistory.slice(0, 100);
    }
    
    if (FCM_TOKENS.length === 0 || !admin.apps.length) {
        console.log('FCM 설정이 없습니다. 알림 시뮬레이션:', { title, body });
        notification.sent = false;
        return;
    }
    
    const results = [];
    
    for (const token of FCM_TOKENS) {
        try {
            const messageData = {
                title: String(title),
                body: String(body),
                type: String(data.type || 'notification'),
                executionId: String(data.executionId || ''),
                timestamp: String(Date.now())
            };
            
            console.log(`📤 [${execId}] 전송할 FCM 메시지 데이터:`, messageData);
            console.log(`🚀 [${execId}] GitHub Actions 실행 여부:`, !!data.executionId);
            if (data.executionId) {
                console.log(`🚀 [${execId}] GitHub Actions ExecutionId:`, data.executionId);
                console.log(`🚀 [${execId}] 이 메시지는 GitHub Actions에서 발송됩니다!`);
            }
            
            const message = {
                // notification 페이로드 제거 - 중복 알림 방지
                // FCM 자동 표시 없이 Service Worker에서만 처리
                data: messageData,
                token: token
            };
            
            const response = await admin.messaging().send(message);
            console.log(`✅ 푸시 알림 전송 성공 (${token.substring(0, 10)}...${token.substring(token.length-5)}):`, response);
            console.log(`📋 전송된 메시지:`, JSON.stringify(message, null, 2));
            results.push({ success: true, token: token.substring(0, 20), response });
            
        } catch (error) {
            console.error(`❌ 푸시 알림 전송 실패 (${token.substring(0, 10)}...${token.substring(token.length-5)}):`, error.message);
            console.error(`📋 실패한 메시지:`, JSON.stringify(message, null, 2));
            console.error(`🔍 에러 상세:`, error);
            results.push({ success: false, token: token.substring(0, 20), error: error.message });
        }
    }
    
    console.log(`✅ [${execId}] [${pushId}] 총 ${FCM_TOKENS.length}개 기기에 알림 전송 완료`);
    return results;
}

// 날씨 상태 파일 경로
const WEATHER_STATE_FILE = path.join(__dirname, '..', 'data', 'weather-state.json');

// 날씨 상태 읽기
async function loadWeatherState() {
    try {
        await fs.mkdir(path.dirname(WEATHER_STATE_FILE), { recursive: true });
        const data = await fs.readFile(WEATHER_STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('이전 날씨 데이터 없음, 새로 시작');
        return null;
    }
}

// 날씨 상태 저장
async function saveWeatherState(weatherData) {
    try {
        await fs.mkdir(path.dirname(WEATHER_STATE_FILE), { recursive: true });
        await fs.writeFile(WEATHER_STATE_FILE, JSON.stringify(weatherData, null, 2));
        console.log('날씨 상태 저장 완료');
    } catch (error) {
        console.error('날씨 상태 저장 실패:', error);
    }
}

// 날씨 변화 감지 및 알림
async function checkWeatherChanges(githubExecutionId = null) {
    try {
        if (githubExecutionId) {
            console.log(`🚀 GitHub Actions Execution ID: ${githubExecutionId}`);
        }
        const currentWeather = await getWeatherData();
        if (!currentWeather) return;
        
        console.log('현재 날씨:', currentWeather);
        
        // 이전 날씨 데이터 로드
        const previousWeather = await loadWeatherState();
        
        if (!previousWeather) {
            console.log('첫 날씨 체크 - 데이터 저장만 수행');
            await saveWeatherState(currentWeather);
            lastWeatherCheck = currentWeather;
            return;
        }
        
        if (previousWeather) {
            const prevRain = parseInt(previousWeather.rainProbability.replace('%', ''));
            const currentRain = parseInt(currentWeather.rainProbability.replace('%', ''));
            const change = Math.abs(currentRain - prevRain);
            const threshold = getAdaptiveThreshold(previousWeather.rainProbability, currentWeather.rainProbability);
            
            console.log(`날씨 변화 체크: ${prevRain}% → ${currentRain}% (변화: ${change}%, 임계값: ${threshold}%)`);
            
            if (change >= threshold) {
                const direction = currentRain > prevRain ? '증가' : '감소';
                const emoji = direction === '증가' ? '☔⚠️' : '☀️✨';
                
                await sendPushNotification(
                    `${emoji} 날씨 급변 알림`,
                    `강수확률이 ${change}% ${direction}했습니다!\n` +
                    `이전: ${previousWeather.rainProbability}\n` +
                    `현재: ${currentWeather.rainProbability}\n` +
                    `온도: ${currentWeather.temperature}`,
                    { type: 'weather_urgent', executionId: githubExecutionId }
                );
            }
        }
        
        // 현재 날씨 저장
        await saveWeatherState(currentWeather);
        lastWeatherCheck = currentWeather;
        
    } catch (error) {
        console.error('날씨 변화 감지 오류:', error);
    }
}

// 실행 잠금 파일 경로
const EXECUTION_LOCK_FILE = path.join(__dirname, '..', 'data', 'execution.lock');

// 실행 잠금 확인 및 설정
async function acquireExecutionLock(functionName, timeoutMs = 300000) { // 5분 타임아웃
    try {
        await fs.mkdir(path.dirname(EXECUTION_LOCK_FILE), { recursive: true });
        
        // 기존 잠금 파일 확인
        try {
            const lockData = await fs.readFile(EXECUTION_LOCK_FILE, 'utf8');
            const lock = JSON.parse(lockData);
            const lockAge = Date.now() - lock.timestamp;
            
            if (lock.function === functionName && lockAge < timeoutMs) {
                console.warn(`⚠️ [${functionName}] 이미 실행 중입니다. 잠금 시간: ${new Date(lock.timestamp).toISOString()}`);
                return false;
            }
        } catch (error) {
            // 잠금 파일이 없거나 읽기 실패 = 실행 가능
        }
        
        // 새 잠금 설정
        const lockData = {
            function: functionName,
            timestamp: Date.now(),
            executionId: `${functionName}-${Date.now()}`
        };
        
        await fs.writeFile(EXECUTION_LOCK_FILE, JSON.stringify(lockData, null, 2));
        console.log(`🔒 [${functionName}] 실행 잠금 설정: ${lockData.executionId}`);
        return lockData.executionId;
        
    } catch (error) {
        console.error(`실행 잠금 설정 실패:`, error);
        return `${functionName}-${Date.now()}`; // 실패해도 실행은 계속
    }
}

// 실행 잠금 해제
async function releaseExecutionLock() {
    try {
        await fs.unlink(EXECUTION_LOCK_FILE);
        console.log(`🔓 실행 잠금 해제`);
    } catch (error) {
        // 잠금 파일이 없어도 괜찮음
    }
}

// 아침 브리핑 알림
async function sendMorningBriefing(githubExecutionId = null) {
    globalExecutionCounter++;
    console.log(`📊 sendMorningBriefing 호출됨 (글로벌 실행 카운터: ${globalExecutionCounter})`);
    if (githubExecutionId) {
        console.log(`🚀 GitHub Actions Execution ID: ${githubExecutionId}`);
    }
    
    const executionId = await acquireExecutionLock('morning_briefing');
    
    if (!executionId) {
        console.log(`⛔ [실행차단] 아침 브리핑이 이미 실행 중이므로 종료 (카운터: ${globalExecutionCounter})`);
        return;
    }
    
    console.log(`🚀 [${executionId}] sendMorningBriefing 실제 시작 (실행 카운터: ${globalExecutionCounter})`);
    
    try {
        const weather = await getWeatherData();
        console.log(`[${executionId}] 날씨 데이터 수신:`, weather ? '성공' : '실패');
        if (!weather) {
            console.error(`[${executionId}] 날씨 API 실패 - getWeatherData가 null 반환`);
        }
        
        const { todayEvents, highMiddleTasks } = await getNotionData();
        const topStories = await getNYTTopStories();
        
        // 1. 날씨 브리핑 (상세 강수정보 포함)
        let weatherMessage = '';
        if (weather) {
            weatherMessage = `🌡️ ${weather.temperature}`;
            
            // 최고/최저기온 추가
            if (weather.maxTemperature || weather.minTemperature) {
                const tempRange = [];
                if (weather.minTemperature) tempRange.push(`최저 ${weather.minTemperature}`);
                if (weather.maxTemperature) tempRange.push(`최고 ${weather.maxTemperature}`);
                if (tempRange.length > 0) {
                    weatherMessage += ` (${tempRange.join(', ')})`;
                }
            }
            
            if (weather.hasRain && weather.rainPeriods.length > 0) {
                // 강수 있을 때 - 시간대와 강도 정보
                weatherMessage += ` ☔ ${weather.rainProbability}`;
                
                // 강수 시간대
                const timePeriods = weather.rainPeriods.map(period => 
                    `${period.start}-${period.end}`
                ).join(', ');
                weatherMessage += `\n⏰ 강수시간: ${timePeriods}`;
                
                // 강수량
                if (weather.maxPrecipitation > 0) {
                    const intensity = weather.maxPrecipitation < 1 ? '약한비' : 
                                    weather.maxPrecipitation < 3 ? '보통비' : 
                                    weather.maxPrecipitation < 15 ? '강한비' : '매우강한비';
                    weatherMessage += `\n💧 예상강수량: ${weather.maxPrecipitation}mm (${intensity})`;
                }
                
                // 강수형태
                if (weather.precipitationTypes.length > 0) {
                    weatherMessage += `\n${weather.precipitationTypes.includes('눈') ? '❄️' : '🌧️'} 형태: ${weather.precipitationTypes.join(', ')}`;
                }
                
                weatherMessage += '\n🌂 우산 챙기세요!';
            } else {
                weatherMessage += ` ☀️ ${weather.rainProbability} 맑음`;
            }
        } else {
            weatherMessage = '날씨 정보 없음';
        }
        
        console.log(`📧 [${executionId}] 날씨 브리핑 알림 전송`);
        await sendPushNotification('🌅 날씨 브리핑', weatherMessage, { 
            type: 'weather_daily', 
            executionId: githubExecutionId || executionId 
        });
        
        // 0.5초 대기 후 캘린더 알림
        await new Promise(resolve => setTimeout(resolve, 500));
        let calendarMessage = '';
        if (todayEvents.length === 0) {
            calendarMessage = '일정 없음 😊';
        } else {
            todayEvents.forEach((event, index) => {
                const emoji = event.type === 'social' ? '🍻' : '📚';
                calendarMessage += `${emoji} ${event.name}${index < todayEvents.length - 1 ? '\n' : ''}`;
            });
        }
        
        console.log(`📧 [${executionId}] 오늘 일정 알림 전송`);
        await sendPushNotification('📅 오늘 일정', calendarMessage, { type: 'task_daily', executionId: githubExecutionId || executionId });
        
        // 0.5초 대기 후 우선순위 태스크 알림
        await new Promise(resolve => setTimeout(resolve, 500));
        let taskMessage = '';
        if (highMiddleTasks.length === 0) {
            taskMessage = '우선순위 태스크 없음 😌';
        } else {
            highMiddleTasks.forEach((task, index) => {
                const emoji = task.priority === 'HIGH' ? '🔴' : '🟡';
                taskMessage += `${emoji} ${task.name}${index < highMiddleTasks.length - 1 ? '\n' : ''}`;
            });
        }
        
        console.log(`📧 [${executionId}] 우선순위 태스크 알림 전송`);
        await sendPushNotification('🎯 우선순위 태스크', taskMessage, { type: 'task_urgent', executionId: githubExecutionId || executionId });
        
        // 0.5초 대기 후 메인 뉴스
        await new Promise(resolve => setTimeout(resolve, 500));
        let mainNewsMessage = '';
        if (topStories.main.length === 0) {
            mainNewsMessage = '메인 뉴스 없음';
        } else {
            mainNewsMessage = topStories.main.map((story, index) => 
                `${index + 1}. ${story.title}`
            ).join('\n');
        }
        
        console.log(`📧 [${executionId}] 주요 뉴스 알림 전송`);
        await sendPushNotification('📰 주요 뉴스', mainNewsMessage, { type: 'news_main', executionId: githubExecutionId || executionId });
        
        // 0.5초 대기 후 기술 뉴스
        await new Promise(resolve => setTimeout(resolve, 500));
        let techNewsMessage = '';
        if (topStories.tech.length === 0) {
            techNewsMessage = '기술 뉴스 없음';
        } else {
            techNewsMessage = topStories.tech.map((story, index) => 
                `${index + 1}. ${story.title}`
            ).join('\n');
        }
        
        console.log(`📧 [${executionId}] 기술 뉴스 알림 전송`);
        await sendPushNotification('🤖 기술 뉴스', techNewsMessage, { type: 'news_tech', executionId: githubExecutionId || executionId });
        
        // 0.5초 대기 후 과학 뉴스
        await new Promise(resolve => setTimeout(resolve, 500));
        let scienceNewsMessage = '';
        if (topStories.science.length === 0) {
            scienceNewsMessage = '과학 뉴스 없음';
        } else {
            scienceNewsMessage = topStories.science.map((story, index) => 
                `${index + 1}. ${story.title}`
            ).join('\n');
        }
        
        console.log(`📧 [${executionId}] 과학 뉴스 알림 전송`);
        await sendPushNotification('🔬 과학 뉴스', scienceNewsMessage, { type: 'news_science', executionId: githubExecutionId || executionId });
        
        // 0.5초 대기 후 경제 뉴스
        await new Promise(resolve => setTimeout(resolve, 500));
        let businessNewsMessage = '';
        if (topStories.business.length === 0) {
            businessNewsMessage = '경제 뉴스 없음';
        } else {
            businessNewsMessage = topStories.business.map((story, index) => 
                `${index + 1}. ${story.title}`
            ).join('\n');
        }
        
        console.log(`📧 [${executionId}] 경제 뉴스 알림 전송`);
        await sendPushNotification('💰 경제 뉴스', businessNewsMessage, { type: 'news_business', executionId: githubExecutionId || executionId });
        
        // 0.5초 대기 후 내일 일정 알림
        await new Promise(resolve => setTimeout(resolve, 500));
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        
        const tomorrowEvents = await getTomorrowEvents(tomorrowStr);
        
        let tomorrowMessage = '';
        if (tomorrowEvents.length === 0) {
            tomorrowMessage = '내일 일정 없음 😊';
        } else {
            tomorrowEvents.forEach((event, index) => {
                const emoji = event.type === 'social' ? '🍻' : '📚';
                tomorrowMessage += `${emoji} ${event.name}${index < tomorrowEvents.length - 1 ? '\n' : ''}`;
            });
        }
        
        console.log(`📧 [${executionId}] 내일 일정 알림 전송`);
        await sendPushNotification('📅 내일 일정', tomorrowMessage, { type: 'task_daily', executionId: githubExecutionId || executionId });
        
        console.log(`✅ [${executionId}] sendMorningBriefing 완료 (총 푸시 전송: ${globalPushCounter}개)`);
        
    } catch (error) {
        console.error(`❌ [${executionId}] 아침 브리핑 오류:`, error);
    } finally {
        await releaseExecutionLock();
        console.log(`🔓 [${executionId}] 실행 잠금 해제 완료`);
    }
}

// 저녁 브리핑 알림 (오후 7시)
async function sendEveningBriefing(githubExecutionId = null) {
    try {
        if (githubExecutionId) {
            console.log(`🚀 GitHub Actions Execution ID: ${githubExecutionId}`);
        }
        
        const { todayEvents, highMiddleTasks } = await getNotionData();
        
        // 남은 일정 확인
        const now = new Date();
        const remainingEvents = todayEvents.filter(event => {
            if (event.time) {
                const eventTime = new Date(`${now.toDateString()} ${event.time}`);
                return eventTime > now;
            }
            return false;
        });
        
        let briefingMessage = '🌆 오늘 남은 일정';
        if (remainingEvents.length === 0) {
            briefingMessage += '\n\n오늘 남은 일정이 없습니다 😌\n좋은 저녁 시간 보내세요!';
        } else {
            briefingMessage += '\n\n';
            remainingEvents.forEach((event, index) => {
                const emoji = ['📅', '⏰', '📝', '💼', '🎯'][index % 5];
                briefingMessage += `${emoji} ${event.name}`;
                if (event.time) briefingMessage += ` (${event.time})`;
                briefingMessage += index < remainingEvents.length - 1 ? '\n' : '';
            });
        }
        
        await sendPushNotification('🌆 저녁 브리핑', briefingMessage, { 
            type: 'evening_briefing', 
            executionId: githubExecutionId 
        });
        
    } catch (error) {
        console.error('저녁 브리핑 알림 오류:', error);
    }
}

// 저녁 내일 준비 알림
async function sendEveningPrep(githubExecutionId = null) {
    try {
        if (githubExecutionId) {
            console.log(`🚀 GitHub Actions Execution ID: ${githubExecutionId}`);
        }
        const { todayEvents, highMiddleTasks } = await getNotionData();
        
        // 내일 캘린더 일정
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        
        // 내일 일정을 실제 Notion에서 가져오기
        const tomorrowEvents = await getTomorrowEvents(tomorrowStr);
        
        let tomorrowMessage = '';
        if (tomorrowEvents.length === 0) {
            tomorrowMessage = '내일 일정 없음 😊';
        } else {
            tomorrowEvents.forEach((event, index) => {
                const emoji = event.type === 'social' ? '🍻' : '📚';
                tomorrowMessage += `${emoji} ${event.name}${index < tomorrowEvents.length - 1 ? '\n' : ''}`;
            });
        }
        
        await sendPushNotification('🗓️ 내일 일정', tomorrowMessage, { type: 'task_daily', executionId: githubExecutionId });
        
        // 0.5초 후 남은 우선순위 작업 알림
        await new Promise(resolve => setTimeout(resolve, 500));
        let remainingMessage = '🌆 오늘 남은 우선순위 작업';
        if (highMiddleTasks.length === 0) {
            remainingMessage += '\n\n우선순위 작업이 모두 완료되었습니다!\n내일을 위해 정리하고 푹 쉬세요! 🛌';
        } else {
            remainingMessage += `\n\n아직 ${highMiddleTasks.length}개의 우선순위 작업이 남아있습니다.\n내일을 위해 정리하고 푹 쉬세요! 🛌`;
        }
        
        await sendPushNotification('🌆 오늘 남은 우선순위 작업', remainingMessage, { type: 'task_daily', executionId: githubExecutionId });
        
    } catch (error) {
        console.error('저녁 준비 알림 오류:', error);
    }
}

// 크론 작업 설정 (GitHub Actions에서 대체하므로 비활성화)
function setupCronJobs() {
    console.log('크론 작업은 GitHub Actions에서 실행됩니다.');
    // GitHub Actions 워크플로우가 모든 스케줄링을 담당
    // - 2시간마다 날씨 변화 감지
    // - 매일 오전 7시 아침 브리핑  
    // - 매일 오후 9시 저녁 준비
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
            // 테스트용 엔드포인트 (GitHub Actions에서 대체)
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Use GitHub Actions "Run workflow" instead');
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
    sendEveningBriefing,
    sendEveningPrep,
    getWeatherData
};
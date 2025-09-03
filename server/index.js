const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');

// 환경 변수 설정
const NYT_API_KEY = process.env.NYT_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_CALENDAR_DB_ID = process.env.NOTION_CALENDAR_DB_ID;
const NOTION_TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID;

const DATA_DIR = path.join(__dirname, '..', 'data');
const WEATHER_STATE_FILE = path.join(DATA_DIR, 'weather-state.json');

// FCM 토큰 설정
const FCM_TOKENS = [];

// 환경 변수에서 토큰 추가 (중복 체크)
if (process.env.FCM_TOKEN_MACBOOK) {
    FCM_TOKENS.push(process.env.FCM_TOKEN_MACBOOK);
    console.log('MacBook FCM 토큰 로드됨');
}

if (process.env.FCM_TOKEN_IPHONE) {
    const iphoneToken = process.env.FCM_TOKEN_IPHONE;
    if (!FCM_TOKENS.includes(iphoneToken)) {
        FCM_TOKENS.push(iphoneToken);
        console.log('iPhone FCM 토큰 로드됨');
    } else {
        console.log('iPhone FCM 토큰 중복 - 스킵');
    }
}

console.log(`로드된 FCM 토큰 수: ${FCM_TOKENS.length}`);

// Firebase Admin 초기화
let firebaseApp = null;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // 기존 앱이 있는지 확인
        if (admin.apps.length === 0) {
            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id
            });
            console.log('Firebase Admin 초기화 완료');
        } else {
            firebaseApp = admin.apps[0];
            console.log('Firebase Admin 기존 앱 사용');
        }
    } catch (error) {
        console.error('Firebase Admin 초기화 실패:', error);
    }
} else {
    console.log('Firebase 서비스 계정 정보가 없습니다.');
}

// API 엔드포인트
const KMA_BASE_URL = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const KMA_SERVICE_KEY = 'CzevJI5DbNL2Qwqo8nij5KSUG6OxHdA+LoC2ue6Zrf9d7b5YRm5mX51g7T0Fj9g5l6mB4c+d/8xm4q5z+vvQNw==';
const NYT_BASE_URL = 'https://api.nytimes.com/svc';

const GANGNAM_COORDS = {
    nx: 61,
    ny: 126
};

// 날씨 상태 저장
async function saveWeatherState(weather) {
    try {
        // data 디렉토리가 없으면 생성
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        await fs.writeFile(
            WEATHER_STATE_FILE,
            JSON.stringify(weather, null, 2)
        );
        console.log('날씨 상태 저장 완료');
    } catch (error) {
        console.error('날씨 상태 저장 실패:', error);
    }
}

// 날씨 상태 로드
async function loadWeatherState() {
    try {
        const data = await fs.readFile(WEATHER_STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('이전 날씨 데이터가 없습니다.');
        } else {
            console.error('날씨 상태 로드 실패:', error);
        }
        return null;
    }
}

// 알림 내역 저장
async function saveNotificationHistory(notification) {
    try {
        // data 디렉토리가 없으면 생성
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        const historyFile = path.join(DATA_DIR, 'notification-history.json');
        
        // 기존 내역 로드
        let history = [];
        try {
            const data = await fs.readFile(historyFile, 'utf8');
            history = JSON.parse(data);
        } catch (error) {
            // 파일이 없으면 빈 배열로 시작
            if (error.code !== 'ENOENT') {
                console.error('알림 내역 로드 오류:', error);
            }
        }
        
        // 새 알림 추가
        history.unshift(notification);
        
        // 최대 100개까지만 보관
        if (history.length > 100) {
            history = history.slice(0, 100);
        }
        
        // 저장
        await fs.writeFile(
            historyFile,
            JSON.stringify(history, null, 2)
        );
        
        console.log('알림 내역 저장 완료');
    } catch (error) {
        console.error('알림 내역 저장 실패:', error);
    }
}

// 알림 내역 로드
async function loadNotificationHistory() {
    try {
        const historyFile = path.join(DATA_DIR, 'notification-history.json');
        const data = await fs.readFile(historyFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('알림 내역이 없습니다.');
        } else {
            console.error('알림 내역 로드 실패:', error);
        }
        return [];
    }
}

// 적응형 임계값 계산
function getAdaptiveThreshold(prevRain, currentRain) {
    const prevValue = parseInt(prevRain.replace('%', ''));
    const currentValue = parseInt(currentRain.replace('%', ''));
    
    // 현재 강수확률에 따라 임계값 동적 조정
    if (currentValue >= 60 || prevValue >= 60) {
        return 20; // 높은 강수확률일 때는 20% 변화도 중요
    } else if (currentValue >= 30 || prevValue >= 30) {
        return 30; // 중간 강수확률일 때는 30% 변화
    } else {
        return 40; // 낮은 강수확률일 때는 40% 이상 변화만
    }
}

// 지난 체크 시간
let lastWeatherCheck = null;

// 날씨 API 호출 (기상청)
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
        
        console.log(`API 요청: base_date=${baseDate}, base_time=${baseTime}00`);
        
        const params = new URLSearchParams({
            serviceKey: KMA_SERVICE_KEY,
            pageNo: '1',
            numOfRows: '290',
            dataType: 'JSON',
            base_date: baseDate,
            base_time: baseTime + '00',
            nx: GANGNAM_COORDS.nx,
            ny: GANGNAM_COORDS.ny
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
    // 데이터가 없거나 빈 배열인 경우 기본값 반환
    if (!items || items.length === 0) {
        console.error('날씨 API 응답이 비어있습니다');
        return {
            rainProbability: '정보 없음',
            temperature: '정보 없음',
            maxTemperature: null,
            minTemperature: null,
            hasRain: false,
            rainPeriods: [],
            maxPrecipitation: 0,
            precipitationTypes: [],
            timestamp: new Date().toISOString()
        };
    }
    
    const now = new Date();
    const today = now.toISOString().slice(0, 10).replace(/-/g, '');
    const todayItems = items.filter(item => item.fcstDate === today);
    
    // 오늘 데이터가 없는 경우
    if (todayItems.length === 0) {
        console.error('오늘 날씨 데이터가 없습니다');
        return {
            rainProbability: '0%',
            temperature: '정보 없음',
            maxTemperature: null,
            minTemperature: null,
            hasRain: false,
            rainPeriods: [],
            maxPrecipitation: 0,
            precipitationTypes: [],
            timestamp: new Date().toISOString()
        };
    }
    
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
        }
        
        // 간단한 결과로 변환
        return {
            main: results.home || [],
            tech: results.technology || [],
            science: results.science || [],
            business: results.business || []
        };
        
    } catch (error) {
        console.error('NYT API 호출 실패:', error);
        return { main: [], tech: [], science: [], business: [] };
    }
}

// Notion API 호출
async function getNotionData() {
    // API 키가 없으면 모의 데이터 사용
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID || !NOTION_TASKS_DB_ID) {
        console.log('Notion API 정보가 없습니다. 모의 데이터 사용.');
        console.log('NOTION_API_KEY 존재:', !!NOTION_API_KEY);
        console.log('NOTION_CALENDAR_DB_ID 존재:', !!NOTION_CALENDAR_DB_ID);
        console.log('NOTION_TASKS_DB_ID 존재:', !!NOTION_TASKS_DB_ID);
        return getMockNotionData();
    }
    
    try {
        // 한국 시간 기준으로 오늘과 내일 날짜 계산
        const koreaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const today = koreaTime.toISOString().slice(0, 10);
        
        const tomorrow = new Date(koreaTime);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);
        
        console.log(`Notion API 호출 시작 - 오늘 날짜 (KST): ${today}, 내일 날짜: ${tomorrowStr}`);
        
        // 1. 월간 데이터베이스에서 오늘과 내일 일정 가져오기
        const calendarResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_CALENDAR_DB_ID}/query`, {
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
                            property: '날짜', // 날짜 속성 이름 (한글)
                            date: {
                                equals: today  // 오늘 일정
                            }
                        },
                        {
                            property: '날짜', // 날짜 속성 이름 (한글)
                            date: {
                                equals: tomorrowStr  // 내일 일정
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
                    property: 'Status', // 상태 속성 이름 (실제로는 Status)
                    status: {
                        equals: 'HIGH'
                    }
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
        
        const highMiddleTasks = tasksData.results?.filter(page => {
            const priority = page.properties.Status?.status?.name || 'Unknown';
            return priority === 'HIGH';
        }).map(page => ({
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
    const koreaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const today = koreaTime.toISOString().slice(0, 10);
    
    const tomorrow = new Date(koreaTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    
    // 캘린더 이벤트 (오늘과 내일 포함)
    const calendarEvents = [
        { name: '회식?', date: today, type: 'social' },
        { name: 'AI보안특강', date: tomorrowStr, type: 'lecture' },
        { name: '팀 미팅', date: tomorrowStr, type: 'meeting' }
    ];
    
    // 우선순위 태스크
    const priorityTasks = [
        { name: '블로그수익화', status: 'Middle', priority: 'Middle' },
        { name: '백준17352유니온파인드구현', status: 'low', priority: 'low' },
        { name: '포트폴리오 정리', status: 'HIGH', priority: 'HIGH' },
        { name: '면접 준비', status: 'HIGH', priority: 'HIGH' }
    ];
    
    // 오늘과 내일 일정 모두 반환 (필터링은 사용하는 곳에서)
    const todayEvents = calendarEvents;
    const highMiddleTasks = priorityTasks.filter(task => 
        task.priority === 'HIGH'
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
    
    await saveNotificationHistory(notification);
    
    if (!firebaseApp || FCM_TOKENS.length === 0) {
        console.log('FCM 설정이 없습니다. 알림 시뮬레이션:', { title, body: body.substring(0, 100) });
        return;
    }
    
    // 각 토큰으로 알림 전송
    const results = [];
    for (let i = 0; i < FCM_TOKENS.length; i++) {
        const token = FCM_TOKENS[i];
        try {
            const message = {
                notification: {
                    title: title,
                    body: body
                },
                data: {
                    ...data,
                    timestamp: new Date().toISOString(),
                    pushId: pushId
                },
                token: token,
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'high',
                        channelId: 'high_importance'
                    }
                }
            };
            
            const response = await admin.messaging().send(message);
            console.log(`✅ [${pushId}] 토큰${i+1} 전송 성공:`, response);
            results.push({ token: `토큰${i+1}`, success: true, response });
        } catch (error) {
            console.error(`❌ [${pushId}] 토큰${i+1} 전송 실패:`, error);
            results.push({ token: `토큰${i+1}`, success: false, error: error.message });
        }
    }
    
    // 전송 결과 요약
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    console.log(`📊 [${pushId}] 전송 완료: 성공 ${successCount}개, 실패 ${failCount}개`);
    
    return results;
}

// 적응형 알림 간격 계산 (강수 급변시)
function getAdaptiveInterval(rainProbability) {
    const probability = parseInt(rainProbability.replace('%', ''));
    
    if (probability >= 70) {
        return 30 * 60 * 1000; // 30분마다
    } else if (probability >= 50) {
        return 60 * 60 * 1000; // 1시간마다
    } else {
        return 120 * 60 * 1000; // 2시간마다
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

// 실행 카운터
let executionCounter = 0;

// 아침 브리핑 전송 (오전 7시)
async function sendMorningBriefing(githubExecutionId = null) {
    try {
        executionCounter++;
        const executionId = githubExecutionId || `manual-${Date.now()}`;
        globalExecutionCounter++;
        
        console.log('━'.repeat(50));
        console.log(`🌅 아침 브리핑 시작 [실행 ${executionCounter}]`);
        console.log(`실행 ID: ${executionId}`);
        console.log(`글로벌 실행 카운터: ${globalExecutionCounter}`);
        console.log(`한국 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);
        console.log(`시스템 시간: ${new Date().toISOString()}`);
        console.log('━'.repeat(50));
        
        // GitHub Actions 식별
        if (githubExecutionId) {
            console.log(`🚀 GitHub Actions Execution ID: ${githubExecutionId}`);
        }
        
        const startTime = Date.now();
        
        // 데이터 수집 (병렬 처리)
        console.log('\n📊 데이터 수집 시작...');
        console.log(`[${executionId}] 날씨, Notion, NYT 데이터 동시 수집`);
        
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
                
                // 강수량 정보
                if (weather.maxPrecipitation > 0) {
                    weatherMessage += `\n💧 예상강수: ${weather.maxPrecipitation}mm`;
                }
                
                // 강수형태
                if (weather.precipitationTypes.length > 0) {
                    const uniqueTypes = [...new Set(weather.precipitationTypes)];
                    weatherMessage += `\n🌧️ 형태: ${uniqueTypes.join(', ')}`;
                }
                
                weatherMessage += '\n\n☂️ 우산 꼭 챙기세요!';
            } else {
                // 강수 없을 때 - 간단한 정보
                const emoji = parseInt(weather.rainProbability.replace('%', '')) < 20 ? '☀️' : '⛅';
                weatherMessage += ` ${weather.rainProbability} ${emoji} 맑음`;
            }
        } else {
            weatherMessage = '날씨 정보를 가져올 수 없습니다 😢';
        }
        
        await sendPushNotification('☀️ 아침 날씨', weatherMessage, { type: 'weather_daily', executionId });
        console.log(`[${executionId}] 날씨 알림 전송 완료`);
        
        // 2. 일정과 태스크 통합 알림
        await new Promise(resolve => setTimeout(resolve, 500));
        
        let scheduleMessage = '';
        
        // 오늘 일정 추가
        if (todayEvents.length === 0) {
            scheduleMessage = '오늘 일정이 없습니다 😌';
        } else {
            scheduleMessage = '오늘의 일정:\n';
            todayEvents.forEach((event, index) => {
                const emoji = event.type === 'social' ? '🍻' : '📚';
                scheduleMessage += `${emoji} ${event.name}${index < todayEvents.length - 1 ? '\n' : ''}`;
            });
        }
        
        // 우선순위 태스크 추가 (구분선 포함)
        let taskMessage = '';
        if (highMiddleTasks.length === 0) {
            taskMessage = '\n\n오늘 우선순위 작업이 없습니다 😊';
        } else {
            highMiddleTasks.forEach((task, index) => {
                const emoji = task.priority === 'HIGH' ? '🔥' : '⚡';
                taskMessage += `${emoji} ${task.name}${index < highMiddleTasks.length - 1 ? '\n' : ''}`;
            });
        }
        
        if (taskMessage) {
            scheduleMessage += `\n\n───────\n우선순위 작업:\n${taskMessage}`;
        }
        
        await sendPushNotification('📅 오늘 일정', scheduleMessage, { type: 'task_daily', executionId });
        console.log(`[${executionId}] 일정 알림 전송 완료`);
        
        // 3. 뉴스 브리핑 (간소화)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (topStories.main && topStories.main.length > 0) {
            const newsItems = topStories.main.slice(0, 3);
            let newsMessage = '';
            newsItems.forEach((item, index) => {
                const shortTitle = item.title.length > 50 ? 
                    item.title.substring(0, 50) + '...' : item.title;
                newsMessage += `${index + 1}. ${shortTitle}${index < newsItems.length - 1 ? '\n\n' : ''}`;
            });
            await sendPushNotification('📰 주요 뉴스', newsMessage, { type: 'news_main', executionId });
            console.log(`[${executionId}] 뉴스 알림 전송 완료`);
        }
        
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '━'.repeat(50));
        console.log(`✅ 아침 브리핑 완료 [실행 ${executionCounter}]`);
        console.log(`실행 시간: ${duration}초`);
        console.log('━'.repeat(50) + '\n');
        
    } catch (error) {
        console.error('아침 브리핑 알림 오류:', error);
    }
}

// 저녁 브리핑 알림 (오후 7시)
async function sendEveningBriefing(githubExecutionId = null) {
    try {
        if (githubExecutionId) {
            console.log(`🚀 GitHub Actions Execution ID: ${githubExecutionId}`);
        }
        
        // 한국 시간 기준으로 내일 날짜 계산
        const koreaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const tomorrow = new Date(koreaTime);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);
        
        console.log(`내일 날짜 (KST): ${tomorrowDateStr}`);
        
        // 내일 일정과 HIGH 우선순위 태스크 가져오기
        const notionData = await getNotionData();
        const highMiddleTasks = notionData.highMiddleTasks;
        
        // 내일 일정을 직접 가져오기
        const tomorrowEvents = await getTomorrowEvents(tomorrowDateStr);
        
        let briefingMessage = '🌅 내일 준비';
        
        // 내일 일정 추가
        if (tomorrowEvents.length > 0) {
            briefingMessage += '\n\n📅 내일 일정:\n';
            tomorrowEvents.forEach((event, index) => {
                const emoji = ['📝', '💼', '🎯', '⏰', '📞'][index % 5];
                briefingMessage += `${emoji} ${event.name}`;
                if (event.time) briefingMessage += ` (${event.time})`;
                briefingMessage += index < tomorrowEvents.length - 1 ? '\n' : '';
            });
        } else {
            briefingMessage += '\n\n📅 내일 일정이 없습니다';
        }
        
        // HIGH 우선순위 태스크 추가
        if (highMiddleTasks.length > 0) {
            briefingMessage += '\n\n🎯 남은 우선순위 작업:\n';
            highMiddleTasks.forEach((task, index) => {
                const emoji = ['🔥', '⚡', '🎯', '💪', '🚀'][index % 5];
                briefingMessage += `${emoji} ${task.name}`;
                briefingMessage += index < highMiddleTasks.length - 1 ? '\n' : '';
            });
            briefingMessage += '\n\n내일을 위해 정리하고 푹 쉬세요! 🛌';
        } else {
            briefingMessage += '\n\n✅ 우선순위 작업이 모두 완료되었습니다!';
            briefingMessage += '\n내일을 위해 푹 쉬세요! 🛌';
        }
        
        await sendPushNotification('🌅 저녁 브리핑', briefingMessage, { 
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
        
        // 한국 시간 기준으로 내일 날짜 계산
        const koreaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
        const tomorrow = new Date(koreaTime);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().slice(0, 10);
        
        console.log(`내일 날짜 (KST): ${tomorrowDate}`);
        
        // 내일 일정 가져오기
        const tomorrowEvents = await getTomorrowEvents(tomorrowDate);
        const { todayEvents, highMiddleTasks } = await getNotionData();
        
        // 내일 일정 알림
        let tomorrowMessage = '🗓️ 내일 일정\n\n';
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
            remainingMessage += `\n\n남은 HIGH 우선순위 작업 ${highMiddleTasks.length}개:\n`;
            highMiddleTasks.forEach((task, index) => {
                const emoji = ['🔥', '⚡', '🎯', '💪', '🚀'][index % 5];
                remainingMessage += `${emoji} ${task.name}${index < highMiddleTasks.length - 1 ? '\n' : ''}`;
            });
            remainingMessage += '\n\n내일을 위해 정리하고 푹 쉬세요! 🛌';
        }
        
        await sendPushNotification('🌆 오늘 남은 우선순위 작업', remainingMessage, { type: 'task_daily', executionId: githubExecutionId });
        
    } catch (error) {
        console.error('저녁 준비 알림 오류:', error);
    }
}

// 임시 테스트
console.log('서버 스크립트 로드됨');

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
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });
    
    server.listen(PORT, () => {
        console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log(`헬스체크: http://localhost:${PORT}/health`);
        
        // 서버 시작시 날씨 체크 (선택사항)
        setTimeout(() => {
            console.log('초기 날씨 체크 실행...');
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
    getWeatherData,
    getNotionData
};
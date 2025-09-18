const admin = require('firebase-admin');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');

// Firebase Admin SDK 초기화
if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다. FCM 알림이 비활성화됩니다.');
  } else {
    try {
      console.log('Firebase 서비스 계정 초기화 중...');
      console.log('서비스 계정 JSON 길이:', serviceAccountJson.length);
      console.log('JSON 시작 부분:', serviceAccountJson.substring(0, 50) + '...');
      
      let serviceAccount;
      
      // JSON 형태인지 확인 후 파싱
      if (serviceAccountJson.trim().startsWith('{')) {
        // 이미 JSON 형태인 경우
        console.log('JSON 형태로 직접 파싱...');
        serviceAccount = JSON.parse(serviceAccountJson);
      } else {
        // Base64 인코딩된 경우 디코딩 시도
        console.log('Base64 디코딩 시도...');
        try {
          const decoded = Buffer.from(serviceAccountJson.trim(), 'base64').toString('utf-8');
          console.log('디코딩된 내용 (처음 100자):', decoded.substring(0, 100) + '...');
          console.log('디코딩된 내용 (167번째 주변):', decoded.substring(160, 180));
          
          // 강력한 JSON 정리: private_key 따옴표 내부의 모든 줄바꿈을 \\n으로 치환
          let cleanedJson = decoded.trim();
          
          // private_key 값 부분만 찾아서 줄바꿈 처리
          const privateKeyStart = cleanedJson.indexOf('"private_key":"');
          if (privateKeyStart !== -1) {
            const valueStart = privateKeyStart + '"private_key":"'.length;
            const valueEnd = cleanedJson.indexOf('","', valueStart);
            
            if (valueEnd !== -1) {
              const beforeKey = cleanedJson.substring(0, valueStart);
              const keyValue = cleanedJson.substring(valueStart, valueEnd);
              const afterKey = cleanedJson.substring(valueEnd);
              
              // private_key 값 내부의 실제 줄바꿈을 \\n으로 치환
              const escapedKeyValue = keyValue
                .replace(/\n/g, '\\n')
                .replace(/\r\n/g, '\\n')
                .replace(/\r/g, '\\n');
              
              cleanedJson = beforeKey + escapedKeyValue + afterKey;
              console.log('🔑 private_key 값 정리 완료');
              console.log('🔍 처리 전 키 길이:', keyValue.length);
              console.log('🔍 처리 후 키 길이:', escapedKeyValue.length);
            }
          }
          
          // 디코딩된 내용이 JSON인지 확인
          if (cleanedJson.startsWith('{')) {
            serviceAccount = JSON.parse(cleanedJson);
            console.log('✅ Base64 디코딩 및 JSON 파싱 성공');
          } else {
            throw new Error('디코딩된 내용이 JSON 형태가 아닙니다');
          }
        } catch (decodeError) {
          console.error('Base64 디코딩 실패:', decodeError.message);
          console.log('원본 JSON으로 직접 파싱 시도...');
          try {
            // 원본 그대로 파싱 시도
            serviceAccount = JSON.parse(serviceAccountJson);
          } catch (originalError) {
            console.error('원본 JSON 파싱도 실패:', originalError.message);
            throw originalError;
          }
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
      
      console.log('✅ Firebase Admin SDK 초기화 완료');
      
    } catch (error) {
      console.error('❌ Firebase 초기화 실패:', error.message);
      console.error('환경변수 내용 (처음 100자):', serviceAccountJson ? serviceAccountJson.substring(0, 100) + '...' : 'undefined');
      console.warn('⚠️  Firebase 초기화에 실패했습니다. FCM 알림이 비활성화됩니다.');
    }
  }
}

const WEATHER_API_URL = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
// 기존 서비스 키가 만료되었으므로 fallback 처리
const SERVICE_KEY = process.env.WEATHER_API_KEY || 'DecGaYFaJhEcm%2BWE4VqPKFPH2R9Ja6eI7w3OL2fgZCUMGDgJRjl%2BgRqkv%2Fx34vn0OJXTz26K3ywHvfFl4EfB4w%3D%3D';

const NYT_API_KEY = process.env.NYT_API_KEY;

const fcmTokens = {
  MACBOOK: process.env.FCM_TOKEN_MACBOOK,
  IPHONE: process.env.FCM_TOKEN_IPHONE
};

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_CALENDAR_DB_ID = process.env.NOTION_CALENDAR_DB_ID;
const NOTION_TASKS_DB_ID = process.env.NOTION_TASKS_DB_ID;

const DATA_DIR = path.join(__dirname, '../data');
const WEATHER_STATE_FILE = path.join(DATA_DIR, 'weather-state.json');
const NOTIFICATION_HISTORY_FILE = path.join(DATA_DIR, 'notification-history.json');

const ensureDataDir = async () => {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
};

const loadPreviousWeatherState = async () => {
  try {
    const data = await fs.readFile(WEATHER_STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('이전 날씨 상태를 찾을 수 없습니다. 새로 시작합니다.');
    return null;
  }
};

const saveWeatherState = async (weatherData) => {
  try {
    await ensureDataDir();
    const jsonData = JSON.stringify(weatherData, null, 2);
    await fs.writeFile(WEATHER_STATE_FILE, jsonData);
    console.log(`✅ 날씨 상태 저장 성공: ${WEATHER_STATE_FILE}`);
    console.log(`📁 파일 크기: ${jsonData.length} bytes`);
  } catch (error) {
    console.error('❌ 날씨 상태 저장 실패:', error);
    console.error('파일 경로:', WEATHER_STATE_FILE);
  }
};

const saveNotificationHistory = async (title, body, type = 'personal_secretary', executionId = '') => {
  try {
    await ensureDataDir();
    
    // 기존 히스토리 로드
    let history = [];
    try {
      const data = await fs.readFile(NOTIFICATION_HISTORY_FILE, 'utf-8');
      history = JSON.parse(data);
    } catch (error) {
      console.log('📝 새로운 알림 히스토리 파일 생성');
    }
    
    // 새 알림 추가
    const newNotification = {
      id: Date.now(),
      title: title,
      body: body,
      type: type,
      executionId: executionId,
      timestamp: new Date().toISOString(),
      source: 'server'
    };
    
    history.unshift(newNotification); // 최신이 위로
    
    // 최대 100개까지만 보관
    if (history.length > 100) {
      history.splice(100);
    }
    
    // 파일에 저장
    const jsonData = JSON.stringify(history, null, 2);
    await fs.writeFile(NOTIFICATION_HISTORY_FILE, jsonData);
    
    console.log(`📝 알림 히스토리 저장: "${title.substring(0, 30)}..." (총 ${history.length}개)`);
    
    return newNotification;
  } catch (error) {
    console.error('❌ 알림 히스토리 저장 실패:', error);
  }
};

const loadNotificationHistory = async () => {
  try {
    const data = await fs.readFile(NOTIFICATION_HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.log('📝 알림 히스토리 파일 없음 - 빈 배열 반환');
    return [];
  }
};

function parseWeatherData(items) {
  const now = new Date();
  const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
  const currentHour = koreaTime.getHours();
  
  if (!items || items.length === 0) {
    console.log('날씨 데이터가 없습니다.');
    return {
      rainProbability: '정보 없음',
      temperature: '정보 없음',
      minTemp: '정보 없음',
      maxTemp: '정보 없음',
      skyCondition: '정보 없음',
      rainType: '정보 없음',
      rainAmount: '0',
      description: '날씨 정보를 가져올 수 없습니다.',
      urgencyLevel: 'low'
    };
  }
  
  const currentData = {};
  const todayData = {};
  
  // 현재 시간 데이터와 하루 전체 데이터 수집
  for (const item of items) {
    const fcstTime = parseInt(item.fcstTime);
    const fcstHour = Math.floor(fcstTime / 100);
    
    // 현재 시간 ±1시간 데이터
    if (Math.abs(fcstHour - currentHour) <= 1) {
      currentData[item.category] = item.fcstValue;
    }
    
    // 오늘 하루 전체 데이터 (최고/최저 기온용)
    todayData[item.category] = todayData[item.category] || [];
    todayData[item.category].push({
      time: fcstHour,
      value: item.fcstValue
    });
  }
  
  if (Object.keys(currentData).length === 0) {
    console.log('현재 시간대 날씨 데이터가 없습니다.');
    return {
      rainProbability: '정보 없음',
      temperature: '정보 없음',
      minTemp: '정보 없음',
      maxTemp: '정보 없음',
      skyCondition: '정보 없음',
      rainType: '정보 없음',
      rainAmount: '0',
      description: '현재 시간대 날씨 정보가 없습니다.',
      urgencyLevel: 'low'
    };
  }
  
  // 기본 데이터 추출
  const rainProb = currentData.POP || '0';
  const temp = currentData.TMP || '정보없음';
  const sky = currentData.SKY || '1';
  const rainType = currentData.PTY || '0';
  const rainAmount = currentData.RN1 || '0';
  
  // 최고/최저 기온 계산
  let minTemp = '정보없음';
  let maxTemp = '정보없음';
  
  if (todayData.TMN && todayData.TMN.length > 0) {
    minTemp = Math.min(...todayData.TMN.map(d => parseInt(d.value) || 0));
  }
  if (todayData.TMX && todayData.TMX.length > 0) {
    maxTemp = Math.max(...todayData.TMX.map(d => parseInt(d.value) || 0));
  }
  
  // 하늘 상태 해석
  let skyDescription;
  switch(sky) {
    case '1': skyDescription = '맑음'; break;
    case '3': skyDescription = '구름많음'; break;
    case '4': skyDescription = '흐림'; break;
    default: skyDescription = '정보없음';
  }
  
  // 강수 형태 해석
  let rainTypeDescription;
  switch(rainType) {
    case '0': rainTypeDescription = '없음'; break;
    case '1': rainTypeDescription = '비'; break;
    case '2': rainTypeDescription = '비/눈'; break;
    case '3': rainTypeDescription = '눈'; break;
    case '4': rainTypeDescription = '소나기'; break;
    default: rainTypeDescription = '정보없음';
  }
  
  // 긴급도 판단
  let urgencyLevel = 'low';
  const rainAmountNum = parseFloat(rainAmount.replace('mm', '')) || 0;
  const rainProbNum = parseInt(rainProb) || 0;
  
  if (rainAmountNum >= 10 || rainType === '4') {
    urgencyLevel = 'urgent'; // 소나기 또는 10mm 이상
  } else if (rainAmountNum >= 5 || rainProbNum >= 70) {
    urgencyLevel = 'important'; // 5mm 이상 또는 강수확률 70% 이상
  } else if (rainAmountNum > 0 || rainProbNum >= 30) {
    urgencyLevel = 'normal'; // 강수 있음 또는 30% 이상
  }
  
  // 설명 문자열 생성 - 강수 정보 우선
  let description = `${temp}°C`;
  
  if (minTemp !== '정보없음' && maxTemp !== '정보없음') {
    description += ` (${minTemp}-${maxTemp}°C)`;
  }
  
  // 강수 정보를 더 상세하게
  if (rainAmountNum > 0) {
    const currentTime = koreaTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    description += `, ${rainTypeDescription} ${rainAmount}mm/h`;
    if (rainProbNum > 0) {
      description += ` (확률 ${rainProb}%)`;
    }
    description += ` - ${currentTime} 기준`;
  } else if (rainProbNum > 0) {
    description += `, 강수확률 ${rainProb}%`;
    // 다음 예상 강수 시간대 추가하면 좋을 것
  }
  
  description += `, ${skyDescription}`;
  
  console.log('🌤️ 파싱된 날씨 데이터:', {
    현재기온: temp,
    최저최고: `${minTemp}-${maxTemp}`,
    강수형태: rainTypeDescription,
    강수량: rainAmount,
    강수확률: rainProb,
    긴급도: urgencyLevel
  });
  
  return {
    rainProbability: rainProb,
    temperature: temp,
    minTemp: minTemp,
    maxTemp: maxTemp,
    skyCondition: skyDescription,
    rainType: rainTypeDescription,
    rainAmount: rainAmount,
    description: description,
    urgencyLevel: urgencyLevel
  };
}

const getCurrentWeather = async () => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const baseDate = `${year}${month}${day}`;
    
    const hour = now.getHours();
    let baseTime;
    if (hour < 2) baseTime = '2300';
    else if (hour < 5) baseTime = '0200';
    else if (hour < 8) baseTime = '0500';
    else if (hour < 11) baseTime = '0800';
    else if (hour < 14) baseTime = '1100';
    else if (hour < 17) baseTime = '1400';
    else if (hour < 20) baseTime = '1700';
    else if (hour < 23) baseTime = '2000';
    else baseTime = '2300';
    
    const url = `${WEATHER_API_URL}?serviceKey=${SERVICE_KEY}&numOfRows=1000&pageNo=1&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=55&ny=127`;
    
    console.log('🌤️ 날씨 API 요청:', { baseDate, baseTime, hour });
    console.log('🔗 API URL:', url.substring(0, 100) + '...');
    
    const response = await axios.get(url);
    console.log('📡 날씨 API 응답 상태:', response.status);
    console.log('📊 응답 데이터 구조:', {
      hasResponse: !!response.data.response,
      hasBody: !!response.data.response?.body,
      hasItems: !!response.data.response?.body?.items,
      itemType: Array.isArray(response.data.response?.body?.items?.item) ? 'array' : typeof response.data.response?.body?.items?.item,
      itemCount: Array.isArray(response.data.response?.body?.items?.item) ? response.data.response.body.items.item.length : 'not array'
    });
    
    // 전체 응답 구조 디버깅
    console.log('🔍 전체 응답 데이터:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
    
    // XML 응답인 경우 (서비스 키 오류)
    if (typeof response.data === 'string' && response.data.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) {
      console.error('❌ 날씨 API 서비스 키 오류: 키가 등록되지 않았거나 만료됨');
      throw new Error('날씨 API 서비스 키가 만료되었습니다. 관리자에게 문의하세요.');
    }
    
    if (response.data.response?.header?.resultCode !== '00') {
      console.error('❌ 날씨 API 오류:', response.data.response?.header);
      throw new Error(`날씨 API 오류: ${response.data.response?.header?.resultMsg || '알 수 없는 오류'}`);
    }
    
    const items = response.data.response?.body?.items?.item;
    
    if (!items) {
      console.error('❌ 날씨 데이터 없음:', response.data);
      throw new Error('날씨 API에서 데이터를 가져올 수 없습니다.');
    }
    
    return parseWeatherData(items);
  } catch (error) {
    console.error('날씨 조회 실패:', error.message);
    return {
      rainProbability: '정보 없음',
      temperature: '정보 없음',
      skyCondition: '정보 없음',
      description: '날씨 정보를 가져올 수 없습니다.'
    };
  }
};

const getTopNews = async () => {
  try {
    if (!NYT_API_KEY) {
      console.log('📰 NYT API 키 없음 - 기본 메시지 반환');
      return { headline: 'NYT API 키가 설정되지 않았습니다.', abstract: '뉴스를 가져올 수 없습니다.' };
    }
    
    console.log('📰 NYT 뉴스 조회 시작...');
    const response = await axios.get(`https://api.nytimes.com/svc/topstories/v2/world.json?api-key=${NYT_API_KEY}`);
    const articles = response.data.results;
    
    if (articles && articles.length > 0) {
      const topArticle = articles[0];
      console.log('✅ NYT 뉴스 조회 성공:', { 
        count: articles.length, 
        title: topArticle.title?.substring(0, 50) + '...' 
      });
      return {
        headline: topArticle.title || '제목 없음',
        abstract: topArticle.abstract || '내용 없음'
      };
    }
    
    console.log('⚠️ NYT 뉴스 없음');
    return { headline: '뉴스를 찾을 수 없습니다.', abstract: '최신 뉴스가 없습니다.' };
  } catch (error) {
    console.error('❌ 뉴스 조회 실패:', error.message);
    if (error.response) {
      console.error('📡 NYT API 응답 오류:', {
        status: error.response.status,
        statusText: error.response.statusText
      });
    }
    return { headline: '뉴스 조회 실패', abstract: '뉴스를 가져올 수 없습니다.' };
  }
};

const getTodayEvents = async (dateStr) => {
  try {
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID) {
      console.log('📅 Notion API 키 또는 DB ID 없음 - 일정 조회 건너뜀');
      return [];
    }
    
    console.log('📅 오늘 일정 조회 시작:', { dateStr, dbId: NOTION_CALENDAR_DB_ID.substring(0, 8) + '...' });
    
    // 여러 가능한 속성명으로 시도 (Date, date, 날짜 등)
    const possibleDateProps = ['Date', 'date', '날짜', 'Created time', 'created_time'];
    let response;
    let usedProperty = null;
    
    for (const prop of possibleDateProps) {
      try {
        console.log(`📅 ${prop} 속성으로 시도 중...`);
        response = await axios.post(
          `https://api.notion.com/v1/databases/${NOTION_CALENDAR_DB_ID}/query`,
          {
            filter: {
              property: prop,
              date: {
                equals: dateStr
              }
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${NOTION_API_KEY}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            }
          }
        );
        
        usedProperty = prop;
        console.log(`✅ ${prop} 속성으로 성공!`);
        break;
      } catch (error) {
        console.log(`❌ ${prop} 속성 실패:`, error.response?.data?.message || error.message);
        continue;
      }
    }
    
    if (!response) {
      console.error('❌ 모든 날짜 속성 시도 실패 - 일정 조회 포기');
      return [];
    }
    
    console.log('✅ Notion 일정 API 응답 성공:', { 
      status: response.status, 
      resultCount: response.data?.results?.length || 0,
      usedProperty: usedProperty
    });
    
    return response.data.results.map((page, index) => {
      console.log(`📅 일정 ${index + 1} 속성들:`, Object.keys(page.properties));
      
      // 다양한 제목 속성명 시도
      const possibleTitleProps = ['Name', 'Title', 'title', '제목', '이름', '일정', 'Event', 'Task', 'Summary'];
      let titleProperty = null;
      let usedTitleProp = null;
      
      for (const prop of possibleTitleProps) {
        if (page.properties[prop]) {
          titleProperty = page.properties[prop];
          usedTitleProp = prop;
          break;
        }
      }
      
      let title = '제목 없음';
      
      if (titleProperty) {
        console.log(`📅 일정 ${index + 1} 제목 속성 (${usedTitleProp}):`, titleProperty);
        
        if (titleProperty.title && titleProperty.title.length > 0) {
          title = titleProperty.title.map(t => t.plain_text).join('');
        } else if (titleProperty.rich_text && titleProperty.rich_text.length > 0) {
          title = titleProperty.rich_text.map(t => t.plain_text).join('');
        }
        
        console.log(`📅 일정 ${index + 1} 최종 제목:`, title);
      } else {
        console.log(`❌ 일정 ${index + 1} 제목 속성 찾을 수 없음. 사용 가능한 속성:`, Object.keys(page.properties));
      }
      
      return title;
    });
  } catch (error) {
    console.error('❌ 오늘 일정 조회 실패:', error.message);
    if (error.response) {
      console.error('📡 Notion API 응답 오류:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    return [];
  }
};

const getTomorrowEvents = async (dateStr) => {
  try {
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID) {
      return [];
    }
    
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${NOTION_CALENDAR_DB_ID}/query`,
      {
        filter: {
          property: 'date', // 소문자로 시도
          date: {
            equals: dateStr
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.results.map(page => {
      const titleProperty = page.properties.Name || page.properties.Title || page.properties.title;
      let title = '제목 없음';
      
      if (titleProperty) {
        if (titleProperty.title && titleProperty.title.length > 0) {
          title = titleProperty.title.map(t => t.plain_text).join('');
        } else if (titleProperty.rich_text && titleProperty.rich_text.length > 0) {
          title = titleProperty.rich_text.map(t => t.plain_text).join('');
        }
      }
      
      return title;
    });
  } catch (error) {
    console.error('내일 일정 조회 실패:', error.message);
    return [];
  }
};

const getHighPriorityTasks = async () => {
  try {
    if (!NOTION_API_KEY || !NOTION_TASKS_DB_ID) {
      console.log('⭐ Notion API 키 또는 Tasks DB ID 없음 - 작업 조회 건너뜀');
      return [];
    }
    
    console.log('⭐ HIGH 우선순위 작업 조회 시작:', { dbId: NOTION_TASKS_DB_ID.substring(0, 8) + '...' });
    
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${NOTION_TASKS_DB_ID}/query`,
      {
        filter: {
          property: 'Status',
          status: {
            equals: 'HIGH'
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.results.map(page => {
      const titleProperty = page.properties.Name || page.properties.Title || page.properties.title;
      let title = '제목 없음';
      
      if (titleProperty) {
        if (titleProperty.title && titleProperty.title.length > 0) {
          title = titleProperty.title.map(t => t.plain_text).join('');
        } else if (titleProperty.rich_text && titleProperty.rich_text.length > 0) {
          title = titleProperty.rich_text.map(t => t.plain_text).join('');
        }
      }
      
      return title;
    });
  } catch (error) {
    console.error('HIGH 우선순위 태스크 조회 실패:', error.message);
    return [];
  }
};

const getDailyTasks = async () => {
  try {
    if (!NOTION_API_KEY || !NOTION_TASKS_DB_ID) {
      console.log('📅 Notion API 키 또는 Tasks DB ID 없음 - Daily 작업 조회 건너뜀');
      return [];
    }
    
    console.log('📅 Daily 작업 조회 시작:', { dbId: NOTION_TASKS_DB_ID.substring(0, 8) + '...' });
    
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${NOTION_TASKS_DB_ID}/query`,
      {
        filter: {
          property: 'Status',
          status: {
            equals: 'Daily'
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Daily 작업 조회 완료:', { count: response.data.results.length });
    
    return response.data.results.map(page => {
      const titleProperty = page.properties.Name || page.properties.Title || page.properties.title;
      let title = '제목 없음';
      
      if (titleProperty) {
        if (titleProperty.title && titleProperty.title.length > 0) {
          title = titleProperty.title.map(t => t.plain_text).join('');
        } else if (titleProperty.rich_text && titleProperty.rich_text.length > 0) {
          title = titleProperty.rich_text.map(t => t.plain_text).join('');
        }
      }
      
      return title;
    });
  } catch (error) {
    console.error('Daily 작업 조회 실패:', error.message);
    return [];
  }
};

const sendPushNotification = async (title, body, data = {}) => {
  const results = [];
  
  // Firebase Admin SDK 사용 가능 여부 확인 (간단한 방법)
  let isFirebaseReady = false;
  try {
    // Firebase messaging 객체가 존재하는지만 확인
    const messaging = admin.messaging();
    if (messaging) {
      isFirebaseReady = true;
      console.log('🔥 Firebase Messaging 객체 확인 완료');
    }
  } catch (error) {
    console.error('🔥 Firebase Messaging 초기화 확인 실패:', error.message);
    isFirebaseReady = false;
  }
  
  if (!isFirebaseReady) {
    console.log('🔔 FCM 알림 시뮬레이션 (Firebase 미초기화):', { title, body, data });
    return [{ device: 'simulation', success: false, reason: 'Firebase not initialized' }];
  }
  
  console.log('🔥 Firebase Messaging 초기화 확인됨');
  
  for (const [device, token] of Object.entries(fcmTokens)) {
    if (!token || token.startsWith('test-token-')) {
      console.log(`❌ ${device} FCM 토큰이 설정되지 않았거나 테스트 토큰입니다: ${token}`);
      results.push({ device, success: false, reason: 'Invalid or test token' });
      continue;
    }
    
    console.log(`📱 ${device}로 알림 전송 시도...`);
    console.log(`🔑 토큰 (앞 20자): ${token.substring(0, 20)}...`);
    
    try {
      // data-only 메시지로 변경 (Service Worker에서 처리)
      const message = {
        token: token,
        data: {
          title: title,
          body: body,
          timestamp: new Date().toISOString(),
          type: data.type || 'personal_secretary',
          executionId: data.executionId || '',
          click_action: '/'
        },
        webpush: {
          fcm_options: {
            link: '/'
          }
        }
      };
      
      console.log(`📤 ${device} 메시지 전송 중...`);
      const response = await admin.messaging().send(message);
      console.log(`✅ ${device} 알림 전송 성공:`, response);
      results.push({ device, success: true, response });
      
      // 첫 번째 성공한 전송에서만 히스토리 저장 (중복 방지)
      if (results.filter(r => r.success).length === 1) {
        await saveNotificationHistory(title, body, data.type, data.executionId);
      }
    } catch (error) {
      console.error(`❌ ${device} 알림 전송 실패:`, error.message);
      console.error(`❌ 오류 코드:`, error.code);
      console.error(`❌ 전체 오류:`, error);
      results.push({ device, success: false, error: error.message, code: error.code });
    }
  }
  
  // 토큰이 없는 경우에도 시뮬레이션 메시지 표시
  if (results.length === 0 || results.every(r => !r.success)) {
    console.log('🔔 FCM 알림 전송 실패 또는 토큰 없음:', { title, body, data });
  }
  
  return results;
};

const checkWeatherChanges = async (executionId) => {
  try {
    console.log(`[${executionId}] 날씨 변화 확인 시작...`);
    
    const currentWeather = await getCurrentWeather();
    if (!currentWeather) {
      console.error(`[${executionId}] 날씨 데이터를 가져올 수 없습니다 - 함수 종료`);
      return;
    }
    
    const previousState = await loadPreviousWeatherState();
    
    let shouldNotify = false;
    let notificationReason = '';
    let alertLevel = 'normal';
    
    if (!previousState) {
      shouldNotify = true;
      notificationReason = '날씨 모니터링 시작';
      alertLevel = 'info';
    } else {
      const currentRainProb = parseInt(currentWeather.rainProbability) || 0;
      const prevRainProb = parseInt(previousState.rainProbability) || 0;
      const currentTemp = parseInt(currentWeather.temperature) || 0;
      const prevTemp = parseInt(previousState.temperature) || 0;
      const currentRainAmount = parseFloat(currentWeather.rainAmount?.replace('mm', '')) || 0;
      const prevRainAmount = parseFloat(previousState.rainAmount?.replace('mm', '')) || 0;
      
      // 1. 긴급 알림: 강수량 급증, 소나기 발생 (즉시 알림 필요)
      if (currentRainAmount >= 10 || currentWeather.rainType === '소나기') {
        shouldNotify = true;
        alertLevel = 'urgent';
        if (currentWeather.rainType === '소나기') {
          notificationReason = `소나기 발생! (${currentRainAmount}mm/h)`;
        } else {
          notificationReason = `집중호우 (${currentRainAmount}mm/h)`;
        }
      }
      // 2. 중요 알림: 상당한 강수량 변화만 (기준 상향)
      else if (currentRainAmount >= 5 || Math.abs(currentRainAmount - prevRainAmount) >= 3) {
        shouldNotify = true;
        alertLevel = 'important';
        if (currentRainAmount > prevRainAmount) {
          notificationReason = `강수량 급증: ${prevRainAmount}mm → ${currentRainAmount}mm/h`;
        } else {
          notificationReason = `강수량 급감: ${prevRainAmount}mm → ${currentRainAmount}mm/h`;
        }
      }
      // 강수확률 변화는 더 큰 변화만 알림 (50% 이상)
      else if (Math.abs(currentRainProb - prevRainProb) >= 50) {
        shouldNotify = true;
        alertLevel = 'important';
        if (currentRainProb > prevRainProb) {
          notificationReason = `강수확률 급증: ${prevRainProb}% → ${currentRainProb}%`;
        } else {
          notificationReason = `강수확률 급감: ${prevRainProb}% → ${currentRainProb}%`;
        }
      }
      // 기온 변화 알림 (매우 극단적인 경우만)
      else if (Math.abs(currentTemp - prevTemp) >= 10) {
        shouldNotify = true;
        alertLevel = 'urgent';
        notificationReason = `극단적 기온 변화: ${prevTemp}°C → ${currentTemp}°C`;
      }
      // 3. 일반 알림: 큰 강수확률 변화만 (30% 이상)
      else if (Math.abs(currentRainProb - prevRainProb) >= 30) {
        shouldNotify = true;
        alertLevel = 'normal';
        notificationReason = `강수확률 변화: ${prevRainProb}% → ${currentRainProb}%`;
      }
      else if (currentWeather.rainType !== previousState.rainType && currentWeather.rainType !== '없음') {
        shouldNotify = true;
        alertLevel = 'important';
        notificationReason = `강수 형태 변화: ${previousState.rainType || '없음'} → ${currentWeather.rainType}`;
      }
      else if (currentWeather.skyCondition !== previousState.skyCondition) {
        // 하늘 상태 변화는 강수와 연관될 때만 알림
        const isSignificantSkyChange = 
          (previousState.skyCondition === '맑음' && currentWeather.skyCondition === '흐림' && currentRainProb >= 30) ||
          (previousState.skyCondition === '흐림' && currentWeather.skyCondition === '맑음' && prevRainProb >= 30);
        
        if (isSignificantSkyChange) {
          shouldNotify = true;
          alertLevel = 'normal';
          notificationReason = `날씨 변화: ${previousState.skyCondition} → ${currentWeather.skyCondition}`;
        }
      }
    }
    
    if (shouldNotify) {
      // 알림 제목과 아이콘을 긴급도에 따라 설정
      let title;
      switch (alertLevel) {
        case 'urgent':
          title = '🚨 긴급 날씨 알림';
          break;
        case 'important':
          title = '⚠️ 중요 날씨 알림';
          break;
        case 'info':
          title = '📍 날씨 모니터링';
          break;
        default:
          title = '🌤️ 날씨 변화 알림';
      }
      
      const body = `${currentWeather.description}\n\n${notificationReason}`;
      
      await sendPushNotification(title, body, {
        type: 'weather_change',
        executionId: executionId,
        alertLevel: alertLevel,
        urgency: currentWeather.urgencyLevel
      });
      
      console.log(`[${executionId}] 날씨 ${alertLevel} 알림 전송: ${notificationReason}`);
    } else {
      console.log(`[${executionId}] 유의미한 날씨 변화 없음 - 알림 전송 안 함`);
    }
    
    await saveWeatherState(currentWeather);
    console.log(`[${executionId}] 날씨 변화 확인 완료`);
    
  } catch (error) {
    console.error(`[${executionId}] 날씨 변화 확인 실패:`, error);
    throw error;
  }
};

const sendMorningBriefing = async (executionId) => {
  try {
    console.log(`[${executionId}] 아침 브리핑 시작...`);
    
    // 한국 시간으로 오늘 날짜 계산
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const todayStr = koreaTime.toISOString().split('T')[0];
    
    console.log(`[${executionId}] 한국 시간 기준 오늘 날짜: ${todayStr}`);
    
    const [weather, news, todayEvents, highTasks, dailyTasks] = await Promise.all([
      getCurrentWeather(),
      getTopNews(),
      getTodayEvents(todayStr),
      getHighPriorityTasks(),
      getDailyTasks()
    ]);
    
    let briefing = `🌅 좋은 아침입니다!\n\n`;
    briefing += `🌤️ 오늘 날씨: ${weather.description}\n\n`;
    
    if (todayEvents.length > 0) {
      briefing += `📅 오늘의 일정:\n${todayEvents.map(event => `• ${event}`).join('\n')}\n\n`;
    } else {
      briefing += `📅 오늘 등록된 일정이 없습니다.\n\n`;
    }
    
    if (highTasks.length > 0) {
      briefing += `⭐ HIGH 우선순위 작업:\n${highTasks.map(task => `• ${task}`).join('\n')}\n\n`;
    }
    
    if (dailyTasks.length > 0) {
      briefing += `🔄 Daily 작업:\n${dailyTasks.map(task => `• ${task}`).join('\n')}\n\n`;
    }
    
    briefing += `📰 주요 뉴스:\n${news.headline}\n${news.abstract}`;
    
    await sendPushNotification('🌅 아침 브리핑', briefing, {
      type: 'morning_briefing',
      executionId: executionId
    });
    
    console.log(`[${executionId}] 아침 브리핑 전송 완료`);
    
  } catch (error) {
    console.error(`[${executionId}] 아침 브리핑 실패:`, error);
    throw error;
  }
};

const sendEveningBriefing = async (executionId) => {
  try {
    console.log(`[${executionId}] 저녁 브리핑 시작...`);
    
    // 한국 시간으로 내일 날짜 계산
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const tomorrow = new Date(koreaTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
    
    console.log(`[${executionId}] 한국 시간 기준 내일 날짜: ${tomorrowDateStr}`);
    
    const [tomorrowEvents, highTasks, dailyTasks] = await Promise.all([
      getTomorrowEvents(tomorrowDateStr),
      getHighPriorityTasks(),
      getDailyTasks()
    ]);
    
    let briefing = `🌆 저녁 브리핑입니다.\n\n`;
    
    if (tomorrowEvents.length > 0) {
      briefing += `📅 내일의 일정:\n${tomorrowEvents.map(event => `• ${event}`).join('\n')}\n\n`;
    } else {
      briefing += `📅 내일 등록된 일정이 없습니다.\n\n`;
    }
    
    if (highTasks.length > 0) {
      briefing += `⭐ HIGH 우선순위 작업:\n${highTasks.map(task => `• ${task}`).join('\n')}\n\n`;
    } else {
      briefing += `⭐ HIGH 우선순위 작업이 없습니다.\n\n`;
    }
    
    if (dailyTasks.length > 0) {
      briefing += `🔄 Daily 작업:\n${dailyTasks.map(task => `• ${task}`).join('\n')}`;
    } else {
      briefing += `🔄 Daily 작업이 없습니다.`;
    }
    
    await sendPushNotification('🌆 저녁 브리핑', briefing, {
      type: 'evening_briefing',
      executionId: executionId
    });
    
    console.log(`[${executionId}] 저녁 브리핑 전송 완료`);
    
  } catch (error) {
    console.error(`[${executionId}] 저녁 브리핑 실패:`, error);
    throw error;
  }
};

// Express 서버 설정 (개발/테스트용)
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 알림 히스토리 조회 API
app.get('/api/notifications', async (req, res) => {
  try {
    const history = await loadNotificationHistory();
    res.json({
      success: true,
      notifications: history,
      count: history.length
    });
  } catch (error) {
    console.error('히스토리 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 테스트 알림 전송 API
app.post('/api/test-notification', async (req, res) => {
  try {
    const { title, body } = req.body;
    const testTitle = title || '🧪 테스트 알림';
    const testBody = body || '서버에서 전송한 테스트 알림입니다.';
    
    const results = await sendPushNotification(testTitle, testBody, {
      type: 'test',
      executionId: 'manual-test-' + Date.now()
    });
    
    res.json({
      success: true,
      results: results,
      message: '테스트 알림이 전송되었습니다.'
    });
  } catch (error) {
    console.error('테스트 알림 전송 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 서버 시작 (포트가 설정된 경우 또는 개발 환경)
const PORT = process.env.PORT || (process.env.NODE_ENV !== 'production' ? 3000 : null);
if (PORT) {
  app.listen(PORT, () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`📱 알림 히스토리: http://localhost:${PORT}/history.html`);
    console.log(`📊 API 엔드포인트: http://localhost:${PORT}/api/notifications`);
  });
} else {
  console.log('💡 Express 서버가 시작되지 않았습니다. 히스토리 기능을 사용하려면 PORT 환경변수를 설정하세요.');
}

module.exports = {
  sendPushNotification,
  checkWeatherChanges,
  sendMorningBriefing,
  sendEveningBriefing,
  getCurrentWeather,
  getTopNews,
  getTodayEvents,
  getTomorrowEvents,
  getHighPriorityTasks,
  getDailyTasks,
  loadNotificationHistory,
  saveNotificationHistory,
  app
};
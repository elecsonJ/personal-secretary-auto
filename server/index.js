const admin = require('firebase-admin');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 환경 변수가 설정되지 않았습니다.');
  }
  
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const WEATHER_API_URL = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const SERVICE_KEY = 'DecGaYFaJhEcm%2BWE4VqPKFPH2R9Ja6eI7w3OL2fgZCUMGDgJRjl%2BgRqkv%2Fx34vn0OJXTz26K3ywHvfFl4EfB4w%3D%3D';

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
    await fs.writeFile(WEATHER_STATE_FILE, JSON.stringify(weatherData, null, 2));
  } catch (error) {
    console.error('날씨 상태 저장 실패:', error);
  }
};

function parseWeatherData(items) {
  const now = new Date();
  const koreaTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  const currentHour = koreaTime.getHours();
  
  if (!items || items.length === 0) {
    console.log('날씨 데이터가 없습니다.');
    return {
      rainProbability: '정보 없음',
      temperature: '정보 없음',
      skyCondition: '정보 없음',
      description: '날씨 정보를 가져올 수 없습니다.'
    };
  }
  
  const currentData = {};
  
  for (const item of items) {
    const fcstTime = parseInt(item.fcstTime);
    const fcstHour = Math.floor(fcstTime / 100);
    
    if (Math.abs(fcstHour - currentHour) <= 1) {
      currentData[item.category] = item.fcstValue;
    }
  }
  
  if (Object.keys(currentData).length === 0) {
    console.log('현재 시간대 날씨 데이터가 없습니다.');
    return {
      rainProbability: '정보 없음',
      temperature: '정보 없음',
      skyCondition: '정보 없음',
      description: '현재 시간대 날씨 정보가 없습니다.'
    };
  }
  
  const rainProb = currentData.POP || '0';
  const temp = currentData.TMP || '정보없음';
  const sky = currentData.SKY || '1';
  
  let skyDescription;
  switch(sky) {
    case '1': skyDescription = '맑음'; break;
    case '3': skyDescription = '구름많음'; break;
    case '4': skyDescription = '흐림'; break;
    default: skyDescription = '정보없음';
  }
  
  return {
    rainProbability: rainProb,
    temperature: temp,
    skyCondition: skyDescription,
    description: `${temp}°C, ${rainProb}% ${skyDescription}`
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
    
    const response = await axios.get(url);
    const items = response.data.response?.body?.items?.item;
    
    if (!items) {
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
      return { headline: 'NYT API 키가 설정되지 않았습니다.', abstract: '뉴스를 가져올 수 없습니다.' };
    }
    
    const response = await axios.get(`https://api.nytimes.com/svc/topstories/v2/world.json?api-key=${NYT_API_KEY}`);
    const articles = response.data.results;
    
    if (articles && articles.length > 0) {
      const topArticle = articles[0];
      return {
        headline: topArticle.title || '제목 없음',
        abstract: topArticle.abstract || '내용 없음'
      };
    }
    
    return { headline: '뉴스를 찾을 수 없습니다.', abstract: '최신 뉴스가 없습니다.' };
  } catch (error) {
    console.error('뉴스 조회 실패:', error.message);
    return { headline: '뉴스 조회 실패', abstract: '뉴스를 가져올 수 없습니다.' };
  }
};

const getTodayEvents = async (dateStr) => {
  try {
    if (!NOTION_API_KEY || !NOTION_CALENDAR_DB_ID) {
      return [];
    }
    
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${NOTION_CALENDAR_DB_ID}/query`,
      {
        filter: {
          property: 'Date',
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
    console.error('오늘 일정 조회 실패:', error.message);
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
          property: 'Date',
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
      return [];
    }
    
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

const sendPushNotification = async (title, body, data = {}) => {
  const results = [];
  
  for (const [device, token] of Object.entries(fcmTokens)) {
    if (!token) {
      console.log(`${device} FCM 토큰이 설정되지 않았습니다.`);
      continue;
    }
    
    try {
      const message = {
        token: token,
        notification: {
          title: title,
          body: body
        },
        data: {
          timestamp: new Date().toISOString(),
          ...data
        },
        webpush: {
          fcm_options: {
            link: '/'
          }
        }
      };
      
      const response = await admin.messaging().send(message);
      console.log(`${device} 알림 전송 성공:`, response);
      results.push({ device, success: true, response });
    } catch (error) {
      console.error(`${device} 알림 전송 실패:`, error);
      results.push({ device, success: false, error: error.message });
    }
  }
  
  return results;
};

const checkWeatherChanges = async (executionId) => {
  try {
    console.log(`[${executionId}] 날씨 변화 확인 시작...`);
    
    const currentWeather = await getCurrentWeather();
    const previousState = await loadPreviousWeatherState();
    
    let shouldNotify = false;
    let notificationReason = '';
    
    if (!previousState) {
      shouldNotify = true;
      notificationReason = '첫 번째 실행';
    } else {
      const currentRainProb = parseInt(currentWeather.rainProbability) || 0;
      const prevRainProb = parseInt(previousState.rainProbability) || 0;
      const currentTemp = parseInt(currentWeather.temperature) || 0;
      const prevTemp = parseInt(previousState.temperature) || 0;
      
      if (Math.abs(currentRainProb - prevRainProb) >= 20) {
        shouldNotify = true;
        notificationReason = `강수확률 변화: ${prevRainProb}% → ${currentRainProb}%`;
      } else if (Math.abs(currentTemp - prevTemp) >= 5) {
        shouldNotify = true;
        notificationReason = `기온 변화: ${prevTemp}°C → ${currentTemp}°C`;
      } else if (currentWeather.skyCondition !== previousState.skyCondition) {
        shouldNotify = true;
        notificationReason = `날씨 변화: ${previousState.skyCondition} → ${currentWeather.skyCondition}`;
      }
    }
    
    if (shouldNotify) {
      const title = '🌤️ 날씨 변화 알림';
      const body = `${currentWeather.description}\n변화 사유: ${notificationReason}`;
      
      await sendPushNotification(title, body, {
        type: 'weather_change',
        executionId: executionId
      });
      
      console.log(`[${executionId}] 날씨 변화 알림 전송: ${notificationReason}`);
    } else {
      console.log(`[${executionId}] 날씨 변화 없음 - 알림 전송 안 함`);
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
    
    const now = new Date();
    const korea = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const todayStr = korea.toISOString().split('T')[0];
    
    const [weather, news, todayEvents, highTasks] = await Promise.all([
      getCurrentWeather(),
      getTopNews(),
      getTodayEvents(todayStr),
      getHighPriorityTasks()
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
    
    const now = new Date();
    const korea = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const tomorrow = new Date(korea);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];
    
    const [tomorrowEvents, highTasks] = await Promise.all([
      getTomorrowEvents(tomorrowDateStr),
      getHighPriorityTasks()
    ]);
    
    let briefing = `🌆 저녁 브리핑입니다.\n\n`;
    
    if (tomorrowEvents.length > 0) {
      briefing += `📅 내일의 일정:\n${tomorrowEvents.map(event => `• ${event}`).join('\n')}\n\n`;
    } else {
      briefing += `📅 내일 등록된 일정이 없습니다.\n\n`;
    }
    
    if (highTasks.length > 0) {
      briefing += `⭐ HIGH 우선순위 작업:\n${highTasks.map(task => `• ${task}`).join('\n')}`;
    } else {
      briefing += `⭐ HIGH 우선순위 작업이 없습니다.`;
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

module.exports = {
  sendPushNotification,
  checkWeatherChanges,
  sendMorningBriefing,
  sendEveningBriefing,
  getCurrentWeather,
  getTopNews,
  getTodayEvents,
  getTomorrowEvents,
  getHighPriorityTasks
};
# 📡 API 문서

개인 비서 자동화 시스템의 REST API 명세서입니다.

## 🌐 Base URL

- **로컬 개발**: `http://localhost:3000`
- **프로덕션**: `https://personal-secretary-auto.vercel.app`

## 🔐 인증

현재 API는 인증이 필요하지 않습니다. 모든 엔드포인트는 공개 접근이 가능합니다.

> **참고**: 향후 다중 사용자 지원 시 JWT 기반 인증 시스템 도입 예정

## 📊 응답 형식

모든 API 응답은 JSON 형식이며, 다음 구조를 따릅니다:

```json
{
  "success": true,
  "data": {}, 
  "message": "성공 메시지",
  "timestamp": "2024-09-18T05:30:00.000Z"
}
```

### 에러 응답 형식
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지",
    "details": "상세 정보"
  },
  "timestamp": "2024-09-18T05:30:00.000Z"
}
```

## 📱 알림 히스토리 API

### GET `/api/notifications`

모든 알림 히스토리를 조회합니다.

#### 요청
```http
GET /api/notifications
```

#### 쿼리 파라미터
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `limit` | number | 아니오 | 100 | 반환할 알림 수 제한 |
| `offset` | number | 아니오 | 0 | 건너뛸 알림 수 |
| `type` | string | 아니오 | - | 알림 타입 필터링 |
| `source` | string | 아니오 | - | 알림 소스 필터링 |

#### 응답 예시
```json
{
  "success": true,
  "notifications": [
    {
      "id": 1726631400000,
      "title": "🌅 아침 브리핑",
      "body": "🌡️ 18°C (최저 15°C, 최고 25°C)\\n☔ 강수확률: 30%\\n\\n📅 오늘 일정\\n• 프로젝트 회의 (14:00)\\n\\n📋 발송 이유: 아침 브리핑 스케줄\\n🕐 확인 시간: 2024. 9. 18 오전 7:00:00",
      "type": "morning_briefing",
      "executionId": "github-actions-1234-5678",
      "timestamp": "2024-09-18T05:00:00.000Z",
      "source": "server"
    },
    {
      "id": 1726628800000,
      "title": "🚨 긴급 날씨 알림",
      "body": "🌧️ 현재 날씨: 22°C, 강수량 12mm/h\\n소나기가 시작되었습니다!\\n\\n📋 발송 이유: 소나기 발생! (12mm/h)\\n🕐 확인 시간: 2024. 9. 18 오후 2:25:30",
      "type": "weather_change",
      "executionId": "github-actions-5678-9012",
      "timestamp": "2024-09-18T05:25:30.000Z",
      "source": "github-actions"
    }
  ],
  "count": 2,
  "total": 15,
  "hasMore": true
}
```

#### 상태 코드
- `200 OK`: 성공
- `500 Internal Server Error`: 서버 오류

### POST `/api/test-notification`

테스트 알림을 전송합니다.

#### 요청
```http
POST /api/test-notification
Content-Type: application/json
```

#### 요청 본문
```json
{
  "title": "테스트 알림",
  "body": "테스트 메시지입니다.",
  "type": "test"
}
```

#### 요청 필드
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | string | 아니오 | 알림 제목 (기본값: "🧪 테스트 알림") |
| `body` | string | 아니오 | 알림 내용 (기본값: "테스트 메시지입니다.") |
| `type` | string | 아니오 | 알림 타입 (기본값: "test") |

#### 응답 예시
```json
{
  "success": true,
  "message": "테스트 알림이 전송되었습니다.",
  "notification": {
    "id": 1726631500000,
    "title": "🧪 테스트 알림",
    "body": "테스트 메시지입니다.",
    "type": "test",
    "executionId": "manual-test-1726631500000",
    "timestamp": "2024-09-18T05:31:40.000Z",
    "source": "manual"
  }
}
```

#### 상태 코드
- `200 OK`: 성공
- `400 Bad Request`: 잘못된 요청
- `500 Internal Server Error`: 서버 오류

## 🌤️ 날씨 정보 API

### GET `/api/weather/current`

현재 날씨 정보를 조회합니다.

#### 응답 예시
```json
{
  "success": true,
  "weather": {
    "temperature": "18",
    "minTemperature": "15",
    "maxTemperature": "25",
    "rainProbability": "30",
    "rainAmount": "2mm",
    "rainType": "비",
    "skyCondition": "맑음",
    "description": "맑음, 강수확률 30%",
    "lastUpdated": "2024-09-18T05:00:00.000Z",
    "urgencyLevel": "normal"
  },
  "source": "korean_meteorological_administration"
}
```

### GET `/api/weather/changes`

최근 날씨 변화 히스토리를 조회합니다.

#### 응답 예시
```json
{
  "success": true,
  "changes": [
    {
      "timestamp": "2024-09-18T05:25:30.000Z",
      "previous": {
        "rainProbability": "10",
        "rainAmount": "0mm"
      },
      "current": {
        "rainProbability": "80",
        "rainAmount": "12mm"
      },
      "reason": "소나기 발생! (12mm/h)",
      "alertLevel": "urgent",
      "notificationSent": true
    }
  ]
}
```

## 📅 일정 정보 API

### GET `/api/schedule/today`

오늘 일정을 조회합니다.

#### 응답 예시
```json
{
  "success": true,
  "events": [
    "프로젝트 회의 (14:00)",
    "친구 만남 (19:00)"
  ],
  "source": "notion",
  "lastSync": "2024-09-18T05:00:00.000Z"
}
```

### GET `/api/schedule/tomorrow`

내일 일정을 조회합니다.

#### 응답 예시
```json
{
  "success": true,
  "events": [
    "팀 미팅 (10:00)",
    "병원 방문 (15:00)"
  ],
  "source": "notion",
  "lastSync": "2024-09-18T05:00:00.000Z"
}
```

## 🔧 시스템 상태 API

### GET `/api/health`

시스템 상태를 확인합니다.

#### 응답 예시
```json
{
  "success": true,
  "status": "healthy",
  "services": {
    "firebase": {
      "status": "connected",
      "lastCheck": "2024-09-18T05:30:00.000Z"
    },
    "notion": {
      "status": "connected",
      "lastSync": "2024-09-18T05:00:00.000Z"
    },
    "weather_api": {
      "status": "connected",
      "lastUpdate": "2024-09-18T05:15:00.000Z"
    },
    "git_storage": {
      "status": "active",
      "lastCommit": "2024-09-18T05:25:30.000Z"
    }
  },
  "uptime": "2 days, 14 hours, 35 minutes",
  "version": "2.0.0"
}
```

### GET `/api/version`

시스템 버전 정보를 조회합니다.

#### 응답 예시
```json
{
  "success": true,
  "version": "2.0.0",
  "buildDate": "2024-09-18",
  "features": [
    "git_based_storage",
    "smart_weather_detection",
    "notion_integration",
    "fcm_notifications",
    "pwa_client"
  ],
  "changelog": "https://github.com/your-username/personal-secretary-auto/blob/main/README.md#-버전-히스토리"
}
```

## 📊 통계 API

### GET `/api/stats/notifications`

알림 전송 통계를 조회합니다.

#### 쿼리 파라미터
| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
|---------|------|------|--------|------|
| `period` | string | 아니오 | "7d" | 통계 기간 (1d, 7d, 30d) |
| `type` | string | 아니오 | - | 알림 타입 필터 |

#### 응답 예시
```json
{
  "success": true,
  "period": "7d",
  "stats": {
    "total": 142,
    "byType": {
      "morning_briefing": 7,
      "evening_briefing": 7,
      "weather_change": 18,
      "test": 110
    },
    "bySource": {
      "github-actions": 32,
      "server": 14,
      "manual": 96
    },
    "byDay": [
      {"date": "2024-09-18", "count": 25},
      {"date": "2024-09-17", "count": 20},
      {"date": "2024-09-16", "count": 18}
    ]
  }
}
```

## 🔍 검색 API

### GET `/api/search/notifications`

알림 히스토리를 검색합니다.

#### 쿼리 파라미터
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `q` | string | 예 | 검색 키워드 |
| `limit` | number | 아니오 | 결과 수 제한 (기본값: 20) |
| `type` | string | 아니오 | 알림 타입 필터 |

#### 응답 예시
```json
{
  "success": true,
  "query": "날씨",
  "results": [
    {
      "id": 1726628800000,
      "title": "🚨 긴급 날씨 알림",
      "body": "소나기가 시작되었습니다!",
      "type": "weather_change",
      "timestamp": "2024-09-18T05:25:30.000Z",
      "relevance": 0.95
    }
  ],
  "count": 1,
  "totalFound": 15
}
```

## 🚨 에러 코드

| 코드 | 설명 | 해결 방법 |
|------|------|-----------|
| `FIREBASE_NOT_INITIALIZED` | Firebase 초기화 실패 | 환경변수 확인 |
| `NOTION_API_ERROR` | Notion API 오류 | API 키 및 권한 확인 |
| `WEATHER_API_ERROR` | 기상청 API 오류 | API 키 확인 |
| `FCM_TOKEN_MISSING` | FCM 토큰 없음 | 클라이언트에서 토큰 생성 확인 |
| `GIT_COMMIT_FAILED` | Git 커밋 실패 | Repository 권한 확인 |
| `INVALID_REQUEST` | 잘못된 요청 | 요청 형식 확인 |
| `RATE_LIMIT_EXCEEDED` | 요청 한도 초과 | 잠시 후 재시도 |

## 📝 사용 예시

### JavaScript (Fetch API)
```javascript
// 알림 히스토리 조회
const response = await fetch('/api/notifications?limit=10');
const data = await response.json();

if (data.success) {
  console.log('알림 목록:', data.notifications);
} else {
  console.error('에러:', data.error);
}

// 테스트 알림 전송
const testResponse = await fetch('/api/test-notification', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: '사용자 정의 테스트',
    body: 'API 테스트 중입니다.'
  })
});

const testData = await testResponse.json();
console.log('테스트 결과:', testData);
```

### cURL
```bash
# 알림 히스토리 조회
curl -X GET "https://personal-secretary-auto.vercel.app/api/notifications?limit=5"

# 테스트 알림 전송
curl -X POST "https://personal-secretary-auto.vercel.app/api/test-notification" \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트","body":"cURL 테스트"}'

# 현재 날씨 조회
curl -X GET "https://personal-secretary-auto.vercel.app/api/weather/current"
```

### Python (requests)
```python
import requests

# 알림 히스토리 조회
response = requests.get('https://personal-secretary-auto.vercel.app/api/notifications')
data = response.json()

if data['success']:
    for notification in data['notifications']:
        print(f"{notification['timestamp']}: {notification['title']}")

# 테스트 알림 전송
test_data = {
    'title': 'Python 테스트',
    'body': 'Python에서 API 테스트 중입니다.'
}

response = requests.post(
    'https://personal-secretary-auto.vercel.app/api/test-notification',
    json=test_data
)

print('테스트 결과:', response.json())
```

## 🔄 웹훅 (향후 계획)

### POST `/api/webhooks/github`
GitHub Actions 완료 알림 (계획 중)

### POST `/api/webhooks/notion`
Notion 데이터베이스 변경 알림 (계획 중)

### POST `/api/webhooks/weather`
기상청 데이터 업데이트 알림 (계획 중)

## 📈 성능 및 제한사항

### 응답 시간
- **알림 조회**: < 200ms
- **테스트 알림**: < 500ms
- **날씨 정보**: < 1s (외부 API 의존)
- **일정 정보**: < 1s (Notion API 의존)

### 요청 제한
- **일반 API**: 분당 60회
- **테스트 알림**: 분당 10회
- **검색 API**: 분당 30회

### 데이터 제한
- **알림 히스토리**: 최대 100개 보관
- **응답 크기**: 최대 1MB
- **요청 크기**: 최대 100KB

---

📚 **API 문서는 지속적으로 업데이트됩니다. 최신 정보는 [GitHub Repository](https://github.com/your-username/personal-secretary-auto)에서 확인하세요.**
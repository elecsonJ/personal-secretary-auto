# 🤖 개인 비서 자동화 시스템

Firebase FCM과 GitHub Actions를 활용한 스마트 개인 비서 알림 시스템

## ✨ 주요 기능

### 📱 자동 알림 시스템
- **아침 브리핑** (매일 7:00): 날씨 + 오늘 일정 통합 브리핑
- **저녁 준비** (매일 19:00): 내일 일정 + 준비사항
- **실시간 날씨 모니터링**: 기상청 API 기반 스마트 변화 감지
  - 14:15, 17:15, 20:15, 23:15 (KST) 정기 체크
  - 의미있는 날씨 변화만 알림 (노이즈 최소화)

### 🌤️ 스마트 날씨 시스템
- **기상청 공식 API** 연동 (서울 실시간 데이터)
- **강수량 중심 알림**: 습도보다 실제 강수량/확률 우선
- **중복 알림 방지**: 동일한 이유로 3시간 내 중복 알림 차단
- **긴급도별 분류**:
  - 🚨 **긴급**: 강수량 10mm 이상, 소나기 발생
  - ⚠️ **중요**: 강수량 5mm 이상 또는 3mm 이상 변화
  - 📍 **일반**: 강수확률 30% 이상 변화, 날씨 호전 알림
- **발송 이유 명시**: 모든 알림에 구체적인 발송 이유 포함
- **상황 호전 알림**: 비가 그치거나 강수확률이 크게 감소할 때도 알림

### 📋 Notion 통합
- **캘린더 연동**: 오늘/내일 일정 자동 분석
- **다양한 속성명 지원**: 제목, 이름, 일정, Title, Name 등
- **실시간 동기화**: API 기반 최신 일정 정보

### 🗄️ Git 기반 영구 저장
- **날씨 상태**: `data/weather-state.json` 자동 커밋 (알림 기록 포함)
- **알림 히스토리**: `data/notification-history.json` 영구 보관
- **중복 방지 정보**: 마지막 알림 시간 및 이유 추적
- **100% 데이터 보존**: GitHub Actions 재시작과 무관하게 연속성 보장
- **자동 커밋**: Weather Bot과 Notification Bot이 자동 관리

### 📱 PWA 클라이언트
- **통합 알림 히스토리**: 서버 + 로컬 알림 스마트 병합
- **소스별 구분**: 🤖 GitHub Actions, 📱 FCM 직접, 🖥️ 서버
- **실시간 API**: `/api/notifications` 엔드포인트 제공
- **오프라인 지원**: Service Worker + IndexedDB 기반

## 🏗️ 시스템 아키텍처

```
GitHub Actions (스케줄러) 
    ↓ 자동 실행
Node.js 서버 (날씨 API + Notion 연동)
    ↓ FCM 전송
Firebase Cloud Messaging
    ↓ 실시간 푸시
PWA 클라이언트 (iOS/Android/Desktop)
    ↓ 히스토리 저장
Git Repository (영구 보관)
```

### 📊 데이터 흐름
1. **GitHub Actions**: 정해진 스케줄에 따라 서버 코드 실행
2. **날씨 API**: 기상청에서 최신 날씨 데이터 수집
3. **Notion API**: 개인 캘린더와 작업 데이터 동기화
4. **변화 감지**: 이전 상태와 비교하여 알림 필요성 판단
5. **FCM 전송**: Firebase를 통해 다중 디바이스로 푸시 알림
6. **Git 저장**: 상태와 히스토리를 Repository에 자동 커밋
7. **클라이언트 표시**: PWA에서 통합된 히스토리 표시

## 🚀 설치 및 설정

### 1. 저장소 클론 및 의존성 설치
```bash
git clone https://github.com/your-username/personal-secretary-auto.git
cd personal-secretary-auto
npm install
```

### 2. Firebase 프로젝트 설정

#### Firebase Console에서:
1. 새 프로젝트 생성
2. Cloud Messaging 활성화
3. 웹 앱 등록 및 설정 정보 복사
4. 서비스 계정 생성 및 JSON 키 다운로드

#### 클라이언트 설정:
`client/index.html`과 `client/firebase-messaging-sw.js`의 Firebase 설정 업데이트:
```javascript
const firebaseConfig = {
    apiKey: "AIzaSyDOJg47e_S3-sgZJMeYZwSsy-MqS463rc0",
    authDomain: "personal-secretary-auto.firebaseapp.com",
    projectId: "personal-secretary-auto",
    storageBucket: "personal-secretary-auto.firebasestorage.app",
    messagingSenderId: "10792151581",
    appId: "1:10792151581:web:69fc187087a3566f9db4f4",
    measurementId: "G-R4097RRZ9B"
};
```

### 3. GitHub Secrets 설정

Repository Settings > Secrets and variables > Actions에서 추가:

#### 필수 환경변수:
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
FCM_TOKEN_MACBOOK=your-macbook-fcm-token
FCM_TOKEN_IPHONE=your-iphone-fcm-token
NOTION_API_KEY=your-notion-integration-token
NOTION_CALENDAR_DB_ID=your-calendar-database-id
NOTION_TASKS_DB_ID=your-tasks-database-id
WEATHER_API_KEY=korean-meteorological-admin-api-key
```

#### FCM 토큰 획득 방법:
1. PWA 클라이언트에 접속
2. 브라우저 개발자 도구 > Console
3. FCM 토큰이 자동 생성되어 로그에 표시됨
4. `localStorage.getItem('fcmToken')`으로도 확인 가능

### 4. GitHub Actions 권한 설정

워크플로우가 Repository에 커밋할 수 있도록 설정:
- Repository Settings > Actions > General
- Workflow permissions: "Read and write permissions" 선택

## ⏰ 자동 스케줄링

GitHub Actions `.github/workflows/notifications.yml`에서 관리:

```yaml
schedule:
  # 날씨 모니터링 (기상청 업데이트 시간에 맞춤)
  - cron: '15 5,8,11,14 * * *'  # 14:15, 17:15, 20:15, 23:15 KST
  # 아침 브리핑
  - cron: '0 22 * * *'           # 07:00 KST (UTC-9)
  # 저녁 준비
  - cron: '0 10 * * *'           # 19:00 KST (UTC-9)
```

### 스케줄 상세:
- **날씨 체크**: 기상청 동네예보 업데이트 시간(02,05,08,11,14,17,20,23시) 15분 후
- **아침 브리핑**: 매일 7:00 (1회만, 중복 방지)
- **저녁 준비**: 매일 19:00 (내일 준비사항)

## 📱 PWA 설치 방법

### iOS (iPhone/iPad):
1. Safari에서 `https://personal-secretary-auto.vercel.app` 접속
2. 공유 버튼 → "홈 화면에 추가"
3. 홈 화면 아이콘으로 앱 실행
4. 알림 권한 허용
5. FCM 토큰 자동 생성 확인

### Android:
1. Chrome에서 클라이언트 URL 접속
2. "앱 설치" 배너 클릭 또는 메뉴에서 "앱 추가"
3. 홈 화면에 추가된 앱 실행
4. 알림 권한 허용

### Desktop:
1. Chrome/Edge에서 URL 표시줄 오른쪽 설치 아이콘 클릭
2. "설치" 클릭
3. 독립 창으로 실행

## 🔧 로컬 개발 환경

```bash
# 서버 실행 (히스토리 API 포함)
npm run server

# 개발 모드 (nodemon으로 자동 재시작)
npm run dev

# 단일 실행
npm start

# 테스트 실행
npm test
```

### 로컬 테스트:
- `http://localhost:3000`: 메인 PWA 인터페이스
- `http://localhost:3000/history.html`: 알림 히스토리 페이지
- `http://localhost:3000/api/notifications`: 알림 API 엔드포인트

## 🎯 알림 유형별 상세

### 🌅 아침 브리핑 (07:00)
```
🌅 아침 브리핑
🌡️ 18°C (최저 15°C, 최고 25°C)
☔ 강수확률: 30%
💧 강수량: 2mm/h
🌧️ 강수형태: 비
⏰ 강수시간: 14:00-17:00

📅 오늘 일정
• 프로젝트 회의 (14:00)
• 친구 만남 (19:00)

📋 발송 이유: 아침 브리핑 스케줄
🕐 확인 시간: 2024. 9. 18 오전 7:00:00
```

### 🌆 저녁 준비 (19:00)
```
🌆 내일 준비
📅 내일 일정 (9월 19일)
• 팀 미팅 (10:00)
• 병원 방문 (15:00)

📋 발송 이유: 저녁 준비 스케줄
🕐 확인 시간: 2024. 9. 18 오후 7:00:00
```

### ⚠️ 날씨 변화 알림
```
🚨 긴급 날씨 알림
🌧️ 현재 날씨: 22°C, 강수량 12mm/h
소나기가 시작되었습니다!

📋 발송 이유: 소나기 발생! (12mm/h)
🕐 확인 시간: 2024. 9. 18 오후 2:25:30
```

## 📊 Git 기반 데이터 관리

### 자동 커밋 시스템:
```
data/
├── weather-state.json      # 날씨 상태 (Weather Bot 관리)
└── notification-history.json  # 알림 히스토리 (Notification Bot 관리)
```

### 커밋 메시지 형식:
- 날씨: `Update weather state - 2024-09-18T05:30:00.000Z`
- 알림: `Add notification: 🌅 아침 브리핑... - 2024-09-18T05:30:00.000Z`

### 데이터 보존 정책:
- **날씨 상태**: 항상 최신 상태만 유지
- **알림 히스토리**: 최대 100개 유지 (오래된 것 자동 삭제)
- **Git 히스토리**: 모든 변경사항 영구 보존

## 🔍 모니터링 및 디버깅

### GitHub Actions 로그 확인:
1. Repository > Actions 탭
2. 최근 워크플로우 실행 확인
3. 실패 시 상세 로그 분석
4. Git 커밋 상태 확인

### 클라이언트 디버깅:
```javascript
// 브라우저 콘솔에서 디버깅
console.log('FCM Token:', localStorage.getItem('fcmToken'));
console.log('Notification History:', localStorage.getItem('notificationHistory'));

// 서버 API 테스트
fetch('/api/notifications').then(r => r.json()).then(console.log);
```

### 일반적인 문제 해결:

#### 1. 동일한 날씨 알림이 계속 반복되는 경우:
- **원인**: 알림 중복 방지 로직 문제 또는 Git 커밋 실패
- **해결**: Repository 권한 확인, Actions 로그에서 Git 커밋 에러 확인
- **개선**: 동일 알림은 3시간 내 중복 발송 차단 (v2.1.0 개선사항)

#### 2. 아침 브리핑이 중복으로 오는 경우:
- **원인**: 백업 cron 작업 실행 (이미 수정됨)
- **해결**: 최신 버전에서는 수정됨 (단일 스케줄만 실행)

#### 3. Notion 일정이 "제목 없음"으로 표시되는 경우:
- **원인**: Notion 데이터베이스 속성명 불일치
- **해결**: 다양한 속성명 자동 감지 (Title, Name, 제목, 이름 등)

#### 4. FCM 알림이 안 오는 경우:
- **단계별 체크**:
  1. 브라우저 알림 권한 확인
  2. FCM 토큰 생성 확인 (콘솔 로그)
  3. GitHub Secrets의 FCM_TOKEN 값 확인
  4. Firebase 프로젝트 설정 확인

## 📡 API 문서

### GET `/api/notifications`
알림 히스토리 조회

**응답 예시:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": 1726631400000,
      "title": "🌅 아침 브리핑",
      "body": "오늘 날씨와 일정을 확인하세요...",
      "type": "morning_briefing",
      "executionId": "github-actions-1234-5678",
      "timestamp": "2024-09-18T05:00:00.000Z",
      "source": "server"
    }
  ],
  "count": 1
}
```

### POST `/api/test-notification`
테스트 알림 전송

**요청 예시:**
```json
{
  "title": "테스트 알림",
  "body": "테스트 메시지입니다."
}
```

## 🔒 보안 고려사항

- **API 키 관리**: 모든 민감 정보는 GitHub Secrets로 암호화
- **Firebase 보안**: 서비스 계정 키 Base64 인코딩 저장
- **HTTPS 전용**: 모든 통신은 HTTPS로 암호화
- **토큰 보안**: FCM 토큰은 디바이스별로 격리 관리
- **Git 권한**: Repository 쓰기 권한은 GitHub Actions에만 제한

## 🛠️ 커스터마이징

### 알림 시간 변경:
`.github/workflows/notifications.yml` 파일의 cron 표현식 수정
```yaml
# 아침 브리핑을 8시로 변경하려면:
- cron: '0 23 * * *'  # 08:00 KST (UTC+9)
```

### 날씨 알림 기준 조정:
`server/index.js`에서 임계값 수정
```javascript
// 긴급 알림 기준 (현재: 10mm)
if (currentRainAmount >= 15 || currentWeather.rainType === '소나기') {
  
// 중요 알림 기준 (현재: 5mm)
else if (currentRainAmount >= 8 || Math.abs(currentRainAmount - prevRainAmount) >= 5) {
```

### 새로운 알림 타입 추가:
1. `server/index.js`에 새 함수 추가
2. `.github/workflows/notifications.yml`에 스케줄 추가
3. 테스트 함수를 클라이언트에 추가

## 🤝 기여하기

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### 개발 가이드라인:
- 모든 변경사항은 테스트 후 커밋
- README.md 업데이트 포함
- GitHub Actions 로그로 동작 확인
- FCM 알림 테스트 필수

## 📊 기술 스택

### Backend:
- **Node.js**: 서버 런타임
- **Firebase Admin SDK**: FCM 알림 전송
- **Axios**: HTTP 클라이언트
- **Express**: API 서버 (선택적)

### Frontend:
- **PWA**: Progressive Web App
- **Service Worker**: 백그라운드 알림 처리
- **IndexedDB**: 로컬 알림 저장
- **Firebase SDK**: 클라이언트 FCM 처리

### Infrastructure:
- **GitHub Actions**: 서버리스 크론 스케줄러
- **Vercel**: 정적 사이트 호스팅
- **Git**: 데이터 영구 저장

### APIs:
- **기상청 동네예보**: 실시간 날씨 데이터
- **Notion API**: 개인 일정 및 작업 관리
- **Firebase FCM**: 크로스 플랫폼 푸시 알림

## 📄 라이센스

MIT License - 자유롭게 사용 및 수정 가능

## 🆘 트러블슈팅 체크리스트

### 🚨 알림이 전혀 오지 않는 경우:
- [ ] GitHub Actions가 정상 실행되는지 확인
- [ ] Firebase 서비스 계정 키가 올바른지 확인
- [ ] FCM 토큰이 GitHub Secrets에 등록되었는지 확인
- [ ] 브라우저/앱에서 알림 권한이 허용되었는지 확인

### 🔄 날씨 알림이 이상한 경우:
- [ ] "날씨 모니터링 시작" 알림 반복 → Git 커밋 권한 확인
- [ ] 부정확한 날씨 정보 → 기상청 API 키 확인
- [ ] 과도한 알림 → 임계값 조정 필요

### 📅 일정 알림 문제:
- [ ] "제목 없음" 표시 → Notion 속성명 확인 (최신 버전에서 수정됨)
- [ ] 일정이 안 나타남 → Notion API 키와 DB ID 확인
- [ ] 날짜 형식 오류 → Notion DB 날짜 속성 확인

### 💾 데이터 저장 문제:
- [ ] 히스토리가 사라짐 → Git 커밋 로그 확인
- [ ] 중복 데이터 → 최신 병합 로직 적용됨
- [ ] API 응답 오류 → 서버 로그 확인

---

⭐ **이 프로젝트가 도움이 되셨다면 Star를 눌러주세요!**

## 📝 버전 히스토리

### v2.1.0 (2024-09-24) - 현재 버전
- **중복 알림 방지 시스템**: 동일한 이유로 3시간 내 중복 알림 차단
- **상황 호전 알림 추가**: 비가 그치거나 강수확률이 크게 감소할 때 알림
- **알림 추적 강화**: 마지막 알림 시간 및 이유를 날씨 상태에 저장
- **기존 FCM 토큰 호환성**: iPhone FCM 토큰 등 기존 설정 완전 보존

### v2.0.0 (2024-09-18)
- Git 기반 영구 저장 시스템 구축
- 뉴스 시스템 제거 (개인화된 뉴스 웹페이지 검토 중)
- 날씨 알림 스케줄 최적화 (기상청 업데이트 주기에 맞춤)
- 알림 발송 이유 디버깅 기능 추가
- Notion 일정 제목 문제 해결
- 아침 브리핑 중복 발송 문제 해결
- Service Worker 기반 FCM 처리 개선

### v1.0.0 (2024-08-28) - 초기 버전
- Firebase FCM 기본 알림 시스템
- GitHub Actions 기반 스케줄링
- Notion API 연동
- 기상청 날씨 API 연동
- PWA 클라이언트 구축
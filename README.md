# 🤖 개인 비서 자동화 시스템

Firebase FCM과 GitHub Actions를 활용한 스마트 개인 비서 알림 시스템

## ✨ 주요 기능

### 📱 자동 알림 시스템
- **아침 브리핑** (매일 7시): **8개 연속 알림**
  - 🌤️ 상세 날씨 (온도, 최고/최저기온, 강수시간, 강도)
  - 📅 오늘 일정 (Notion 연동)
  - 🎯 우선순위 태스크 (HIGH/Middle)
  - 📰 주요 뉴스 (5개 항목)
  - 🤖 기술 뉴스 (5개 항목) 
  - 🔬 과학 뉴스 (5개 항목)
  - 💰 경제 뉴스 (5개 항목)
  - 📅 내일 일정 미리보기
- **저녁 준비** (매일 21시): 내일 일정 + 준비사항
- **날씨 급변 알림** (2시간마다): **적응형 임계값**으로 스마트 감지

### 🌤️ 실시간 날씨 통합
- **기상청 공식 API** 연동 (서울 실시간 데이터)
- **상세 강수정보**: 정확한 시간대 (예: 14:00-18:00), 강수량/강도 분석
- **적응형 임계값**: 상황별 알림 민감도 자동 조절
- **일 최고/최저기온**: 하루 온도 변화 예측으로 옷차림 가이드
- **똑똑한 우산 추천**: 강수형태(비/눈/빗방울) 구분 알림

### 📋 Notion 데이터베이스 연동
- **캘린더 DB** ("월간"): 오늘/내일 일정 자동 분석
- **우선순위 태스크** ("우선순위"): HIGH/Middle 등급만 선별 알림
- 실시간 일정 및 태스크 상태 동기화

### 📰 다중 뉴스 통합 (NYT API)
- **4개 카테고리**: 주요뉴스, 기술, 과학, 경제
- **각 카테고리별 5개 항목**: 총 20개 최신 뉴스
- 아침 브리핑에 순차적으로 전달 (0.5초 간격)

### 🔄 PWA 클라이언트 기능
- **알림 히스토리 대시보드**: 모든 수신 알림 기록 관리
- **실시간 새로고침**: 우측 상단 🔄 버튼으로 즉시 업데이트  
- **멀티디바이스 지원**: iPhone + MacBook 동시 알림
- **오프라인 지원**: Service Worker 기반 PWA

## 🏗️ 시스템 아키텍처

```
GitHub Actions (크론 스케줄러)
       ↓
Node.js 서버 (날씨 API + Notion 연동)
       ↓  
Firebase FCM (푸시 알림)
       ↓
PWA 클라이언트 (iOS/Android 지원)
```

## 🚀 설치 및 설정

### 1. 저장소 클론 및 의존성 설치
```bash
git clone <repo-url>
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
`client/index.html`의 Firebase 설정 업데이트:
```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com", 
    messagingSenderId: "123456789",
    appId: "your-app-id"
};
```

### 3. GitHub Secrets 설정

Repository Settings > Secrets and variables > Actions에서 추가:

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."} (Base64 인코딩)
FCM_TOKEN_IPHONE=your-iphone-fcm-token  
FCM_TOKEN_MACBOOK=your-macbook-fcm-token
NYT_API_KEY=your-nyt-api-key
NOTION_API_KEY=your-notion-integration-token
NOTION_CALENDAR_DB_ID=your-calendar-database-id
NOTION_TASKS_DB_ID=your-tasks-database-id  
KMA_API_KEY=korean-meteorological-admin-api-key
```

### 4. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일 편집하여 실제 값 입력
```

## 📱 PWA 설치 방법

### iOS (iPhone/iPad):
1. Safari에서 클라이언트 URL 접속
2. 공유 버튼 → "홈 화면에 추가"
3. 홈 화면 아이콘으로 앱 실행
4. 알림 권한 허용

### Android:
1. Chrome에서 클라이언트 URL 접속  
2. "앱 설치" 배너 클릭
3. 홈 화면에 추가된 앱 실행
4. 알림 권한 허용

## 🔧 로컬 테스트

```bash
# 서버 실행 (크론 작업 포함)
npm start

# 개발 모드 (nodemon)
npm run dev

# 단일 테스트 실행
npm test
```

## ⏰ 자동 스케줄링

GitHub Actions가 다음 시간에 자동 실행:

- **2시간마다** (날씨 변화 체크 - 적응형 임계값 적용)
- **07:00** (아침 브리핑 - 8개 연속 알림) 
- **21:00** (저녁 준비 - 내일 일정)

> 한국 시간 기준으로 UTC+9 적용

## 🎯 알림 유형별 상세

### 🌅 아침 브리핑 (8개 연속 알림, 0.5초 간격)
1. **🌤️ 상세 날씨**: 현재 온도, 최고/최저기온, 강수시간/강도, 우산 추천
2. **📅 오늘 일정**: Notion "월간" DB에서 오늘 일정 추출  
3. **🎯 우선순위 태스크**: "우선순위" DB에서 HIGH/Middle 등급만 선별
4. **📰 주요 뉴스**: NYT 메인 뉴스 5개 항목
5. **🤖 기술 뉴스**: NYT 기술 섹션 5개 항목  
6. **🔬 과학 뉴스**: NYT 과학 섹션 5개 항목
7. **💰 경제 뉴스**: NYT 경제 섹션 5개 항목
8. **📅 내일 일정**: 내일 캘린더 일정 미리보기

### 🌆 저녁 준비 (1개 알림)  
- **내일 일정 + 준비사항**: 내일 캘린더 일정 및 필요한 준비물 안내

### ⚠️ 날씨 급변 알림 (적응형)
- **맑음→비**: 15% 변화 시 알림 (우산 준비 중요)
- **비→맑음**: 20% 변화 시 알림 (외출 계획 변경)  
- **폭우 상황**: 10% 변화도 알림 (위험 상황)
- **미세 변화**: 25% 이상만 알림 (노이즈 방지)

## 📱 알림 예시

### **맑은 날 아침 브리핑:**
```
🌅 날씨 브리핑
🌡️ 18°C (최저 15°C, 최고 25°C) ☀️ 10% 맑음

📅 오늘 일정  
📚 프로젝트 회의 (14:00)
🍻 친구 만남 (19:00)

🎯 우선순위 태스크
🔴 보고서 작성
🟡 이메일 답장

📰 주요 뉴스
1. 주요 경제 동향...
[4개 뉴스 카테고리 계속]
```

### **비 오는 날 상세 정보:**  
```
🌅 날씨 브리핑
🌡️ 18°C (최저 15°C, 최고 22°C) ☔ 80%
⏰ 강수시간: 13:00-17:00, 20:00-23:00  
💧 예상강수량: 5mm (보통비)
🌧️ 형태: 비
🌂 우산 챙기세요!
```

### **날씨 급변 알림:**
```
☔⚠️ 날씨 급변 알림
강수확률이 25% 증가했습니다!
이전: 10%
현재: 35% 
온도: 22°C
```

## 🔍 모니터링 및 디버깅

### GitHub Actions 로그 확인:
1. Repository > Actions 탭
2. 워크플로우 실행 기록 확인
3. 실패 시 상세 로그 분석

### 클라이언트 디버깅:
- PWA 내 로그 영역에서 실시간 상태 확인
- FCM 토큰 생성 및 테스트 기능 제공
- 브라우저 개발자 도구 Console 탭 활용

## 📊 데이터 소스

- **날씨**: 한국 기상청 동네예보 API (PCP, PTY, TMX, TMN 포함)
- **뉴스**: New York Times API (4개 카테고리, 각 5개 항목)
- **일정관리**: Notion API (개인 "월간", "우선순위" 데이터베이스)
- **알림전송**: Firebase Cloud Messaging (멀티디바이스)
- **자동화**: GitHub Actions (서버리스 크론 + 워크플로우)
- **배포**: Vercel (정적 사이트 호스팅)

## 🔒 보안 고려사항

- API 키는 모두 환경 변수로 관리
- GitHub Secrets로 민감 정보 암호화
- Firebase 서비스 계정 키 안전 보관
- HTTPS 전용 통신

## 🛠️ 커스터마이징

### 알림 시간 변경:
`.github/workflows/notifications.yml` 파일의 cron 표현식 수정

### 날씨 임계값 조정:  
`server/index.js`의 `WEATHER_CHANGE_THRESHOLD` 값 변경

### 새로운 알림 타입 추가:
1. `server/index.js`에 새 함수 추가
2. GitHub Actions 워크플로우에 스텝 추가
3. 클라이언트에 테스트 버튼 추가

## 🤝 기여하기

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`) 
5. Open a Pull Request

## 📄 라이센스

MIT License - 자유롭게 사용 및 수정 가능

## 🆘 문제 해결

### 알림이 오지 않는 경우:
1. FCM 토큰 재생성
2. 브라우저 알림 권한 확인
3. PWA 재설치 후 테스트
4. GitHub Actions 실행 로그 확인

### iOS에서 PWA가 작동하지 않는 경우:
1. Safari로만 접속 (Chrome/Firefox 불가)
2. "홈 화면에 추가" 후 홈 화면 아이콘으로 실행
3. Standalone 모드에서만 알림 기능 사용 가능

---

⭐ **이 프로젝트가 도움이 되셨다면 Star를 눌러주세요!**
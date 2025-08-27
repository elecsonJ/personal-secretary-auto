# 🤖 개인 비서 자동화 시스템

Firebase FCM과 GitHub Actions를 활용한 스마트 개인 비서 알림 시스템

## ✨ 주요 기능

### 📱 자동 알림 시스템
- **아침 브리핑** (매일 7시): 날씨 + 오늘 일정 + 우선순위 태스크
- **저녁 준비** (매일 21시): 내일 일정 + 오늘 남은 우선순위 작업  
- **날씨 급변 알림** (3시간마다): 강수확률 20% 이상 변화 시 즉시 알림

### 🌤️ 실시간 날씨 통합
- 기상청 공식 API 연동 (실제 서울 날씨 데이터)
- 스마트 날씨 변화 감지 알고리즘
- 우산 필요 여부 및 옷차림 추천

### 📋 Notion 데이터베이스 연동
- **캘린더 DB**: 오늘/내일 일정 자동 분석
- **우선순위 태스크**: HIGH/Middle 등급만 선별 알림
- 실시간 태스크 완료율 추적

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
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
FCM_TOKEN=your-device-fcm-token
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

- **03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00, 00:00** (날씨 체크)
- **07:00** (아침 브리핑) 
- **21:00** (저녁 준비)

> 한국 시간 기준으로 UTC+9 적용

## 🎯 알림 유형별 상세

### 🌅 아침 브리핑 (3개 연속 알림)
1. **날씨 브리핑**: 오늘 온도, 강수확률, 우산 필요 여부
2. **오늘 일정**: Notion 캘린더에서 오늘 일정 추출  
3. **우선순위 태스크**: HIGH/Middle 등급 태스크만 선별

### 🌆 저녁 준비 (2개 연속 알림)  
1. **내일 일정**: 내일 캘린더 일정 미리보기
2. **오늘 잔여 작업**: 미완료 우선순위 태스크 현황

### ⚠️ 날씨 급변 알림
- 강수확률 20% 이상 변화 감지 시 즉시 전송
- 증가/감소 방향과 변화량 상세 정보 제공

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

- **날씨**: 기상청 동네예보 API (무료, 공식)
- **일정관리**: Notion API (개인 데이터베이스)
- **알림전송**: Firebase Cloud Messaging
- **자동화**: GitHub Actions (서버리스 크론)

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
# 🤝 개발 기여 가이드

개인 비서 자동화 시스템 개발에 기여해주셔서 감사합니다!

## 📋 기여하기 전 체크리스트

- [ ] [README.md](./README.md)를 완전히 읽고 시스템 구조 이해
- [ ] 로컬 환경에서 시스템이 정상 작동하는지 확인
- [ ] GitHub Actions 로그를 확인하여 현재 시스템 상태 파악
- [ ] 기존 이슈나 PR이 있는지 확인

## 🚀 개발 환경 설정

### 1. 저장소 포크 및 클론
```bash
# 1. GitHub에서 Repository Fork
# 2. 로컬에 클론
git clone https://github.com/your-username/personal-secretary-auto.git
cd personal-secretary-auto

# 3. 의존성 설치
npm install

# 4. 환경변수 설정
cp .env.example .env
# .env 파일 편집 (로컬 테스트용)
```

### 2. 로컬 테스트 환경
```bash
# 서버 실행 (포트 3000)
npm run server

# 개발 모드 (nodemon 자동 재시작)
npm run dev

# PWA 클라이언트 접속
open http://localhost:3000
```

### 3. Firebase 로컬 설정 (선택사항)
- 로컬에서는 Firebase 없이도 시뮬레이션 모드로 테스트 가능
- FCM 알림은 GitHub Secrets 설정 후 GitHub Actions에서만 실제 전송됨

## 🏗️ 프로젝트 구조 이해

```
personal-secretary-auto/
├── .github/workflows/
│   └── notifications.yml          # GitHub Actions 스케줄러
├── client/
│   ├── index.html                 # 메인 PWA 인터페이스
│   ├── history.html               # 알림 히스토리 페이지
│   └── firebase-messaging-sw.js   # FCM Service Worker
├── server/
│   ├── index.js                   # 메인 서버 로직
│   └── test.js                    # 테스트 스크립트
├── data/                          # Git 기반 영구 저장
│   ├── weather-state.json         # 날씨 상태
│   └── notification-history.json  # 알림 히스토리
├── README.md                      # 메인 문서
├── CONTRIBUTING.md                # 이 파일
├── .env.example                   # 환경변수 템플릿
└── package.json                   # 프로젝트 설정
```

## 🔧 개발 가이드라인

### 코드 스타일
- **ES6+ JavaScript** 사용
- **비동기 처리**: async/await 권장
- **에러 처리**: try-catch 블록으로 안전하게 처리
- **로깅**: console.log 대신 구조화된 로그 메시지 사용

### 커밋 메시지 규칙
```
타입: 간단한 설명

상세 설명 (필요시)

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**타입 예시:**
- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 업데이트
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 기타 작업

### 브랜치 전략
```bash
# 기능 개발
git checkout -b feature/weather-improvements
git checkout -b feature/notion-integration

# 버그 수정
git checkout -b fix/notification-duplicate

# 문서 업데이트
git checkout -b docs/api-documentation
```

## 🧪 테스트 가이드라인

### 필수 테스트 항목

#### 1. 로컬 서버 테스트
```bash
# 서버 실행 테스트
npm run server

# API 엔드포인트 테스트
curl http://localhost:3000/api/notifications

# 테스트 스크립트 실행
npm test
```

#### 2. PWA 클라이언트 테스트
- [ ] 메인 페이지 로딩 확인
- [ ] 알림 히스토리 페이지 작동 확인
- [ ] FCM 토큰 생성 확인 (콘솔 로그)
- [ ] Service Worker 등록 확인
- [ ] 오프라인 모드 테스트

#### 3. GitHub Actions 테스트
- [ ] 워크플로우 문법 검증
- [ ] 환경변수 접근 확인
- [ ] Git 커밋 권한 확인
- [ ] 스케줄 시간 계산 확인

### 테스트 체크리스트

#### 날씨 시스템:
- [ ] 기상청 API 호출 정상 작동
- [ ] 날씨 상태 파일 저장/로드
- [ ] 변화 감지 로직 정확성
- [ ] 긴급도별 알림 분류 확인

#### Notion 통합:
- [ ] API 키 유효성 확인
- [ ] 데이터베이스 접근 권한
- [ ] 다양한 속성명 처리
- [ ] 날짜 형식 파싱 정확성

#### FCM 알림:
- [ ] 토큰 생성 및 저장
- [ ] 다중 디바이스 지원
- [ ] 알림 발송 이유 포함
- [ ] 히스토리 자동 저장

## 🐛 버그 리포트 가이드

### 버그 리포트 템플릿
```markdown
## 🐛 버그 설명
간단한 버그 설명

## 🔄 재현 단계
1. 특정 조건에서
2. 특정 동작을 수행하면
3. 예상과 다른 결과 발생

## 🎯 예상 동작
정상적으로 작동해야 하는 방식

## 📱 환경 정보
- OS: [iOS 17.5 / Android 14 / macOS 14.5]
- 브라우저: [Safari 17.5 / Chrome 126]
- PWA 설치 여부: [예/아니오]

## 📊 로그 정보
관련 로그나 에러 메시지

## 📷 스크린샷
필요한 경우 스크린샷 첨부
```

### 중요한 디버깅 정보

#### GitHub Actions 로그:
```bash
# Actions 탭에서 확인할 정보
- 워크플로우 실행 성공/실패
- 환경변수 누락 여부
- Git 커밋 에러
- API 호출 응답 상태
```

#### 클라이언트 디버깅:
```javascript
// 브라우저 콘솔에서 실행
console.log('FCM Token:', localStorage.getItem('fcmToken'));
console.log('Service Worker:', navigator.serviceWorker.controller);
console.log('Notification Permission:', Notification.permission);
```

## ✨ 기능 제안 가이드

### 기능 제안 템플릿
```markdown
## 💡 기능 제안
새로운 기능에 대한 설명

## 🎯 목적 및 동기
이 기능이 왜 필요한지 설명

## 📋 상세 명세
- 구체적인 동작 방식
- 사용자 인터페이스
- 기술적 구현 방안

## 🔗 관련 이슈
기존 이슈나 토론과의 연관성

## 📊 우선순위
[높음/중간/낮음] 및 이유
```

### 자주 제안되는 기능들

#### 1. 새로운 알림 타입
- 교통정보 알림
- 환율 변동 알림
- 주식 가격 알림
- 할 일 마감일 알림

#### 2. UI/UX 개선
- 다크 모드 지원
- 알림 카테고리별 필터
- 설정 페이지 추가
- 통계 대시보드

#### 3. 시스템 확장
- 다중 사용자 지원
- 알림 스케줄 커스터마이징
- 외부 서비스 연동 확대
- 모바일 앱 개발

## 🔍 코드 리뷰 가이드라인

### 리뷰어 체크리스트

#### 기능성:
- [ ] 요구사항을 정확히 구현했는가?
- [ ] 기존 기능에 영향을 주지 않는가?
- [ ] 에러 처리가 적절한가?
- [ ] 로깅이 충분한가?

#### 안전성:
- [ ] 민감한 정보가 노출되지 않는가?
- [ ] API 키가 하드코딩되지 않았는가?
- [ ] 입력값 검증이 적절한가?
- [ ] 권한 설정이 올바른가?

#### 성능:
- [ ] 불필요한 API 호출이 없는가?
- [ ] 메모리 누수 가능성은 없는가?
- [ ] 비동기 처리가 효율적인가?
- [ ] 캐싱이 적절히 사용되는가?

#### 유지보수성:
- [ ] 코드가 읽기 쉬운가?
- [ ] 함수가 적절히 분리되었는가?
- [ ] 주석이 필요한 부분에 있는가?
- [ ] 문서가 업데이트되었는가?

## 🚀 배포 프로세스

### 자동 배포 시스템
1. **main 브랜치 push** → **Vercel 자동 배포**
2. **GitHub Actions** → **스케줄 자동 실행**
3. **Git 커밋** → **데이터 영구 저장**

### 수동 배포 체크리스트
- [ ] 로컬 테스트 완료
- [ ] README.md 업데이트
- [ ] 환경변수 설정 확인
- [ ] GitHub Actions 테스트
- [ ] 배포 후 동작 확인

## 📞 도움말 및 지원

### 문의 채널
- **GitHub Issues**: 버그 리포트 및 기능 제안
- **GitHub Discussions**: 일반적인 질문 및 토론
- **Pull Request**: 코드 기여 및 리뷰

### 응답 시간
- **버그 리포트**: 24-48시간 내 초기 응답
- **기능 제안**: 1주일 내 검토
- **Pull Request**: 2-3일 내 리뷰

### 기여자 인정
모든 기여자는 다음과 같이 인정받습니다:
- README.md의 기여자 목록에 추가
- 커밋 히스토리에 Co-authored-by 태그
- 릴리즈 노트에 기여 내용 명시

---

🙏 **여러분의 기여가 이 프로젝트를 더욱 발전시킵니다!**
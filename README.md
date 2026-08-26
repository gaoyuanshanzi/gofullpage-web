# GoFullPage Web Pro 📸

> **웹 기반 전체 페이지 캡처 및 다중 포맷(PNG, PDF, HTML) 로컬 저장 도구**  
> 백엔드 중심(Puppeteer) 렌더링 & 고해상도 지능형 스크롤 캡처 엔진

---

## ✨ 주요 기능 및 특징

1. **지능형 전체 페이지 스크롤 (Auto-scroll Engine)**
   - Lazy-loading 이미지, 웹 폰트, 무한 스크롤, 비동기 데이터 렌더링을 자동으로 감지하고 하단까지 스크롤하여 완전한 화면을 캡처합니다.
2. **다중 출력 포맷 지원**
   - **PNG**: Retina 2x 고해상도 전체 페이지 스크린샷
   - **PDF**: A4 인쇄 규격 PDF 문서 생성 및 다운로드
   - **HTML**: 브라우저 렌더링 완료 후의 전체 DOM 소스 코드 추출
3. **직관적인 좌우 2분할(Split-Screen) 화이트 테마 UI**
   - **좌측 패널**: URL 입력, 해상도 선택 (FHD, QHD, 4K, Mobile), 포맷 셀렉터, 실시간 대상 웹사이트 iframe 미리보기
   - **우측 패널**: 단계별 캡처 진행 상태(Progress Stepper), 줌/스크롤 미리보기, 원클릭 로컬 다운로드, 최근 캡처 히스토리
4. **듀얼 실행 환경 지원**
   - 로컬 Node.js + Express 서버
   - Vercel Serverless Function (`@sparticuz/chromium` + `puppeteer-core`) 호환

---

## 🚀 로컬 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 서버 시작
npm start

# 3. 브라우저에서 접속
http://localhost:3000
```

---

## 🌐 API 명세

### `POST /api/capture`
웹페이지를 캡처하여 Base64 결과물 및 메타데이터를 반환합니다.

#### 요청 본문 (JSON)
```json
{
  "url": "https://news.ycombinator.com",
  "format": "png",             // "png" | "pdf" | "html"
  "viewportWidth": 1920,       // 선택 사항 (기본: 1920)
  "viewportHeight": 1080,      // 선택 사항 (기본: 1080)
  "deviceScaleFactor": 2,      // 선택 사항 (기본: 2)
  "delayMs": 500               // 선택 사항 (기본: 500)
}
```

#### 응답 본문 (JSON)
```json
{
  "success": true,
  "filename": "Hacker-News_2026-08-27T08-00-00-000Z.png",
  "format": "png",
  "mimeType": "image/png",
  "sizeBytes": 1284902,
  "title": "Hacker News",
  "dimensions": { "width": 1920, "height": 3840 },
  "data": "data:image/png;base64,...",
  "durationSeconds": 4.12
}
```

---

## 🛠️ 기술 스택
- **Backend:** Node.js, Express, Puppeteer, Puppeteer-Core, @sparticuz/chromium
- **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript, Lucide Icons
- **Deployment:** Vercel Serverless, GitHub Actions

# 63빌딩 3층 회의실 예약 시스템

회의실 **3 / 4 / 5 / 7** 을 날짜·시간대별로 예약하는 웹앱입니다.
로그인 없이 이름만 입력하면 예약/취소가 가능합니다. (사내 신뢰 환경 가정)

- **프론트엔드**: 순수 HTML + CSS + JS (빌드 과정 없음)
- **백엔드/DB**: Supabase (Postgres + 실시간 구독)
- **이중예약 방지**: DB 차원에서 같은 회의실의 시간대 겹침을 원천 차단

## 화면 기능
- **일별 보기**: 회의실 3·4·5·7 을 한눈에 보는 타임라인
- **주별 보기**: 회의실 하나를 골라 월~일 7일 타임라인으로 조회
- 날짜 이동 (이전/다음/오늘) — 일별은 ±1일, 주별은 ±7일
- 빈 시간대를 클릭하면 예약 모달 (시작/종료·이름·부서·제목)
- **중복검사 미리보기**: 시간을 고르는 즉시 "예약 가능 / 겹침" 표시, 겹치면 예약 버튼 비활성화
- 예약 블록을 클릭하면 취소
- 다른 사람이 예약하면 실시간으로 자동 반영
- 운영 시간 09:00–18:00, 30분 단위

---

## 설치 (5분)

### 1. Supabase 프로젝트 만들기
1. <https://supabase.com> 에서 프로젝트를 생성합니다.
2. **SQL Editor** 를 열고 이 저장소의 [`schema.sql`](./schema.sql) 내용을 붙여넣어 **Run**.

### 2. 접속 정보 넣기
`Project Settings → API` 에서 두 값을 복사해 [`config.js`](./config.js) 에 붙여넣습니다.

```js
window.SUPABASE_CONFIG = {
  url: "https://xxxx.supabase.co",   // Project URL
  anonKey: "eyJhbGci...",            // anon public key (service_role 아님!)
};
```

> ⚠️ `anon` 키만 사용하세요. `service_role` 키는 절대 프론트엔드에 넣지 마세요.

### 3. 실행
정적 파일이라 그냥 열기만 하면 됩니다. 로컬에서 가볍게 띄우려면:

```bash
# Python 이 있으면
python3 -m http.server 5173
# 또는 Node 가 있으면
npx serve .
```

브라우저에서 `http://localhost:5173` 접속.

---

## 배포
정적 사이트라 어디든 올라갑니다.

- **Vercel**: 이 폴더를 그대로 배포 (`vercel` 또는 GitHub 연동). 프레임워크 설정 없이 Static 으로 인식됩니다.
- **Netlify / Cloudflare Pages / GitHub Pages** 도 동일하게 가능합니다.

Claude Code 안에서 바로 배포하려면 `/gh-vercel-deploy` 스킬을 쓸 수 있습니다.

---

## 회의실 추가·변경
1. [`schema.sql`](./schema.sql) 의 `check (room in ('3','4','5','7'))` 에 회의실 ID 추가
2. [`app.js`](./app.js) 상단의 `ROOMS` 배열에 항목 추가

운영 시간(09–18시)·시간 단위(30분)도 `app.js` 상단 상수에서 조정합니다.

## 데이터 구조 (`reservations`)
| 컬럼 | 설명 |
|---|---|
| `room` | 회의실 ID (`'3' \| '4' \| '5' \| '7'`) |
| `res_date` | 예약 날짜 |
| `start_time` / `end_time` | 시작/종료 시간 |
| `reserver_name` | 예약자 이름 (필수) |
| `department` | 부서 (선택) |
| `title` | 회의 제목 (선택) |
| `during` | 겹침 검사용 자동 생성 구간 |

# CHZZK Edit Marker

치지직(CHZZK) 다시보기를 보면서 **편집 포인트와 구간을 빠르게 기록**하고, 이를 **편집 지침 TXT / JSON**으로 내보낸 뒤 **Adobe Premiere Pro 시퀀스 마커로 가져오는 도구**입니다.

> CHZZK 다시보기에서 포인트 기록 → 필요한 원본 구간만 준비 → Premiere에서 기준점 하나 Sync → 모든 편집 포인트를 마커로 생성

## 구성

| 구성 | 역할 |
| --- | --- |
| **CHZZK Edit Marker** Chrome 확장 | CHZZK VOD에서 Point/Range 기록, TXT/JSON Export |
| **CHZZK Marker Import** Premiere UXP 플러그인 | JSON Load, 1-point Sync, Premiere Comment Marker 생성 |
| **shared** | 공통 타입, JSON Schema, 시간/싱크 계산 및 Export 로직 |

## 빠른 시작

배포본을 사용하는 경우 소스를 빌드하거나 UXP Developer Tool을 사용할 필요가 없습니다.

1. GitHub **Releases**에서 Chrome 확장 ZIP과 Premiere `.ccx`를 받습니다.
2. Chrome 확장은 압축을 풀고 `chrome://extensions`에서 **압축해제된 확장 프로그램 로드**로 설치합니다.
3. Premiere 플러그인은 `.ccx` 파일을 실행해 Creative Cloud를 통해 설치합니다.
4. CHZZK 다시보기에서 **F8**로 포인트를 기록합니다.
5. 작업이 끝나면 **Export JSON**을 누릅니다.
6. Premiere의 **Window → UXP Plugins → CHZZK Marker Import**에서 JSON을 불러옵니다.
7. 기준 마커 하나와 실제 원본의 같은 장면을 맞춘 뒤 **Sync Here**를 누릅니다.
8. 몇 개의 위치를 확인한 뒤 **Apply All Markers**를 실행합니다.

자세한 설명:

- [설치 방법](docs/INSTALL.md)
- [사용 방법](docs/USER_GUIDE.md)

## 요구 사항

| 항목 | 요구 사항 |
| --- | --- |
| Chrome / Chromium 계열 브라우저 | **116 이상** |
| Adobe Premiere Pro | **25.6 이상** |
| Premiere UXP Marker API | Premiere 25.6부터 지원 |

> Node.js와 UXP Developer Tool은 **개발하거나 소스에서 직접 빌드할 때만** 필요합니다.

---

## CHZZK 확장

CHZZK 다시보기 페이지에서 동작합니다.

```text
https://chzzk.naver.com/video/{video-id}
```

### 단축키

| 키 | 동작 |
| --- | --- |
| **F8** | 현재 시각에 Point 생성 → 영상 일시정지 → 코멘트 입력 |
| **Shift + F8** | Range 시작 / 종료 지정 |
| **F9** | Marker Sidebar 열기 / 닫기 |
| **Ctrl + Enter** | 저장 후 원래 재생 중이었다면 다시 재생 |
| **Ctrl + Shift + Enter** | 저장하고 일시정지 유지 |
| **Esc** | 취소 |
| **Enter** | 코멘트 줄바꿈 |

macOS에서는 저장 후 재생에 `⌘ + Enter`를 사용할 수 있습니다.

### Point Marker

예:

```text
05:18:48

Pre-roll:  10 sec
Post-roll: 20 sec

역 없으면 어떻게 이동해요?
버스 / 걸어가나 / '소 타'까지 살리기
```

Point에는 기준 시각과 함께 앞/뒤 Context가 저장됩니다. 기본값은 Pre-roll 10초, Post-roll 20초이며 직접 수정할 수 있습니다.

### Range Marker

긴 구간 전체를 편집 대상으로 표시할 때 사용합니다.

```text
05:43:00 ~ 06:43:00

로드뷰 전국 탐험
방구석 스트리머들의 전국투어
```

`Shift + F8`을 한 번 눌러 시작점을 잡고, 다시 눌러 종료점을 지정합니다.

### Sidebar / Export

F9 또는 화면의 Marker 버튼으로 Sidebar를 열 수 있습니다.

- 마커 위치로 이동
- Point의 Pre-roll 시작점으로 이동
- 시간 / Pre / Post / 코멘트 수정
- 마커 삭제
- 프로젝트 제목 수정
- **Copy TXT**
- **Download TXT**
- **Export JSON**
- **Import JSON**

마커는 VOD별로 `chrome.storage.local`에 즉시 저장됩니다. 별도 서버나 계정은 사용하지 않습니다.

### TXT 예시

```text
[방구석 스트리머들의 전국투어]

5:16:00
원주 토크 시작.
앞부분은 빠르게 넘기기.

5:18:48
역 없으면 어떻게 이동해요?
버스 / 걸어가나 / '소 타'까지 살리기.

5:43:00 ~ 6:43:00
로드뷰 전국 탐험.
방구석 스트리머들의 전국투어.
```

TXT는 편집 지침을 사람에게 전달할 때, JSON은 Premiere 연동에 사용합니다.

---

## Premiere Pro 플러그인

Premiere에서는 활성 시퀀스에 **Comment Marker**를 생성합니다.

### 1-point Sync

CHZZK 다시보기와 실제 원본의 시작점이 조금 달라도 기준 장면 하나만 맞추면 됩니다.

예:

```text
CHZZK marker     05:16:18
Premiere playhead 00:54:52

Sync Here
```

이후 다른 마커는 같은 Offset으로 자동 변환됩니다.

```text
CHZZK 05:18:48
      ↓
Premiere 00:57:22
```

사용 순서:

1. Premiere에서 편집할 원본을 시퀀스에 배치합니다.
2. **CHZZK Marker Import** 패널에서 **Load JSON**을 누릅니다.
3. 목록에서 기준 마커를 선택합니다.
4. 타임라인에서 같은 장면에 Playhead를 둡니다.
5. **Sync Here**를 누릅니다.
6. 다른 마커를 선택해 **Go to selected**로 위치를 확인합니다.
7. **Apply All Markers**를 실행합니다.

### Premiere에 생성되는 범위

| CHZZK Marker | Premiere Marker |
| --- | --- |
| POINT `T`, Pre `A`, Post `B` | 시작 `T-A`, 길이 `A+B` |
| RANGE `start ~ end` | 시작 `start`, 길이 `end-start` |

따라서 Point의 정확한 CHZZK 시각은 마커 Comment에 보존되고, Premiere 타임라인에서는 편집에 필요한 앞뒤 Context를 포함한 범위로 표시됩니다.

이미 한 번 가져온 마커는 Comment의 `CHZZK_MARKER_ID`를 이용해 감지하므로 같은 JSON을 다시 적용해도 중복 생성을 방지합니다.

---

## JSON 형식

Interchange format은 `schemaVersion: 1`입니다.

- Schema: [shared/schema/marker-file.schema.json](shared/schema/marker-file.schema.json)
- Example: [shared/fixtures/bangguseok-tour.json](shared/fixtures/bangguseok-tour.json)

시간은 CHZZK VOD 시작 기준의 **초 단위 Number**로 저장하며 밀리초 정밀도를 유지합니다.

---

## 개발

### 설치 / 빌드

```bash
npm install
npm run build
```

생성물:

```text
extension/dist/
premiere-plugin/dist/
```

### 검증

```bash
npm run typecheck
npm test
npm run test:e2e
npm run check
```

현재 테스트 구성에는 공통 시간/싱크 계산, Extension storage/UI 흐름, JSON/TXT Export, Premiere marker planning/bridge, Chromium E2E가 포함되어 있습니다.

### 개발용 Premiere 로드

배포용 `.ccx`가 아니라 소스에서 개발하는 경우에만 UXP Developer Tool을 사용합니다.

1. `npm run build`
2. Premiere에서 Developer Mode 활성화
3. UXP Developer Tool에서 `premiere-plugin/dist/manifest.json` 추가
4. **Load** 또는 **Load & Watch**
5. Premiere → **Window → UXP Plugins → CHZZK Marker Import**

---

## 구조

```text
shared/
  src/                 공통 타입, time/sync, validator, exporter
  schema/              JSON Schema
  fixtures/            테스트/예제 데이터

extension/
  src/
    chzzk/              CHZZK player adapter
    ui/                 Marker editor / sidebar
  public/               Manifest / icons

premiere-plugin/
  src/
    ppro.ts             Premiere API bridge
    plan.ts             Marker mapping / clamp / duplicate logic
    main.ts             UXP panel UI
  public/               UXP manifest / icons

e2e/                    Extension / Premiere panel E2E
```

CHZZK DOM 의존 코드는 `extension/src/chzzk/playerAdapter.ts`, Premiere API 의존 코드는 `premiere-plugin/src/ppro.ts`에 집중되어 있습니다.

---

## 알려진 제한사항

- Sync는 기본적으로 **1-point offset 방식**입니다. 기준점 이후 원본에 컷, 누락, 파일 간 Gap이 있으면 그 이후 마커가 어긋날 수 있습니다.
- Premiere 마커는 현재 **활성 시퀀스**에 생성합니다.
- 소스 클립(ProjectItem) 마커, 자동 영상 다운로드, 오디오 fingerprint 기반 자동 Sync는 V1 범위에 포함하지 않습니다.
- Chrome 확장은 Web Store 미등록 배포본의 경우 수동 설치를 위해 Chrome 개발자 모드가 필요합니다.
- F8/F9는 브라우저 탭에 포커스가 있을 때 동작합니다.

## V1 범위

V1은 **편집 포인트 기록 → TXT/JSON 전달 → Premiere 1-point Sync → Marker 생성**에 집중합니다.

영상 다운로드, 전체 원본 파일 관리, Whisper/AI 요약, 서버/계정/클라우드 동기화, Premiere 자동 컷 편집은 포함하지 않습니다.

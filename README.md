# CHZZK Edit Marker

치지직(CHZZK) 다시보기를 보면서 편집 포인트/구간을 빠르게 기록하고, 사람이 읽는 **편집 지침 TXT**와 기계가 읽는 **JSON**으로 내보낸 뒤, Premiere Pro에서 **1-point sync**로 실제 시퀀스 마커를 생성하는 도구입니다.

```
CHZZK 다시보기에서 F8로 포인트 기록 → TXT/JSON Export
→ 필요한 원본 구간만 다운로드 → Premiere에 배치
→ CHZZK 시각 1개 ↔ Premiere playhead 1개 Sync → 모든 포인트를 Premiere 마커로 생성
```

| 구성 | 위치 | 설명 |
| --- | --- | --- |
| Chrome 확장 (MV3) | `extension/` | CHZZK 페이지에서 마커 기록·목록·내보내기/가져오기 |
| Premiere UXP 플러그인 | `premiere-plugin/` | marker.json 로드, Sync, 활성 시퀀스에 마커 생성 |
| 공통 | `shared/` | 타입, JSON Schema, 시간/싱크 유틸, TXT/JSON exporter, validator, fixture |

## 요구 사항

| 항목 | 버전 |
| --- | --- |
| Chrome / Chromium 계열 브라우저 | 116 이상 |
| **Adobe Premiere Pro** | **25.6 이상** (UXP `Markers` API가 25.6부터 제공됨) |
| UXP Developer Tool (UDT) | 2.2 이상 (Creative Cloud에서 설치) |
| Node.js (빌드용) | 18 이상 (22에서 검증) |

## 빌드

```bash
npm install
npm run build          # extension/dist, premiere-plugin/dist 생성
npm run check          # typecheck + unit test + build
```

## Chrome 확장 설치 (개발자 모드)

1. `npm run build`
2. Chrome에서 `chrome://extensions` 열기 → 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → `extension/dist` 폴더 선택
4. 이미 열려 있던 치지직 탭은 새로고침

코드를 다시 빌드한 뒤에는 확장 카드의 새로고침(↻) 버튼을 누르고 치지직 탭도 새로고침하세요.

## Premiere 플러그인 설치 (개발자 모드)

1. `npm run build`
2. Premiere Pro: **Settings(설정) → Plugins → Enable developer mode** 체크 후 Premiere 재시작
3. UXP Developer Tool 실행 → Premiere Pro가 왼쪽 목록에 연결됨을 확인
4. **Add Plugin** → `premiere-plugin/dist/manifest.json` 선택 (`public/`이 아니라 **`dist/`** 의 manifest)
5. **Load** (개발 중에는 **Load & Watch**)
6. Premiere 메뉴 **Window → UXP Plugins → CHZZK Marker Import**

콘솔 로그는 UDT에서 플러그인의 **Debug** 버튼으로 볼 수 있습니다.

## 사용법 — Chrome 확장

`https://chzzk.naver.com/video/{번호}` 다시보기 페이지에서 동작합니다.

| 키 | 동작 |
| --- | --- |
| **F8** | 새 포인트: 현재 시각 저장 → 영상 일시정지 → 입력창 표시(코멘트에 자동 포커스) |
| **Shift+F8** | 구간 시작 지정 → 다시 누르면 구간 끝 지정 후 입력창 표시 |
| **F9** | 마커 사이드바 열기/닫기 (오른쪽 아래 `✎ Markers` 버튼도 가능) |
| 입력창 **Ctrl+Enter** (mac: ⌘+Enter) | Save & Resume — 저장 후, F8 전에 재생 중이었다면 다시 재생 |
| 입력창 **Ctrl+Shift+Enter** | Save — 저장하고 일시정지 유지 |
| 입력창 **Esc** | Cancel — 저장하지 않고 닫음 (이전 재생 상태로 복귀) |
| 입력창 **Enter** | 코멘트 줄바꿈 (제출하지 않음) |

- 입력창이 열려 있을 때 F8을 다시 눌러도 새 입력창이 생기지 않고 코멘트로 포커스만 이동합니다.
- 입력창의 시간(`05:18:48.420`), Pre-roll/Post-roll(기본 10/20초, 마지막으로 쓴 값 기억)은 직접 수정할 수 있습니다.
- 한국어 IME 조합 중 Ctrl+Enter를 눌러도 마지막 글자가 잘리지 않도록 조합 완료 후 저장합니다.
- 입력창·사이드바에서 타이핑하는 키(스페이스, 방향키 등)는 치지직 플레이어 단축키로 전달되지 않습니다.
- 전체화면(플레이어 컨테이너 전체화면)에서도 입력창이 표시됩니다.

**사이드바**: 마커는 항상 CHZZK 시각 오름차순으로 표시됩니다.

- `▶` 마커 시각으로 이동, `▶-10s` 포인트의 pre-roll 시작점으로 이동, `Edit` 시간/pre/post/코멘트 수정, `Delete` 확인 후 삭제
- 프로젝트 제목 입력란 (VOD 제목을 자동으로 채우며, 직접 수정 가능)
- **Copy TXT** (클립보드), **Download TXT** (UTF-8), **Export JSON**, **Import JSON** (예전에 내보낸 JSON을 다시 불러와 수정. 같은 id의 마커는 덮어쓰고 나머지는 추가. 다른 VOD의 JSON이면 확인 후 가져옴)

**저장**: 모든 추가/수정/삭제는 즉시 `chrome.storage.local`에 VOD별(`project:{videoNo}`)로 저장됩니다. 서버·계정·쿠키 수집은 없습니다.

### TXT 예시

```
[방구석 스트리머들의 전국투어]

5:16:00
원주 토크 시작.
노랑 자막으로 치킨쿤의 인생 토크 중 표시 후 빠르게 넘김.

5:43:00 ~ 6:43:00
로드뷰 전국 탐험.
방구석 스트리머들의 전국투어.
```

## 사용법 — Premiere 플러그인 & Sync 방법

1. Premiere에서 원본(다운로드한 MKV 등)을 배치한 시퀀스를 열어 **활성 시퀀스**로 만듭니다.
2. 패널에서 **Load marker.json** → 확장에서 Export한 JSON 선택.
3. 목록에서 **기준 마커**를 클릭해 선택합니다 (예: `05:16:18`). 구간 마커는 시작 시각이 기준입니다.
4. Premiere 타임라인에서 **그 마커와 같은 장면**에 playhead를 둡니다 (예: `00:54:52`). 패널의 *Premiere playhead*에 실시간으로 표시됩니다.
5. **Sync Here** → `offset = premiereSyncTime − chzzkSyncTime` 이 저장되고(예: `-04:21:26.000`), 목록에 각 마커의 Premiere 위치(`→ 00:57:22`)가 표시됩니다.
6. (선택) 다른 마커를 선택하고 **Go to selected** → playhead가 계산된 위치로 이동하므로 싱크가 맞는지 눈으로 확인할 수 있습니다.
7. **Apply All Markers** → `N markers will be added to "Sequence 01". Continue?` 확인 → **Continue**.
8. 결과: `8 markers / 8 to apply / 8 applied / verified in sequence: 8/8` 형태로 표시됩니다. 한 번의 Undo(Ctrl/Cmd+Z)로 전체를 되돌릴 수 있습니다.

로드한 파일·선택·Sync는 패널을 다시 열어도 유지됩니다(`localStorage`). **Clear**로 초기화합니다.

### 생성되는 마커

모든 마커는 활성 시퀀스의 **Comment 마커**(`Marker.MARKER_TYPE_COMMENT`)이며 duration이 있는 범위 마커로 생성됩니다.

| CHZZK | Premiere start | Premiere duration |
| --- | --- | --- |
| POINT (T, pre A, post B) | `mapped(T − A)` | `A + B` |
| RANGE (start ~ end) | `mapped(start)` | `end − start` |

`mapped(t) = premiereSyncTicks + (t − chzzkSyncTime)` — 계산은 Premiere tick(초당 254,016,000,000) 단위 **BigInt 정수**로 하므로 부동소수 누적 오차가 없습니다. 시작점과 길이는 시퀀스 프레임 경계에 맞춰 반올림됩니다.

- **Name**: 코멘트 첫 줄(최대 60자). 코멘트가 없으면 `CHZZK 05:18:48`
- **Comment**:
  ```
  CHZZK: 05:18:48.420
  Pre: 10s
  Post: 20s

  역 없으면 어떻게 이동해요?
  버스 / 걸어가나 / '소 타'까지

  CHZZK_MARKER_ID: 8ab2…
  ```

### 범위 안전 처리 & 중복 방지

| 경우 | 처리 |
| --- | --- |
| 전체가 시퀀스 시작(0) 이전 | **skip** — `1 skipped (before sequence start)` |
| 일부만 시퀀스 시작 이전 | 시작을 0으로 **clamp** (끝은 유지) |
| 시퀀스 끝 이후에 시작 | **skip** — `skipped (after sequence end)` |
| 시퀀스 끝을 넘어감 | 끝에 맞춰 duration **clamp** |
| 이미 가져온 마커 | 시퀀스 마커 comment의 `CHZZK_MARKER_ID`로 감지해 **skip** — Apply를 두 번 눌러도 중복 생성되지 않음 |

마커 하나의 생성 실패가 전체를 실패시키지 않습니다: 우선 하나의 트랜잭션으로 추가하고, 실패하면 마커별 트랜잭션으로 재시도해 실패한 항목만 보고합니다. 적용 후 시퀀스 마커를 다시 읽어 검증합니다.

## JSON 형식 (schemaVersion 1)

스키마: [`shared/schema/marker-file.schema.json`](shared/schema/marker-file.schema.json), 예시: [`shared/fixtures/bangguseok-tour.json`](shared/fixtures/bangguseok-tour.json)

```json
{
  "schemaVersion": 1,
  "projectTitle": "방구석 스트리머들의 전국투어",
  "vod": { "url": "https://chzzk.naver.com/video/1234567", "title": "…", "id": "1234567" },
  "markers": [
    { "id": "uuid", "type": "point", "time": 19128.42, "pre": 10, "post": 20, "comment": "…", "createdAt": "ISO8601" },
    { "id": "uuid", "type": "range", "start": 20580, "end": 24180, "comment": "…", "createdAt": "ISO8601" }
  ],
  "exportedAt": "ISO8601",
  "generator": "chzzk-edit-marker/0.1.0"
}
```

시간 값은 CHZZK 다시보기 타임라인 기준 **초 단위 Number**(밀리초 정밀도)이며, 표시용 문자열은 저장하지 않습니다. 잘못된 마커 1개는 경고와 함께 건너뛰고 나머지는 불러옵니다.

## 개발

```bash
npm run typecheck    # TypeScript (공식 @adobe/premierepro 타입 포함)
npm test             # unit tests (shared / extension store / premiere plan·bridge)
npm run test:e2e     # 빌드 후 Chromium E2E (확장 + Premiere 패널)
npm run build:extension | build:premiere
```

E2E는 Playwright(`playwright-core`)로 Chromium을 띄웁니다. 기본 경로는 `/opt/pw-browsers/chromium`이며 `CHROMIUM_PATH` 환경변수로 바꿀 수 있습니다.

```
shared/src/        types.ts, time.ts, sync.ts, markers.ts, exporters.ts, validate.ts
extension/src/     content.ts (entry, 키 리스너) · controller.ts · store.ts
                   chzzk/playerAdapter.ts   ← CHZZK DOM/URL 의존 코드는 전부 여기
                   ui/ editor.ts, sidebar.ts, styles.ts (Shadow DOM)
premiere-plugin/src/ main.ts (패널 UI) · session.ts · plan.ts (순수 계산) · ppro.ts (Premiere API 호출은 전부 여기)
e2e/               mockChzzk.ts, extension.e2e.test.ts, premiere-panel.e2e.test.ts
```

**치지직 DOM이 바뀌면** `extension/src/chzzk/playerAdapter.ts`의 `SELECTORS`만 수정하면 됩니다 (`getVideoElement / getCurrentTime / seek / pause / play / getVodMetadata`). 여러 `<video>`가 있으면 플레이어 클래스, 미디어 로드 여부, 재생 길이(광고보다 긴 본편 우선), 화면 크기로 점수를 매겨 고르며, MutationObserver로 재생성된 플레이어를 다시 찾습니다. 플레이어가 없으면 오류 없이 `CHZZK player not found`를 표시합니다.

## 검증 범위

- **Unit (75)**: 시간 포맷/파싱(0→00:00:00, 65→00:01:05, 3600→01:00:00, 19128→05:18:48, 19128.42→ms 보존), Sync(05:16:18↔00:54:52 ⇒ 05:18:48→00:57:22), Range 3600초, TXT/JSON fixture 일치, JSON Schema 검증, store, 마커 계획(clamp/skip/중복/프레임 정렬), fake Premiere에 대한 전체 import 흐름·fallback·중복 방지.
- **E2E – 확장 (20)**: 실제 Chromium에 unpacked 확장을 로드하고, 치지직 실제 URL(`https://chzzk.naver.com/video/…`)에 mock 페이지를 서빙해 F8→일시정지→입력→Ctrl+Enter→재생 재개, 반복, Esc, Shift+F8 구간, IME, 정렬, 편집/이동/삭제, Copy/Download TXT, Export/Import JSON, 새로고침 후 유지, SPA 이동 시 VOD 분리, 전체화면 표시, 플레이어 없음 처리를 검증.
- **E2E – Premiere 패널 (7)**: 빌드된 `premiere-plugin/dist`를 Chromium에서 fake `premierepro`/`uxp` 모듈로 실행해 Load→선택→Sync Here→Go to selected→확인→Apply→중복 차단→재로드 복원을 검증.

## 알려진 제한사항

- **실제 Premiere Pro에서는 아직 실행 검증되지 않았습니다.** API 호출은 Adobe 공식 문서(uxp-premiere-pro)·공식 샘플·`@adobe/premierepro` 26.5 타입 정의에 맞춰 작성하고 타입체크했지만, 테스트는 그 타입을 본뜬 fake 모듈로 수행했습니다. 첫 사용 시 소수의 마커로 확인해 주세요.
- **실제 chzzk.naver.com에서도 아직 실행 검증되지 않았습니다** (개발 환경에서 접근 불가). 셀렉터(`video.webplayer-internal-video`, `.pzp-pc__video video`, `[class*="video_information_title"]`)는 공개 유저스크립트들에서 확인한 구조를 사용하며, mock 페이지로 검증했습니다. 동작하지 않으면 `playerAdapter.ts`만 고치면 됩니다.
- **Sync는 1-point, 1배속 연속 재생을 가정합니다.** 싱크 지점과 다른 마커 사이에서 원본이 잘렸거나(컷/갭), 파일 사이에 빈틈이 있거나, 속도가 바뀐 경우 그 이후 마커는 어긋납니다. 원본 파일들을 끊김 없이 이어 배치하거나, 구간별로 별도 시퀀스에서 Sync 하세요.
- 패널의 Premiere 시간 표시는 **시퀀스 시작부터의 경과 시간(HH:MM:SS.mmm)** 입니다. 시퀀스 시작 타임코드(zero point)가 00:00:00:00이 아니면 타임라인 타임코드 표기와 다르게 보일 수 있습니다(마커 위치 계산은 playhead와 같은 기준이라 영향 없음).
- 마커는 **활성 시퀀스**에만 생성합니다. 소스 클립(ProjectItem) 마커와 마커 색상 지정은 V1 범위 밖입니다.
- `<video>` 요소 자체의 네이티브 전체화면에서는 확장 입력창이 보이지 않습니다 (치지직 기본 전체화면은 플레이어 컨테이너 방식이라 표시됨).
- F8/F9는 브라우저 탭 안에서만 동작합니다(`chrome.commands`는 F키를 단독으로 지원하지 않음). DevTools에 포커스가 있으면 F8은 DevTools가 가져갑니다.
- Linux에서 로케일이 UTF-8이 아니면 Chrome이 한글 다운로드 파일명을 `download`로 바꿀 수 있습니다(내용은 정상 UTF-8).

## V1에서 하지 않는 것

영상/MKV 다운로드, 원본 파일 DB·파일명 파싱·자동 탐색, ffprobe, 오디오 fingerprint/자동 싱크, Whisper, AI 요약, 서버·계정·클라우드·협업, Notion 연동, Premiere 자동 컷/리플 편집.

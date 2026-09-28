# 사용 방법

이 문서는 **CHZZK 다시보기에서 편집 포인트를 기록하고 Premiere Pro에 마커로 옮기는 전체 흐름**을 설명합니다.

## 전체 작업 흐름

```text
CHZZK 다시보기
→ F8 / Shift+F8로 편집 포인트 기록
→ TXT 또는 JSON Export
→ 필요한 원본 영상 준비
→ Premiere에서 JSON Load
→ 기준점 하나 Sync
→ 모든 마커 Apply
```

---

## 1. CHZZK에서 편집 포인트 기록하기

CHZZK 다시보기를 재생하면서 편집에 사용할 지점을 찾습니다.

### 일반 포인트 — F8

재밌는 장면이나 편집할 포인트가 나오면 `F8`을 누릅니다.

그러면:

1. 현재 재생 시간이 저장됩니다.
2. 영상이 일시정지됩니다.
3. 코멘트 입력창이 열립니다.

예:

```text
05:18:48

Pre-roll   10 sec
Post-roll  20 sec

역 없으면 어떻게 이동해요?
버스 / 걸어가나 / 소 타까지 살리기
```

- **Pre-roll**: 포인트보다 몇 초 전부터 볼지
- **Post-roll**: 포인트 이후 몇 초까지 볼지

기본값은 10초 / 20초입니다.

### 저장

- `Ctrl + Enter`: 저장 후 다시 재생
- `Ctrl + Shift + Enter`: 저장 후 일시정지 유지
- `Esc`: 취소
- `Enter`: 코멘트 줄바꿈

---

## 2. 긴 구간 기록하기 — Shift + F8

긴 대화나 한 챕터 전체를 살리고 싶으면 Range Marker를 사용합니다.

예:

```text
05:43:00 ~ 06:43:00
로드뷰 전국 탐험
```

사용법:

1. 시작 지점에서 `Shift + F8`
2. 끝 지점에서 다시 `Shift + F8`
3. 코멘트 입력
4. 저장

---

## 3. Marker Sidebar 사용하기

`F9`를 누르면 저장된 마커 목록을 볼 수 있습니다.

가능한 작업:

- 저장한 지점으로 바로 이동
- Point의 Pre-roll 시작점으로 이동
- 마커 시간 수정
- Pre / Post 수정
- 코멘트 수정
- 마커 삭제
- 프로젝트 제목 수정

마커는 자동으로 시간순 정렬됩니다.

---

## 4. TXT로 편집 지침 뽑기

다른 편집자에게 지침을 전달하거나 메신저/Notion에 붙여넣고 싶다면:

- **Copy TXT**
- 또는 **Download TXT**

를 사용합니다.

예:

```text
[방구석 스트리머들의 전국투어]

5:16:00
원주 토크 시작.
앞부분은 빠르게 넘기기.

5:18:48
역 없으면 어떻게 이동해요?
버스 / 걸어가나 / 소 타까지 살리기.

5:43:00 ~ 6:43:00
로드뷰 전국 탐험.
```

---

## 5. Premiere용 JSON 내보내기

Premiere로 마커를 옮기려면 Sidebar에서:

```text
Export JSON
```

을 누릅니다.

이 JSON에는:

- CHZZK VOD 정보
- Point 시간
- Range 시작/끝
- Pre/Post
- 코멘트

가 저장됩니다.

---

## 6. Premiere에서 원본 준비

편집에 필요한 원본 영상만 다운로드하거나 전달받아 Premiere 시퀀스에 배치합니다.

전체 방송 원본을 다 받을 필요는 없습니다.

중요한 것은 **CHZZK에서 찍은 기준 장면 하나와 Premiere 원본의 같은 장면을 찾을 수 있어야 한다는 점**입니다.

---

## 7. Premiere에서 JSON 불러오기

Premiere에서:

```text
Window
→ UXP Plugins
→ CHZZK Marker Import
```

를 엽니다.

그 다음:

1. **Load JSON**
2. CHZZK 확장에서 Export한 JSON 선택

마커 목록이 표시됩니다.

---

## 8. Sync 맞추기

CHZZK 다시보기 시간과 실제 원본 시작 시간은 조금 다를 수 있습니다.

그래서 기준점 하나를 맞춥니다.

예:

```text
CHZZK marker       05:16:18
Premiere playhead  00:54:52
```

### 방법

1. Premiere 패널에서 기준으로 사용할 마커를 클릭합니다.
2. Premiere 타임라인에서 같은 장면을 찾습니다.
3. Playhead를 정확히 그 장면에 둡니다.
4. **Sync Here**를 누릅니다.

이제 다른 마커들의 Premiere 위치가 자동 계산됩니다.

---

## 9. Sync 확인하기

바로 전체 적용하기 전에 몇 개 확인하는 것을 권장합니다.

1. 앞쪽 마커 하나 선택
2. **Go to selected**
3. 장면이 맞는지 확인
4. 중간 / 뒤쪽 마커도 1~2개 확인

몇 초 정도 차이가 있으면 기준점을 조금 더 정확히 맞춘 뒤 다시 Sync하면 됩니다.

---

## 10. 모든 마커 적용하기

위치가 맞으면:

```text
Apply All Markers
```

을 누릅니다.

Premiere 활성 시퀀스에 Comment Marker가 생성됩니다.

Point Marker는 Pre/Post를 포함한 범위로 표시됩니다.

예:

```text
CHZZK Point: 05:18:48
Pre: 10 sec
Post: 20 sec

Premiere marker range:
05:18:38 ~ 05:19:08
```

실제 Premiere 위치는 Sync Offset이 적용된 위치에 생성됩니다.

---

## 11. 중복 적용

같은 JSON을 실수로 다시 Apply해도 기존 마커의 `CHZZK_MARKER_ID`를 확인해 중복 생성을 방지합니다.

---

## 자주 쓰는 단축키 요약

| 키 | 기능 |
| --- | --- |
| **F8** | Point Marker |
| **Shift + F8** | Range 시작 / 종료 |
| **F9** | Sidebar |
| **Ctrl + Enter** | 저장 + 재생 |
| **Ctrl + Shift + Enter** | 저장 + 정지 유지 |
| **Esc** | 취소 |

---

## 추천 작업 방식

편집 소스를 훑을 때는 아래처럼 사용하면 빠릅니다.

```text
다시보기 재생
→ 재밌는 포인트 발견
→ F8
→ 짧게 코멘트
→ Ctrl+Enter
→ 계속 시청
```

긴 구간이면 `Shift + F8`로 시작/끝만 잡아두면 됩니다.

시청이 끝난 뒤에는:

```text
TXT → 사람이 읽는 편집 지침
JSON → Premiere Marker Import
```

로 나눠 사용하면 됩니다.

---

## 주의사항

- Sync 이후 원본 중간에 컷이나 누락 구간이 있으면 그 이후 마커가 밀릴 수 있습니다.
- 그런 경우 해당 원본 구간마다 따로 Sync해서 사용하는 것이 좋습니다.
- Premiere에서는 현재 활성 시퀀스에 마커가 생성됩니다.
- CHZZK 페이지가 크게 개편되면 확장 업데이트가 필요할 수 있습니다.

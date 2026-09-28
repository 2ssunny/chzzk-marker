# 설치 방법

이 문서는 **CHZZK Edit Marker**를 처음 사용하는 사람을 위한 설치 안내입니다.

## 준비물

- Chrome 또는 Chromium 계열 브라우저
- Adobe Premiere Pro 25.6 이상
- GitHub Releases에서 받은 배포 파일 2개
  - Chrome 확장 ZIP
  - Premiere 플러그인 `.ccx`

소스 코드를 직접 수정하거나 개발할 목적이 아니라면 Node.js, UXP Developer Tool, Premiere Developer Mode는 필요하지 않습니다.

---

## 1. Chrome 확장 설치

GitHub Releases에서 Chrome 확장 ZIP 파일을 받습니다.

예:

```text
CHZZK-Edit-Marker-v0.1.0-Chrome.zip
```

### 설치 순서

1. ZIP 파일을 원하는 폴더에 압축 해제합니다.
2. Chrome 주소창에 아래 주소를 입력합니다.

```text
chrome://extensions
```

3. 오른쪽 위 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
5. 방금 압축을 푼 폴더를 선택합니다.
6. `CHZZK Edit Marker`가 목록에 나타나면 설치 완료입니다.
7. 이미 열어둔 CHZZK 다시보기 탭이 있다면 한 번 새로고침합니다.

### 정상 설치 확인

CHZZK 다시보기 페이지에서:

- `F8`을 눌렀을 때 영상이 일시정지되고 Marker 입력창이 뜨면 정상입니다.
- `F9`를 눌렀을 때 오른쪽 Marker Sidebar가 열리면 정상입니다.

---

## 2. Premiere Pro 플러그인 설치

GitHub Releases에서 Premiere 플러그인 `.ccx` 파일을 받습니다.

예:

```text
CHZZK-Marker-Import-v0.1.0.ccx
```

### 설치 순서

1. Premiere Pro를 종료해 둡니다.
2. `.ccx` 파일을 더블클릭합니다.
3. Adobe Creative Cloud가 열리면 설치를 승인합니다.
4. 설치 완료 후 Premiere Pro를 실행합니다.
5. 메뉴에서 아래 경로를 엽니다.

```text
Window
→ UXP Plugins
→ CHZZK Marker Import
```

6. 패널이 열리면 설치 완료입니다.

### 플러그인이 안 보일 때

- Premiere Pro가 25.6 이상인지 확인합니다.
- Premiere를 완전히 종료한 뒤 다시 실행합니다.
- Creative Cloud에서 플러그인 설치가 정상 완료되었는지 확인합니다.

---

## 3. 업데이트

### Chrome 확장

새 버전을 받았다면:

1. 새 ZIP을 압축 해제합니다.
2. 기존 설치 폴더를 새 파일로 교체합니다.
3. `chrome://extensions`에서 CHZZK Edit Marker 카드의 새로고침 버튼을 누릅니다.
4. CHZZK 탭도 새로고침합니다.

### Premiere 플러그인

새 `.ccx` 파일을 실행해 새 버전을 설치합니다.

---

## 4. 삭제

### Chrome 확장

`chrome://extensions` → CHZZK Edit Marker → **삭제**

### Premiere 플러그인

Creative Cloud의 플러그인 관리 화면에서 제거합니다.

---

설치 후 실제 사용 순서는 [사용 방법](USER_GUIDE.md)을 참고하세요.

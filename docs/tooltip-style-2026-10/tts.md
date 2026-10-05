# tts 레인 정본 메모 (tooltip-style, 2026-10-05)

- 조정 세션: dmes-standard-d2 · 브랜치 feat/tooltip-style · 기준 dev a4848de8
- 지시 원문: /Users/jji/.coord/tooltip-style-2026-10-05/lanes/tts/brief.md

## 지금 상태
- 항목 1(그리드 툴팁 어두운 바탕), 2(사전에 없는 폼 라벨 글자 툴팁), 3(시험·문서) 구현 끝.
- 커밋: 11ac9257(코드·시험), e6ad1fbc(스킬 문서).
- shared 전체 단위 시험: 1546 통과 / 1 실패(http-oasis-call-bundle: dist 미빌드 환경 문제, 이 변경과 무관). tsc 통과.

## 결정
- 툴팁 내용: 첫 줄 라벨 글자, 둘째 줄 흐린 글자 화면 키(name). name 이 없거나 라벨과 같으면 라벨만.
- 공급자(포털 탭) 안에서만 띄운다. 받는 중(loading)에는 띄우지 않는다(카드로 바뀔 때 깜박임 방지).
- 글자 툴팁은 hover 만(필드 focus 로 열지 않음), 스크린리더 사본 없음.
- SearchField 는 name 이 없으면 MdmFieldLabel(name=label, meta=false)로 공용 경로를 쓴다.

## 남은 순서
- 조정 세션 확인: m-mls/tests/lsh/noticeMgmt/notice-mdm-render.test.ts:195 (사전에 없는 TITLE 에서 툴팁 트리거 없음을 단언 → 이제 글자 툴팁 트리거가 있다) 수정 허가 대기.
- 머지 요청 → 허가 → 머지 → 머지 완료 → 워크트리 정리(-d) → 정리 완료.

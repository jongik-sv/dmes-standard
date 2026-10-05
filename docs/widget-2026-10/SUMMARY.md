# 위젯 개선 회차 요약 (widget-2026-10-05)

조정 세션 dmes-standard-90, 2026-10-05~06. 레인 공통 규칙은 [README.md](README.md), 레인별 정본 메모는 `state-<레인>.md` 이다.

## 1. 위젯 개선 10건

| # | 항목 | 레인 | dev 머지 |
|---|---|---|---|
| 1 | 회사·부서 기본 탭, 삭제 불가 | widget-tabs | 5f57d51f |
| 2 | 위젯 화면 공유(사본 전달)·내보내기·가져오기 | widget-tabs | 5f57d51f |
| 3 | 업무 화면 도구 창(떠 있는 창, 접으면 아이콘) | widget-dock | 20d88f29 · e3832abb |
| 4 | 정시 수집 유형(SQL·HTTP·환율) | widget-data | a7d646b5 · f216c3b9 |
| 5 | 입력 조건 위젯(쿼리 `:이름` 파싱) | widget-data | a7d646b5 |
| 6 | 위젯 분류(WIDGET_CTG) | widget-meta | aad6161f |
| 7 | 설명 여러 줄 표시 | widget-meta | aad6161f |
| 8 | 추가 서랍 마우스 오버 미리 배치 | widget-tabs | 6c617c02 |
| 9 | 메모장 이름 바꾸기 | widget-tabs | 5f57d51f |
| 10 | 비공개 위젯(ID 전체 일치 검색) | widget-meta | db556b7a |

## 2. 후속 요청

| 항목 | 레인 | dev 머지 |
|---|---|---|
| 위젯 관리 「도움말」·작성 가이드 | widget-help | cdf677fa |
| 도움말 가독성·mermaid 공통(MarkdownView 기본) | widget-help-read | (트리 7abca133) · 49b9d3c4 |
| mermaid 도식 크기·[−][+][맞춤] | mermaid-size | 363e5462 · 9cd34e76 |
| 새로 고침 안내 문구 | mermaid-size | 2e12b397 |
| 위젯 복사·새로 고침 최소 600초 | widget-copy | f0295be0 · c6183e0d |
| 가이드 간결화(−28%)·도움말 모달 확대·공통 Markdown 표 렌더 | widget-guide-tidy | 713fadc8 |
| mermaid 「크게 보기」 | mermaid-view | abe45e80 |
| 위젯 관리 칸 설명 툴팁(MDM 컬럼 15·용어 1·설명 4, 로컬 등록) | widget-coldesc | 7fc7084b |
| 조정자 레인을 에이전트 오피스에 표시(킷) | coord-office | 16e62873 |
| 오피스 「임시 팀원」·「팀장(조정)」 표시(wbs-web) | coord-office | wbs-web staging bef36c55(로컬, 미푸시) |

입력 조건 샘플 위젯 def.qcondsmp 는 로컬 mcm.db 에 직접 넣었다(새로 고침 120 은 저장 시 600 이상 필요).

## 3. 남은 일·사용자 결정

- wbs-web staging push·Vercel 배포(오피스 2단계 표시).
- 위젯 칸 설명 묶음을 개발·운영 MDM 에 등록(`scripts/mdm-meta/README.md` §5, 용어→컬럼→설명 순).
- 가이드 2차 축소(예시·서버 전용 메시지 빼기) 여부.
- 위젯 탭 공유 남용 상한, 도구 창 서버 저장.
- widget-data 후속: 환율 제공자 큰 지수 숫자 자원 고갈, 스케줄러 풀 1스레드, 조건 줄 shared 부품화, KpiTile shared.
- widget-tabs 후속: 운영 역할 action 4개, searchUsers 빈도 제한, 메모 제목 서버 경로, firstFreeSpot 개선.
- 브랜치 fix/widget-memo-rename(775263cf) `-D` 여부, MDM 7734 CATE_ID HTML 시험값 원복 여부.
- 브라우저 툴팁 캐시(5분)를 변경 기록으로 무효화할지.
- mls `/api/mls/mdmMeta/status` 500 원인 조사.
- 시퀀스 도식 「크게 보기」 marker id 중복 가능성.
- 조정자 킷: 조정자가 여럿일 때 COORD_RUN 없으면 거절.

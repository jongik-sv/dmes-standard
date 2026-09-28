/**
 * DRAFT 넘기기 사용 가능 여부(D2, 2026-09-28 사용자 결정: 버튼 끄기).
 *
 * 서버는 넘겨받는 사람이 담당자인지 `MdmStewardDirectory` 로 검사하는데, 지금 구현(`UnresolvedStewardDirectory`)은
 * 늘 false 라 넘기기는 언제나 MDM005 로 거부된다(TSK-01-03 D7·F40, decisions D-094 — mdm 은 다른 사용자의 역할을
 * 볼 수단이 없다). 켜 둔 버튼이 늘 실패하면 고장으로 보이므로, 조회 수단(mcm 내부 역할 조회 API + mdm 어댑터)이
 * 생길 때까지 두 화면(codeEdit·ruleEdit)의 [넘기기]를 끄고 이 문구로 이유를 알린다. 어댑터가 생기면 true 로 바꾼다.
 */
export const HANDOVER_AVAILABLE = false;

export const HANDOVER_PENDING_TEXT = "넘기기는 준비 중입니다. 넘겨받는 사람의 담당자 여부를 확인할 수단이 아직 없습니다.";

package com.dongkuk.dmes.mdm.contract.version;

/**
 * DRAFT 공동 편집자 판정(선택 SPI, ERD 설계 스펙 D15). 등록한 대상만 소유자 아닌 사용자의 DRAFT 쓰기를 허용한다.
 * 확정·삭제·선점·해제·넘기기는 여전히 소유자만 한다 — 이 SPI 는 {@link VersionWriteGuard#beginDraftWrite} 에만 쓴다.
 *
 * <p>규칙(Task 7 판정 R7-1·R7-2):
 * <ul>
 *   <li>DRAFT 에 소유자가 있을 때만 이 SPI 를 묻는다. 주인 없는 DRAFT(소유자 해제 뒤)는 공동 편집자 행이 있어도 모두에게
 *       MDM003 이다 — 담당자 역할을 요구하는 선점({@code acquire})을 먼저 거쳐야 쓸 수 있다.</li>
 *   <li>공동 편집자 행은 DRAFT 버전에 속한다. 소유자를 넘기거나 해제 뒤 다시 선점해도 행은 그대로 이어지고, 새 소유자가 지울 수 있다.
 *       구현은 {@code draft} 의 버전으로만 판정해야 한다(다른 버전의 행은 권한이 아니다).</li>
 * </ul>
 */
public interface VersionCoEditorSpi {

    VersionTarget target();

    boolean isCoEditor(VersionRef draft, String userId);
}

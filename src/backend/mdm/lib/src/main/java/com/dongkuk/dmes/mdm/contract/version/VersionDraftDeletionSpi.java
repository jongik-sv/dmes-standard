package com.dongkuk.dmes.mdm.contract.version;

/**
 * 대상별 DRAFT 삭제 정리 훅 — DRAFT 삭제 트랜잭션 안에서 VER 행을 지우기 <b>직전</b>에
 * {@link VersionStateService} 구현이 부른다(TSK-01-03 D3).
 *
 * <p>04 는 DRAFT 가 {@code to_ver = V} 로 닫은 코드·카테고리 행을 9999 로 되돌리고 {@code from_ver = V} 행을 지운다
 * (원천 04:280·1064-1071, 구현 TSK-06-02). 06 은 VAR·ROW 가 CASCADE 로 지워지므로 빈 구현이다(구현 TSK-08-02).
 * target 마다 정확히 하나를 등록해야 한다 — 없으면 그 target 의 DRAFT 삭제는 실패한다.
 */
public interface VersionDraftDeletionSpi {

    VersionTarget target();

    void beforeDraftDelete(VersionRef draft);
}

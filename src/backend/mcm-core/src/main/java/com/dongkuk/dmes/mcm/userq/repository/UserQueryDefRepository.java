package com.dongkuk.dmes.mcm.userq.repository;

import com.dongkuk.dmes.mcm.userq.entity.UserQueryDef;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

/** {@code MCMAPUSER.TB_MCM_USRQ_DEF} — 스펙 2026-10-10-user-query-program-design §2. */
public interface UserQueryDefRepository extends JpaRepository<UserQueryDef, String> {

    /**
     * 관리 목록용 요약 — SQL_TEXT·PARAMS_JSON·COLUMNS_JSON(clob)을 읽지 않는다(화면 성능 가이드 R1).
     * 조회조건은 서비스가 정적 SQL(search)로 직접 다루므로 여기선 전체 요약만 둔다.
     */
    @Query("""
            SELECT d.queryId, d.queryNm, d.categoryCd, d.ownerDeptCd, d.useYn, d.maxRowCnt, d.updatedAt, d.updatedBy
            FROM UserQueryDef d
            ORDER BY d.categoryCd ASC NULLS FIRST, d.queryNm ASC, d.queryId ASC
            """)
    List<Object[]> findAllSummary();

    /** getDef·run 용 — 본체 전체. */
    Optional<UserQueryDef> findByQueryId(String queryId);
}

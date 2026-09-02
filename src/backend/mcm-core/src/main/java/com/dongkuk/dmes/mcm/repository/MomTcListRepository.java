package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomTcList;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * TB_MCM_MOM_TC_LIST JPA Repository.
 *
 * <p>설계: `docs/mcm/design/interfaceList/interfaceList_분석리포트.md` §7 TC_LIST 7 컬럼 + AUDIT.
 *
 * <p>cia/InterfaceList 화면 활용:
 * <ul>
 *   <li>{@link #findAllById(Iterable)} (JpaRepository 기본) — 검색 결과 INTERFACES 의
 *       TRANSACTION_CODE 집합에 대한 TRANSACTION_NM 일괄 조회 (Service 단에서 Map 조립)</li>
 *   <li>{@link #findAllByIds(List)} — IN 절 ANSI JPQL 명시 alias (가독성)</li>
 * </ul>
 *
 * <p>Q-005 결정: TC 명 / FORMAT 명 editable 유지 → InterfaceList save 시 본 Repository {@code save()}
 * 호출 (3 테이블 동시 UPSERT, mui 1:1).
 */
public interface MomTcListRepository extends JpaRepository<MomTcList, String> {

    /**
     * IN 절로 N건 일괄 조회 — Service 단 enrichment 용.
     * JpaRepository 의 {@code findAllById(Iterable)} 와 동일 동작이나 alias 명시.
     */
    default List<MomTcList> findAllByIds(List<String> transactionCodes) {
        return findAllById(transactionCodes);
    }
}

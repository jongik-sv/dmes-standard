package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmColumnSystem;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystemId;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@code TB_MDM_COLUMN_SYSTEM} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만).
 *
 * <p>{@link JpaSpecificationExecutor} 는 컬럼 검색이 후보 컬럼의 매핑만 읽을 때(ColumnSearchPrefilter) 쓴다.
 */
public interface MdmColumnSystemRepository extends JpaRepository<MdmColumnSystem, MdmColumnSystemId>,
        JpaSpecificationExecutor<MdmColumnSystem> {

    /** TSK-04-04 — 컬럼 한 건의 시스템 매핑(상세·차분 저장). */
    List<MdmColumnSystem> findByColumnId(Long columnId);

    /** TSK-04-04 — 역분해 폴백(시스템별 실제 필드명으로 찾기). */
    List<MdmColumnSystem> findByPhysNameIn(Collection<String> physNames);

    /**
     * metaFeed 별칭 매칭(spec 2026-10-03-mdm-column-system-alias-design L3) — 한 시스템 안에서 대문자 이름 묶음과 대소문자 무시로 맞는 행을
     * 한 번에 읽는다. {@code upperNames} 는 이미 대문자다. 컬럼 저장의 필드명 중복 검사(MDM018)도 같은 대소문자 무시 비교로 이 조회를 쓴다.
     */
    @Query("select s from MdmColumnSystem s where s.systemCode = :systemCode and upper(s.physName) in :upperNames")
    List<MdmColumnSystem> findBySystemCodeAndUpperPhysNameIn(@Param("systemCode") String systemCode,
                                                            @Param("upperNames") Collection<String> upperNames);
}

package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_COLUMN} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만). */
public interface MdmColumnRepository extends JpaRepository<MdmColumn, Long> {

    /** TSK-04-04 — 논리명 유일성 검사(MDM018). */
    Optional<MdmColumn> findByColumnName(String columnName);

    /** TSK-04-04 — 표준 물리명 유일성 검사(MDM018)·역분해 중복 목록. */
    Optional<MdmColumn> findByPhysName(String physName);
}

package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_COLUMN} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만). */
public interface MdmColumnRepository extends JpaRepository<MdmColumn, Long> {
}

package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmLayout;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_LAYOUT} JPA Repository(TSK-05-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmLayoutRepository extends JpaRepository<MdmLayout, Long> {
}

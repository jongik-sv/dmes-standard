package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.entity.MdmCodeVerId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_CODE_VER} JPA Repository(TSK-06-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmCodeVerRepository extends JpaRepository<MdmCodeVer, MdmCodeVerId> {
}

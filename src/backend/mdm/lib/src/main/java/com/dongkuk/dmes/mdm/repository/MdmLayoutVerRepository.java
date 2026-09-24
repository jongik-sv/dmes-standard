package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVerId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_LAYOUT_VER} JPA Repository(TSK-05-03 design.md §2 — finder 없음, 조회는 {@code LayoutVersionStore} 의 JPQL). */
public interface MdmLayoutVerRepository extends JpaRepository<MdmLayoutVer, MdmLayoutVerId> {
}

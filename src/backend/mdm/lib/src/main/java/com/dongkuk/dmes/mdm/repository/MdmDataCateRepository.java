package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmDataCate;
import com.dongkuk.dmes.mdm.entity.MdmDataCateId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_DATA_CATE} JPA Repository(TSK-07-01 design.md §2 — 조립·분기 로직 없음, 선언만). */
public interface MdmDataCateRepository extends JpaRepository<MdmDataCate, MdmDataCateId> {
}

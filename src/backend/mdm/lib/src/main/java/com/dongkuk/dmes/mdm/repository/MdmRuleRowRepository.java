package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleRowId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_RULE_ROW} JPA Repository(TSK-08-01 design.md §2 — 메서드를 선언하지 않는다, 불변 규칙 21). */
public interface MdmRuleRowRepository extends JpaRepository<MdmRuleRow, MdmRuleRowId> {
}

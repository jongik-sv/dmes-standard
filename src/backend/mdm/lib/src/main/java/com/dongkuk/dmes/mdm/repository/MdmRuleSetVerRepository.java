package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVerId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code TB_MDM_RULE_SET_VER} JPA Repository — 메서드를 선언하지 않는다(불변 규칙 21). 읽기는 RuleSetVersionQueries. */
public interface MdmRuleSetVerRepository extends JpaRepository<MdmRuleSetVer, MdmRuleSetVerId> {
}

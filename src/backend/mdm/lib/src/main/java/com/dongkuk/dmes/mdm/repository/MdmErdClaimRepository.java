package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmErdClaim;
import com.dongkuk.dmes.mdm.entity.MdmErdClaimId;
import org.springframework.data.jpa.repository.JpaRepository;

/** {@code MdmErdClaim} JPA Repository — 메서드를 선언하지 않는다(불변 규칙 21). 상태·JSON 쓰기는 EntityManager 네이티브 SQL 로 한다. */
public interface MdmErdClaimRepository extends JpaRepository<MdmErdClaim, MdmErdClaimId> {
}

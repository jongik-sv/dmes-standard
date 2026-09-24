package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmDomain;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code TB_MDM_DOMAIN} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만).
 *
 * <p>{@code existsByUnitCode} 는 TSK-04-02 가 추가한 파생 쿼리다(I5(a) — 단위 삭제 전 FK 참조 사전 확인,
 * 실제 DB FK 위반 SQLException 대신 명확한 비즈니스 오류 메시지를 낸다).
 */
public interface MdmDomainRepository extends JpaRepository<MdmDomain, Long> {

    boolean existsByUnitCode(String unitCode);
}

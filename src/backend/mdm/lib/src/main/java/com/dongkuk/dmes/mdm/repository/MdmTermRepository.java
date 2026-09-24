package com.dongkuk.dmes.mdm.repository;

import com.dongkuk.dmes.mdm.entity.MdmTerm;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@code TB_MDM_TERM} JPA Repository(TSK-04-01 design.md §2, D3 — 조립·분기 로직 없음, 선언만).
 *
 * <p>{@code findByTermNameAndSenseNo}(I6 중복 판정)·{@code findByEngAbbr}(I8 경고 판정)는 TSK-04-02 가
 * 추가한 파생 쿼리다.
 */
public interface MdmTermRepository extends JpaRepository<MdmTerm, Long> {

    Optional<MdmTerm> findByTermNameAndSenseNo(String termName, int senseNo);

    List<MdmTerm> findByEngAbbr(String engAbbr);

    /** TSK-04-04 — 용어 인라인 등록 (표기, 의미 번호) 중복 검사(MDM020). */
    boolean existsByTermNameAndSenseNo(String termName, int senseNo);

    /** TSK-04-04 — 다음 의미 번호 계산. */
    List<MdmTerm> findByTermName(String termName);
}

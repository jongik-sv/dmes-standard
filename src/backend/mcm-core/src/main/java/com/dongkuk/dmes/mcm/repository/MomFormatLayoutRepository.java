package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.MomFormatLayout;
import com.dongkuk.dmes.mcm.entity.MomFormatLayoutId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

/**
 * {@link MomFormatLayout} JPA Repository.
 *
 * <p>messageSender / TCErrorResendPop 공유 — READ-only 조회 메서드.
 *
 * <p>As-Is TCErrorReSendPopMapper.GetMessageInfo (mui Mapper.xml) 의 LO/FM/A JOIN 을
 * JPQL FORMAT_ID/FORMAT_VER 매칭으로 변환. As-Is 의 inline subquery FM (SELECT FORMAT_ID FROM TC_LIST
 * WHERE TRANSACTION_CODE = ?) 는 Service 단에서 별도 룩업 (interfaceRepository.findById) 로 분리.
 */
public interface MomFormatLayoutRepository extends JpaRepository<MomFormatLayout, MomFormatLayoutId> {

    /**
     * FORMAT_ID + FORMAT_VER 매칭 → ITEM_SEQ 오름차순 정렬 조회.
     *
     * <p>As-Is `ORDER BY LO.ITEM_SEQ` 와 1:1.
     *
     * @param formatId  포맷 ID (TB_MCM_MOM_INTERFACES.FORMAT_ID 룩업 결과)
     * @param formatVer 포맷 버전 (Q-012 결정: cia 화면들의 default = 1)
     * @return ITEM_SEQ 오름차순 정렬된 포맷 항목 목록 (헤더 7항목 + 본문 N항목)
     */
    @Query("SELECT l FROM MomFormatLayout l " +
           "WHERE l.id.formatId = :formatId AND l.id.formatVer = :formatVer " +
           "ORDER BY l.id.itemSeq ASC")
    List<MomFormatLayout> searchForResend(@Param("formatId") String formatId,
                                          @Param("formatVer") BigDecimal formatVer);
}

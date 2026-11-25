package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

/**
 * 품질사양 저장소 포트. 운영 구현은 JPA({@code JpaQualitySpecStore}), 단위 시험은 메모리 구현을 쓴다.
 * 쓰기 묶음(저장·확정·전송·삭제)은 {@link #inTx} 안에서 부른다.
 */
public interface QualitySpecStore {

    <T> T inTx(Supplier<T> work);

    List<QualitySpec> specs();
    Optional<QualitySpec> spec(String specNo);
    void saveSpec(QualitySpec spec);
    /** 사양과 그 조건·결과를 지운다. */
    void deleteSpec(String specNo);

    List<QualitySpecTerm> terms();
    List<QualitySpecTerm> terms(String specNo);
    /** 사양의 조건·결과를 통째로 바꾼다. */
    void replaceTerms(String specNo, List<QualitySpecTerm> terms);

    List<QualitySpecAttr> attrs();
    Optional<QualitySpecAttr> attr(String attrCd);
    void saveAttr(QualitySpecAttr attr);
    void deleteAttr(String attrCd);

    List<QualitySpecBase> baseDesign();
    List<QualitySpecCustomer> customers();
    List<QualitySpecOrder> orders();
    Optional<QualitySpecOrder> order(String ordNo);

    List<QualitySpecChange> changes();
    void saveChange(QualitySpecChange change);

    List<QualitySpecIfLog> ifLogs();
    void saveIfLog(QualitySpecIfLog log);
    /** I/F 번호 접두어(IF-YYYYMMDD-)로 시작하는 이력 수 — 다음 순번을 정한다. */
    int countIfLogs(String ifNoPrefix);
}

package com.dongkuk.dmes.mqc.qdm.qualitySpec.repository;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpec;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecBase;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecChange;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecCustomer;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecIfLog;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecOrder;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecStore;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecTerm;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 품질사양 저장소 JPA 구현. 연관관계 매핑 없이 표마다 Repository 하나를 쓴다(MES 모듈 규칙).
 * 진입 서비스(qualitySpec)에는 @Transactional 을 두지 않으므로 쓰기 묶음은 {@link #inTx} 의 TransactionTemplate 으로 감싼다.
 * OASIS 실행기 트랜잭션이 이미 열려 있으면 그 안에 합류한다(기본 전파 REQUIRED).
 */
@Component
public class JpaQualitySpecStore implements QualitySpecStore {

    private final QualitySpecRepository specs;
    private final QualitySpecTermRepository terms;
    private final QualitySpecAttrRepository attrs;
    private final QualitySpecBaseRepository bases;
    private final QualitySpecCustomerRepository customers;
    private final QualitySpecOrderRepository orders;
    private final QualitySpecChangeRepository changes;
    private final QualitySpecIfLogRepository ifLogs;
    private final TransactionTemplate tx;

    public JpaQualitySpecStore(QualitySpecRepository specs, QualitySpecTermRepository terms, QualitySpecAttrRepository attrs,
                               QualitySpecBaseRepository bases, QualitySpecCustomerRepository customers,
                               QualitySpecOrderRepository orders, QualitySpecChangeRepository changes,
                               QualitySpecIfLogRepository ifLogs,
                               @Qualifier("transactionManager") PlatformTransactionManager transactionManager) {
        this.specs = specs;
        this.terms = terms;
        this.attrs = attrs;
        this.bases = bases;
        this.customers = customers;
        this.orders = orders;
        this.changes = changes;
        this.ifLogs = ifLogs;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public <T> T inTx(Supplier<T> work) {
        return tx.execute(status -> work.get());
    }

    @Override public List<QualitySpec> specs() { return specs.findAll(); }
    @Override public Optional<QualitySpec> spec(String specNo) { return specs.findById(specNo); }
    @Override public void saveSpec(QualitySpec spec) { specs.save(spec); }

    @Override
    public void deleteSpec(String specNo) {
        terms.deleteAllInBatch(terms.findBySpecNoOrderBySideAscSeqAsc(specNo));
        specs.deleteById(specNo);
        specs.flush();
    }

    @Override public List<QualitySpecTerm> terms() { return terms.findAll(Sort.by("specNo", "side", "seq")); }
    @Override public List<QualitySpecTerm> terms(String specNo) { return terms.findBySpecNoOrderBySideAscSeqAsc(specNo); }

    @Override
    public void replaceTerms(String specNo, List<QualitySpecTerm> next) {
        // 같은 키(SPEC_NO, SIDE, SEQ)를 다시 쓰므로 지우기를 먼저 내보낸다(Hibernate 는 INSERT 를 DELETE 보다 먼저 보낸다).
        terms.deleteAllInBatch(terms.findBySpecNoOrderBySideAscSeqAsc(specNo));
        terms.flush();
        terms.saveAll(next);
        terms.flush();
    }

    @Override public List<QualitySpecAttr> attrs() { return attrs.findAll(Sort.by("seq", "attrCd")); }
    @Override public Optional<QualitySpecAttr> attr(String attrCd) { return attrs.findById(attrCd); }
    @Override public void saveAttr(QualitySpecAttr attr) { attrs.saveAndFlush(attr); }

    @Override
    public void deleteAttr(String attrCd) {
        attrs.deleteById(attrCd);
        attrs.flush();
    }

    @Override public List<QualitySpecBase> baseDesign() { return bases.findAll(Sort.by("seq")); }
    @Override public List<QualitySpecCustomer> customers() { return customers.findAll(Sort.by("seq")); }
    @Override public List<QualitySpecOrder> orders() { return orders.findAll(Sort.by(Sort.Direction.DESC, "recvDttm")); }
    @Override public Optional<QualitySpecOrder> order(String ordNo) { return orders.findById(ordNo); }

    @Override public List<QualitySpecChange> changes() { return changes.findAll(); }
    @Override public void saveChange(QualitySpecChange change) { changes.save(change); }

    @Override public List<QualitySpecIfLog> ifLogs() { return ifLogs.findAll(); }
    @Override public void saveIfLog(QualitySpecIfLog log) { ifLogs.saveAndFlush(log); }
    @Override public int countIfLogs(String ifNoPrefix) { return (int) ifLogs.countByIfNoStartingWith(ifNoPrefix); }
}

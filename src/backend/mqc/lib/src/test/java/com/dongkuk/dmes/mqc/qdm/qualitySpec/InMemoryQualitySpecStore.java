package com.dongkuk.dmes.mqc.qdm.qualitySpec;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpec;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecBase;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecChange;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecCustomer;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecIfLog;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecOrder;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecStore;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecTerm;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

/** 시험용 메모리 저장소 — JPA 저장소와 같은 계약(정렬 포함). 트랜잭션은 없다. */
public class InMemoryQualitySpecStore implements QualitySpecStore {

    public final Map<String, QualitySpec> specs = new LinkedHashMap<>();
    public final List<QualitySpecTerm> terms = new ArrayList<>();
    public final Map<String, QualitySpecAttr> attrs = new LinkedHashMap<>();
    public final List<QualitySpecBase> bases = new ArrayList<>();
    public final List<QualitySpecCustomer> customers = new ArrayList<>();
    public final Map<String, QualitySpecOrder> orders = new LinkedHashMap<>();
    public final List<QualitySpecChange> changes = new ArrayList<>();
    public final Map<String, QualitySpecIfLog> ifLogs = new LinkedHashMap<>();
    private long chgSeq = 1;

    @Override public <T> T inTx(Supplier<T> work) { return work.get(); }

    @Override public List<QualitySpec> specs() { return new ArrayList<>(specs.values()); }
    @Override public Optional<QualitySpec> spec(String specNo) { return Optional.ofNullable(specs.get(specNo)); }
    @Override public void saveSpec(QualitySpec spec) { specs.put(spec.getSpecNo(), spec); }

    @Override
    public void deleteSpec(String specNo) {
        specs.remove(specNo);
        terms.removeIf(t -> t.getSpecNo().equals(specNo));
    }

    @Override
    public List<QualitySpecTerm> terms() {
        return terms.stream().sorted(Comparator.comparing(QualitySpecTerm::getSpecNo).thenComparing(QualitySpecTerm::getSide)
                .thenComparingInt(QualitySpecTerm::getSeq)).toList();
    }

    @Override
    public List<QualitySpecTerm> terms(String specNo) {
        return terms().stream().filter(t -> t.getSpecNo().equals(specNo)).toList();
    }

    @Override
    public void replaceTerms(String specNo, List<QualitySpecTerm> next) {
        terms.removeIf(t -> t.getSpecNo().equals(specNo));
        terms.addAll(next);
    }

    @Override
    public List<QualitySpecAttr> attrs() {
        return attrs.values().stream().sorted(Comparator.comparingInt(QualitySpecAttr::getSeq).thenComparing(QualitySpecAttr::getAttrCd)).toList();
    }

    @Override public Optional<QualitySpecAttr> attr(String attrCd) { return Optional.ofNullable(attrs.get(attrCd)); }
    @Override public void saveAttr(QualitySpecAttr attr) { attrs.put(attr.getAttrCd(), attr); }
    @Override public void deleteAttr(String attrCd) { attrs.remove(attrCd); }

    @Override public List<QualitySpecBase> baseDesign() { return bases.stream().sorted(Comparator.comparingInt(QualitySpecBase::getSeq)).toList(); }
    @Override public List<QualitySpecCustomer> customers() { return customers.stream().sorted(Comparator.comparingInt(QualitySpecCustomer::getSeq)).toList(); }

    @Override
    public List<QualitySpecOrder> orders() {
        return orders.values().stream().sorted(Comparator.comparing(QualitySpecOrder::getRecvDttm).reversed()).toList();
    }

    @Override public Optional<QualitySpecOrder> order(String ordNo) { return Optional.ofNullable(orders.get(ordNo)); }

    @Override public List<QualitySpecChange> changes() { return new ArrayList<>(changes); }

    @Override
    public void saveChange(QualitySpecChange change) {
        change.assignId(chgSeq++);
        changes.add(change);
    }

    @Override public List<QualitySpecIfLog> ifLogs() { return new ArrayList<>(ifLogs.values()); }

    @Override
    public void saveIfLog(QualitySpecIfLog log) {
        if (ifLogs.containsKey(log.getIfNo())) throw new IllegalStateException("I/F 번호 중복: " + log.getIfNo());
        ifLogs.put(log.getIfNo(), log);
    }

    @Override
    public int countIfLogs(String ifNoPrefix) {
        return (int) ifLogs.keySet().stream().filter(k -> k.startsWith(ifNoPrefix)).count();
    }
}

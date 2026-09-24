package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.Header;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;

/**
 * 판정 엔진 {@link CodeLookup} 의 원장 구현 — 04 표 다섯 개를 해석 없이 그대로 돌려준다(TSK-06-02 design.md §6.6).
 *
 * <p><b>Spring 빈으로 등록하지 않는다(D-TSK-06-02-3, D5).</b> 운영 {@code CodeLookup} 빈이 생기면 도메인 저장의 R10 거부와
 * MASTER 판정이 자동으로 켜진다(decisions.md:449, TSK-04-03 동작 변경). 지금은 폐기 뒤 CODE_LIST·MASTER 판정을 시험이
 * {@code DefaultCodeResolver} 에 직접 붙여 확인한다. 운영 등록 판단은 06-05 이후다 — 그때 {@code @Component} 만 붙인다.
 *
 * <p>헤더 status 는 <b>저장값</b>이다(I16) — 엔진이 DEPRECATED 를 보고 CODE_LIST 를 비운다. 필터링(버전 선택·RELEASED
 * 만)은 엔진이 한다. 트랜잭션에 기대지 않는다(엔진은 가상 스레드에서 부를 수 있다).
 */
public class MdmCodeLookup implements CodeLookup {

    private final MasterCodeLedgerQueries ledger;

    public MdmCodeLookup(MasterCodeLedgerQueries ledger) {
        this.ledger = ledger;
    }

    @Override
    public Optional<CodeRows> code(String maruCodeId) {
        Optional<Header> header = ledger.header(maruCodeId);
        if (header.isEmpty()) {
            return Optional.empty();
        }
        List<CodeVersionRow> versions = ledger.versions(maruCodeId).stream()
                .map(v -> new CodeVersionRow(v.ver(), v.status(), v.applyFrom(), v.applyTo()))
                .toList();
        List<CodeItemRow> items = ledger.items(maruCodeId).stream()
                .map(i -> new CodeItemRow(i.code(), i.fromVer(), i.toVer(), i.name(), i.alterName(), i.seq(), i.lvl(),
                        i.attrs()))
                .toList();
        List<CodeCateRow> cates = ledger.cates(maruCodeId).stream()
                .map(c -> new CodeCateRow(c.cateId(), c.fromVer(), c.toVer(), c.defKind(), c.defExpr(), c.defTarget()))
                .toList();
        List<CodeCateItemRow> cateItems = ledger.cateItems(maruCodeId).stream()
                .map(ci -> new CodeCateItemRow(ci.cateId(), ci.code(), ci.fromVer(), ci.toVer()))
                .toList();
        return Optional.of(new CodeRows(new CodeHeader(header.get().maruCodeId(), header.get().status()), versions, items,
                cates, cateItems));
    }
}

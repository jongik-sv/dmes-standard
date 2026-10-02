package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * 부품 → 계약 스냅샷 조립(TSK-05-03 design.md §6.4, D-144 3단계). 무엇을 읽을지(시각 T 의 전문·헤더 버전)는 {@link LayoutComposer}
 * 가 고르고, 이 조립기는 받은 부품만 계약 모양으로 편다. 저장본({@link #assemble})과 초안({@link #fromDraft})이 같은 변환을 쓴다 —
 * 초안 스냅샷 = 저장 뒤 스냅샷(불변 I19).
 *
 * <p>오프셋: 헤더 항목은 헤더 안 상대값 그대로, 본문 항목 저장값은 본문 시작 기준 상대값이므로 헤더 길이 합을 더해 계약의 메시지
 * 절대값으로 바꾼다(F23). 총 길이 = 헤더 길이 합 + 본문 길이. 항목의 {@code dataType}·{@code unitCode}·{@code scale} 은 도메인
 * 파생값(D3), 헤더 항목의 {@code overrideValue} 는 이 전문 버전의 재정의(키 {@code 헤더ID:헤더 항목 물리명}), {@code encoding}·
 * {@code padRule} 은 전문 버전 EAI 의 값이다.
 */
@Component
public class LayoutSnapshotAssembler {

    private static final String NUMBER = "NUMBER";

    private final LayoutDictionary dictionary;
    private final MdmEaiRepository eaiRepository;

    public LayoutSnapshotAssembler(LayoutDictionary dictionary, MdmEaiRepository eaiRepository) {
        this.dictionary = dictionary;
        this.eaiRepository = eaiRepository;
    }

    /** 전문 버전 한 벌 — 본문 항목 오프셋은 본문 기준 상대(저장값), {@code ownLength} 는 본문 길이. */
    public record MessagePart(long layoutId, String layoutName, BigDecimal ver, String eaiCode, String sndSystem, String rcvSystem,
                              int ownLength, List<MdmLayoutItem> body) {
    }

    /** 시각 T 에 고른 헤더 버전 한 벌 — 항목 오프셋은 헤더 안 상대, {@code length} 는 그 버전의 헤더 길이. */
    public record HeaderPart(long headerLayoutId, String headerLayoutName, BigDecimal ver, int length, List<MdmLayoutItem> items) {
    }

    /**
     * @param overridesByHeaderPhys 상수 재정의 — 키 {@code headerLayoutId + ":" + headerColumnPhys}. 그 헤더 버전의 CONST 항목에만 붙는다
     */
    public MdmLayoutSnapshot assemble(MessagePart m, List<HeaderPart> headers, Map<String, String> overridesByHeaderPhys) {
        List<Row> body = new ArrayList<>();
        int headerTotal = headers.stream().mapToInt(HeaderPart::length).sum();
        for (MdmLayoutItem it : m.body()) {
            body.add(Row.of(it, headerTotal + it.getOffset())); // 저장값은 본문 기준 상대 → 계약은 절대(F23)
        }
        return build(m.layoutId(), m.layoutName(), m.ver(), m.eaiCode(), m.sndSystem(), m.rcvSystem(), headerTotal + m.ownLength(),
                headers, overridesByHeaderPhys, body);
    }

    /**
     * 검사를 통과한 초안. 새 전문이면 {@code layoutId} 0, {@code ver} 가 없으면 첫 버전({@link VersionNumbers#FIRST}).
     *
     * @param headers 초안을 합성할 헤더 버전 부품(보통 {@code draft.headers()} — 판정 시각 T 에 고른 버전)
     */
    public MdmLayoutSnapshot fromDraft(LayoutDraft draft, BigDecimal ver, List<HeaderPart> headers) {
        Map<String, String> overrides = new HashMap<>();
        for (LayoutDraft.ConstRow c : draft.consts()) {
            overrides.put(c.headerLayoutId() + ":" + c.headerColumnPhys(), c.value());
        }
        int headerTotal = headers.stream().mapToInt(HeaderPart::length).sum();
        List<Row> body = new ArrayList<>();
        for (int i = 0; i < draft.items().size(); i++) {
            LayoutItemDraft d = draft.items().get(i);
            body.add(new Row(d.seq(), d.fillKind(), d.columnPhys(), d.transUnit(), d.unitItem(), d.numFormat(), d.defaultValue(),
                    d.fillerLength(), headerTotal + draft.bodyOffsets().get(i), draft.itemLengths().get(i)));
        }
        return build(draft.layoutId() == null ? 0L : draft.layoutId(), draft.layoutName(), ver == null ? VersionNumbers.FIRST : ver,
                draft.eaiCode(), draft.sndSystem(), draft.rcvSystem(), headerTotal + draft.ownLength(), headers, overrides, body);
    }

    /** 항목 행 — 엔티티와 초안의 공통 모양. {@code offset} 은 계약 기준(헤더 항목은 헤더 안 상대, 본문 항목은 메시지 절대)이다. */
    private record Row(int seq, String fillKind, String columnPhys, String transUnit, String unitItem, String numFormat,
                       String defaultValue, Integer fillerLength, int offset, int length) {
        static Row of(MdmLayoutItem i, int offset) {
            return new Row(i.getSeq(), i.getFillKind(), i.getColumnPhys(), i.getTransUnit(), i.getUnitItem(), i.getNumFormat(),
                    i.getDefaultValue(), i.getFillerLength(), offset, i.getLength());
        }
    }

    private MdmLayoutSnapshot build(long layoutId, String name, BigDecimal ver, String eaiCode, String snd, String rcv, int total,
                                    List<HeaderPart> headers, Map<String, String> overrides, List<Row> body) {
        List<String> phys = new ArrayList<>();
        headers.forEach(h -> h.items().stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add));
        body.stream().map(Row::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        List<MdmLayoutHeaderRef> refs = new ArrayList<>();
        int at = 0;
        for (int i = 0; i < headers.size(); i++) {
            HeaderPart h = headers.get(i);
            List<MdmLayoutItemSnapshot> items = new ArrayList<>();
            for (MdmLayoutItem it : h.items()) {
                String override = MdmFillKind.CONST.name().equals(it.getFillKind()) && it.getColumnPhys() != null
                        ? overrides.get(h.headerLayoutId() + ":" + it.getColumnPhys()) : null;
                items.add(item(Row.of(it, it.getOffset()), override, dict));
            }
            refs.add(new MdmLayoutHeaderRef(i + 1, h.headerLayoutId(), h.headerLayoutName(), at, h.length(), List.copyOf(items), h.ver()));
            at += h.length();
        }
        List<MdmLayoutItemSnapshot> items = new ArrayList<>();
        for (Row r : body) {
            items.add(item(r, null, dict));
        }
        MdmEai eai = eaiCode == null ? null : eaiRepository.findById(eaiCode).orElse(null);
        return new MdmLayoutSnapshot(layoutId, name, eaiCode, snd, rcv, eai == null ? null : eai.getEncoding(),
                eai == null ? null : eai.getPadRule(), VersionNumbers.scaled(ver), total, List.copyOf(refs), List.copyOf(items));
    }

    private static MdmLayoutItemSnapshot item(Row r, String override, Map<String, LayoutColumnInfo> dict) {
        MdmFillKind kind = MdmFillKind.valueOf(r.fillKind());
        boolean filler = kind == MdmFillKind.FILLER;
        LayoutColumnInfo col = r.columnPhys() == null ? null : dict.get(r.columnPhys());
        MdmLayoutItemType type = filler ? null : col != null && NUMBER.equals(col.dataType()) ? MdmLayoutItemType.NUM : MdmLayoutItemType.CHAR;
        return new MdmLayoutItemSnapshot(r.seq(), kind, type, r.columnPhys(), r.transUnit(), r.unitItem(),
                r.numFormat() == null ? null : LayoutNumFormatCodec.decode(r.numFormat()).toContract(), r.defaultValue(), override,
                r.fillerLength(), r.offset(), r.length(), filler || col == null ? null : col.unitCode(),
                filler || col == null ? null : col.scale());
    }
}

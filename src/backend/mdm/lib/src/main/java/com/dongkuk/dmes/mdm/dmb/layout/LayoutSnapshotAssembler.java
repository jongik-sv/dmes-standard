package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * 전문 → 계약 스냅샷 조립(TSK-05-03 design.md §6.4). 저장본({@link #read})과 초안({@link #fromDraft})이 같은 변환을 쓴다 — 초안
 * 스냅샷 = 저장 뒤 스냅샷(불변 I19). 항목의 {@code dataType}·{@code unitCode}·{@code scale} 은 도메인 파생값(D3), 헤더 항목의
 * {@code overrideValue} 는 이 전문의 {@code TB_MDM_LAYOUT_CONST}, {@code encoding}·{@code padRule} 은 전문 EAI 의 값이다.
 */
@Component
public class LayoutSnapshotAssembler {

    private static final String NUMBER = "NUMBER";

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final MdmLayoutRepository layoutRepository;
    private final MdmEaiRepository eaiRepository;

    public LayoutSnapshotAssembler(LayoutQueries queries, LayoutDictionary dictionary, MdmLayoutRepository layoutRepository,
                                   MdmEaiRepository eaiRepository) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
    }

    /** 저장된 전문. {@code layoutVersion} 은 {@code TB_MDM_LAYOUT.VERSION}. */
    public MdmLayoutSnapshot read(Long messageId) {
        MdmLayout layout = layoutRepository.findById(messageId).orElseThrow(() -> LayoutRejections.notFound(messageId, "MESSAGE"));
        List<Long> headerIds = queries.headersOf(messageId).stream().map(MdmLayoutHeader::getHeaderLayoutId).toList();
        return stored(layout, headerIds, queries.constsOf(messageId), queries.itemsOf(messageId), direct());
    }

    /**
     * 저장된 전문 여럿 — 각각 {@link #read} 와 같은 스냅샷이다. 적층·재정의·항목·헤더·EAI 는 전문 수와 무관하게 IN 으로 한 번씩 읽고, 컬럼 사전·
     * 도메인 파생은 요청 범위 사전 {@code cache} 로 읽는다. 호출자가 이미 읽은 전문 행을 넘긴다(쓰기 뒤 다시 읽은 행).
     *
     * @return 전문 ID → 스냅샷(넘긴 순서)
     */
    public Map<Long, MdmLayoutSnapshot> readAll(List<MdmLayout> layouts, LayoutDictionary.Cache cache) {
        Map<Long, MdmLayoutSnapshot> out = new LinkedHashMap<>();
        if (layouts.isEmpty()) {
            return out;
        }
        List<Long> messageIds = layouts.stream().map(MdmLayout::getLayoutId).toList();
        Map<Long, List<MdmLayoutHeader>> stacks = queries.headersOf(messageIds);
        Map<Long, List<MdmLayoutConst>> consts = queries.constsOf(messageIds);
        Set<Long> headerIds = new LinkedHashSet<>();
        stacks.values().forEach(list -> list.forEach(h -> headerIds.add(h.getHeaderLayoutId())));
        Set<Long> itemOwners = new LinkedHashSet<>(messageIds);
        itemOwners.addAll(headerIds);
        Map<Long, List<MdmLayoutItem>> items = queries.itemsOf(itemOwners);
        Map<Long, MdmLayout> headerLayouts = new HashMap<>();
        for (List<Long> chunk : LayoutQueries.chunks(headerIds)) {
            layoutRepository.findAllById(chunk).forEach(h -> headerLayouts.put(h.getLayoutId(), h));
        }
        Map<String, MdmEai> eais = new HashMap<>();
        for (List<String> chunk : LayoutQueries.chunks(layouts.stream().map(MdmLayout::getEaiCode).toList())) {
            eaiRepository.findAllById(chunk).forEach(e -> eais.put(e.getEaiCode(), e));
        }
        Reads reads = new Reads(headerLayouts::get, hid -> items.getOrDefault(hid, List.of()), cache::byPhysNames, eais::get);
        for (MdmLayout layout : layouts) {
            Long id = layout.getLayoutId();
            List<Long> stack = stacks.getOrDefault(id, List.of()).stream().map(MdmLayoutHeader::getHeaderLayoutId).toList();
            out.put(id, stored(layout, stack, consts.getOrDefault(id, List.of()), items.getOrDefault(id, List.of()), reads));
        }
        return out;
    }

    private MdmLayoutSnapshot stored(MdmLayout layout, List<Long> headerIds, List<MdmLayoutConst> consts, List<MdmLayoutItem> items,
                                     Reads reads) {
        Map<String, String> overrides = new HashMap<>();
        for (MdmLayoutConst c : consts) {
            overrides.put(c.getHeaderLayoutId() + ":" + c.getHeaderSeq(), c.getConstValue());
        }
        List<Row> body = new ArrayList<>();
        for (MdmLayoutItem i : items) {
            body.add(Row.of(i));
        }
        return assemble(layout.getLayoutId(), layout.getLayoutName(), layout.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(),
                layout.getLayoutVersion(), layout.getTotalLength(), headerIds, overrides, body, reads);
    }

    /** 조립이 읽는 원장 값 — 헤더 행·헤더 항목·컬럼 사전·EAI. 단건 경로는 부를 때마다 읽고, {@link #readAll} 은 미리 읽은 값을 쓴다. */
    private record Reads(Function<Long, MdmLayout> headerLayout, Function<Long, List<MdmLayoutItem>> headerItems,
                         Function<List<String>, Map<String, LayoutColumnInfo>> dictionary, Function<String, MdmEai> eai) {
    }

    private Reads direct() {
        return new Reads(hid -> layoutRepository.findById(hid).orElse(null), queries::itemsOf, dictionary::byPhysNames,
                code -> eaiRepository.findById(code).orElse(null));
    }

    /** 검사를 통과한 초안. 새 전문이면 {@code layoutId} 0, {@code layoutVersion} 0. */
    public MdmLayoutSnapshot fromDraft(LayoutDraft draft) {
        Map<String, String> overrides = new HashMap<>();
        for (LayoutDraft.ConstRow c : draft.consts()) {
            overrides.put(c.headerLayoutId() + ":" + c.headerSeq(), c.value());
        }
        List<Row> body = new ArrayList<>();
        for (int i = 0; i < draft.items().size(); i++) {
            LayoutItemDraft d = draft.items().get(i);
            body.add(new Row(d.seq(), d.fillKind(), d.columnPhys(), d.transUnit(), d.unitItem(), d.numFormat(), d.defaultValue(),
                    d.fillerLength(), draft.placed().bodyOffsets().get(i), draft.itemLengths().get(i)));
        }
        return assemble(draft.layoutId() == null ? 0L : draft.layoutId(), draft.layoutName(), draft.eaiCode(), draft.sndSystem(),
                draft.rcvSystem(), 0L, draft.placed().total(), draft.headerIds(), overrides, body, direct());
    }

    /** 항목 행 — 엔티티와 초안의 공통 모양. */
    private record Row(int seq, String fillKind, String columnPhys, String transUnit, String unitItem, String numFormat,
                       String defaultValue, Integer fillerLength, int offset, int length) {
        static Row of(MdmLayoutItem i) {
            return new Row(i.getSeq(), i.getFillKind(), i.getColumnPhys(), i.getTransUnit(), i.getUnitItem(), i.getNumFormat(),
                    i.getDefaultValue(), i.getFillerLength(), i.getOffset(), i.getLength());
        }
    }

    private MdmLayoutSnapshot assemble(long layoutId, String name, String eaiCode, String snd, String rcv, long version, int total,
                                       List<Long> headerIds, Map<String, String> overrides, List<Row> body, Reads reads) {
        Map<Long, List<Row>> headerRows = new LinkedHashMap<>();
        List<MdmLayout> headerLayouts = new ArrayList<>();
        List<String> phys = new ArrayList<>();
        for (Long hid : headerIds) {
            MdmLayout h = reads.headerLayout().apply(hid);
            headerLayouts.add(h);
            List<Row> rows = reads.headerItems().apply(hid).stream().map(Row::of).toList();
            headerRows.put(hid, rows);
            rows.stream().map(Row::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        }
        body.stream().map(Row::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, LayoutColumnInfo> dict = reads.dictionary().apply(phys);
        List<MdmLayoutHeaderRef> headers = new ArrayList<>();
        int at = 0;
        for (int i = 0; i < headerIds.size(); i++) {
            Long hid = headerIds.get(i);
            MdmLayout h = headerLayouts.get(i);
            int len = h == null ? 0 : h.getTotalLength();
            List<MdmLayoutItemSnapshot> items = new ArrayList<>();
            for (Row r : headerRows.get(hid)) {
                items.add(item(r, overrides.get(hid + ":" + r.seq()), dict));
            }
            headers.add(new MdmLayoutHeaderRef(i + 1, hid, h == null ? null : h.getLayoutName(), at, len, List.copyOf(items)));
            at += len;
        }
        List<MdmLayoutItemSnapshot> items = new ArrayList<>();
        for (Row r : body) {
            items.add(item(r, null, dict));
        }
        MdmEai eai = eaiCode == null ? null : reads.eai().apply(eaiCode);
        return new MdmLayoutSnapshot(layoutId, name, eaiCode, snd, rcv, eai == null ? null : eai.getEncoding(),
                eai == null ? null : eai.getPadRule(), version, total, List.copyOf(headers), List.copyOf(items));
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

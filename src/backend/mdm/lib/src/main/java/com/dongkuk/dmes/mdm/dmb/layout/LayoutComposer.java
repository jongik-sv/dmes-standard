package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshotResolver;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 시각 T 합성(D-144 K1) — 전문 버전 하나 + 그 버전이 쌓은 헤더마다 T 에 유효한 RELEASED 버전. 상수 재정의는 헤더 항목 물리명으로
 * 짝짓는다. LEGACY 버전(이행 전 이력)은 저장된 합성 스냅샷을 그대로 돌려준다(스펙 §7 이행 한계).
 *
 * <p>합성 규칙은 한 곳({@link #composeWith})이고, 읽는 곳만 둘이다 — 단건은 부를 때마다 DB 를 읽고({@link Direct}), 묶음
 * ({@link #batch})은 여러 전문 버전을 합성할 때 전문·적층·헤더 버전·항목·재정의·컬럼 사전을 한 번씩 읽어 메모리에서 고른다.
 */
@Component
public class LayoutComposer implements MdmLayoutSnapshotResolver {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";

    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final LayoutSnapshotAssembler assembler;
    private final MdmLayoutRepository layoutRepository;

    public LayoutComposer(LayoutVersionStore store, LayoutQueries queries, LayoutSnapshotAssembler assembler,
                          MdmLayoutRepository layoutRepository) {
        this.store = store;
        this.queries = queries;
        this.assembler = assembler;
        this.layoutRepository = layoutRepository;
    }

    /** 재정의 대상이 그 시각의 헤더 버전에 CONST 항목으로 없을 때 — 직렬화는 헤더 기본값을 쓴다. 헤더 확정 화면이 경고로 보인다. */
    public record OrphanOverride(long headerLayoutId, String headerColumnPhys, String value) {
    }

    public record Composition(MdmLayoutSnapshot snapshot, List<OrphanOverride> orphans) {
    }

    @Override
    public MdmLayoutSnapshot at(long layoutId, LocalDateTime asOf) {
        MdmLayoutVer v = LayoutVersions.releasedAt(store.versions(layoutId), asOf)
                .orElseThrow(() -> LayoutRejections.noReleased(layoutId, MESSAGE, asOf));
        return compose(layoutId, v.getVer(), asOf);
    }

    public MdmLayoutSnapshot compose(long messageId, BigDecimal ver, LocalDateTime asOf) {
        return composeDetailed(messageId, ver, asOf, Map.of()).snapshot();
    }

    /** headerPins 에 있는 헤더는 시각과 무관하게 그 버전을 쓴다(헤더 확정 영향도 — 확정 전 DRAFT 로 합성). */
    public Composition composeDetailed(long messageId, BigDecimal ver, LocalDateTime asOf, Map<Long, BigDecimal> headerPins) {
        return composeWith(direct, messageId, ver, asOf, headerPins);
    }

    /**
     * 여러 전문 버전 합성 묶음 — {@code messageKeys} 의 전문·버전 행·적층·재정의, 그 적층이 쓰는 헤더의 레이아웃·버전 행·항목(모든 버전)을
     * 지금 한 번씩 읽는다(IN 은 {@value LayoutQueries#IN_CHUNK}개씩). 그 뒤 {@link Batch#composeDetailed} 는 단건과 결과·거부(예외 문구)가
     * 같고, 묶음 밖 키만 단건처럼 DB 를 읽는다. 컬럼 사전은 {@link LayoutDictionary#cache()} 로 물리명마다 한 번 읽는다.
     *
     * <p>읽은 뒤의 변경은 보이지 않는다 — 레이아웃·사전을 고치지 않는 한 요청 안에서 만들어 쓰고 버린다(필드에 두지 않는다).
     */
    public Batch batch(Collection<LayoutKey> messageKeys) {
        return new Batch(messageKeys);
    }

    /** 헤더 한 버전을 헤더 없는 전문처럼 — 헤더 확정의 변경 분류 입력(항목은 본문 자리, 헤더 안 상대 오프셋 = 절대). */
    public MdmLayoutSnapshot headerAlone(long headerId, BigDecimal ver) {
        MdmLayout hl = layoutRepository.findById(headerId).filter(l -> HEADER.equals(l.getLayoutKind()))
                .orElseThrow(() -> LayoutRejections.notFound(headerId, HEADER));
        MdmLayoutVer hv = store.find(headerId, ver).orElseThrow(() -> LayoutRejections.noVersion(headerId, ver));
        return assembler.assemble(new LayoutSnapshotAssembler.MessagePart(headerId, hl.getLayoutName(), hv.getVer(), null, null, null,
                hv.getOwnLength(), queries.itemsOf(headerId, hv.getVer())), List.of(), Map.of());
    }

    /** 시각 T 의 EAI 표준 헤더({@link LayoutVersions#eaiHeadersAt}) — 없으면 빈 값. T 는 null 불가. */
    public Optional<Long> eaiHeaderAt(String eaiCode, LocalDateTime asOf) {
        return eaiCode == null ? Optional.empty() : Optional.ofNullable(eaiHeadersAt(asOf).get(eaiCode));
    }

    /** 시각 T 의 EAI 코드 → 표준 헤더 ID(헤더 RELEASED 버전을 한 번 읽는다). T 는 null 불가. */
    public Map<String, Long> eaiHeadersAt(LocalDateTime asOf) {
        return LayoutVersions.eaiHeadersAt(store.releasedHeaderVersions(), asOf);
    }

    public Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf) {
        return LayoutVersions.releasedAt(store.versions(headerId), asOf);
    }

    // ── 합성 규칙(한 곳) — 읽기 순서·거부 순서는 단건과 묶음이 같다 ──

    private Composition composeWith(Source src, long messageId, BigDecimal ver, LocalDateTime asOf, Map<Long, BigDecimal> headerPins) {
        MdmLayout layout = src.layout(messageId).filter(l -> MESSAGE.equals(l.getLayoutKind()))
                .orElseThrow(() -> LayoutRejections.notFound(messageId, MESSAGE));
        MdmLayoutVer v = src.version(messageId, ver).orElseThrow(() -> LayoutRejections.noVersion(messageId, ver));
        if (v.isLegacySnapshot()) {
            return new Composition(LayoutSnapshotJson.read(v.getSnapshotJson()), List.of());
        }
        List<LayoutSnapshotAssembler.HeaderPart> parts = new ArrayList<>();
        Map<Long, Set<String>> constPhysByHeader = new HashMap<>();
        for (MdmLayoutHeader h : src.headers(messageId, v.getVer())) {
            long hid = h.getHeaderLayoutId();
            MdmLayoutVer hv = headerPins.containsKey(hid)
                    ? src.version(hid, headerPins.get(hid)).orElseThrow(() -> LayoutRejections.noVersion(hid, headerPins.get(hid)))
                    : src.headerAt(hid, asOf).orElseThrow(() -> LayoutRejections.noReleased(hid, HEADER, asOf));
            MdmLayout hl = src.layout(hid).orElseThrow(() -> LayoutRejections.notFound(hid, HEADER));
            List<MdmLayoutItem> items = src.items(hid, hv.getVer());
            constPhysByHeader.put(hid, items.stream().filter(i -> MdmFillKind.CONST.name().equals(i.getFillKind()))
                    .map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).collect(Collectors.toSet()));
            parts.add(new LayoutSnapshotAssembler.HeaderPart(hid, hl.getLayoutName(), hv.getVer(), hv.getOwnLength(), items));
        }
        Map<String, String> overrides = new HashMap<>();
        List<OrphanOverride> orphans = new ArrayList<>();
        for (MdmLayoutConst c : src.consts(messageId, v.getVer())) {
            if (constPhysByHeader.getOrDefault(c.getHeaderLayoutId(), Set.of()).contains(c.getHeaderColumnPhys())) {
                overrides.put(c.getHeaderLayoutId() + ":" + c.getHeaderColumnPhys(), c.getConstValue());
            } else {
                orphans.add(new OrphanOverride(c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue()));
            }
        }
        MdmLayoutSnapshot s = assembler.assemble(new LayoutSnapshotAssembler.MessagePart(messageId, layout.getLayoutName(), v.getVer(),
                v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(), src.items(messageId, v.getVer())),
                parts, overrides, src.columns());
        return new Composition(s, List.copyOf(orphans));
    }

    /** 합성이 읽는 것. */
    private interface Source {
        Optional<MdmLayout> layout(long layoutId);

        Optional<MdmLayoutVer> version(long layoutId, BigDecimal ver);

        Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf);

        List<MdmLayoutHeader> headers(long messageId, BigDecimal ver);

        List<MdmLayoutItem> items(long layoutId, BigDecimal ver);

        List<MdmLayoutConst> consts(long messageId, BigDecimal ver);

        /** 물리명 → 사전 행. null 이면 조립기가 부를 때마다 사전을 읽는다. */
        Function<Collection<String>, Map<String, LayoutColumnInfo>> columns();
    }

    /** 단건 — 부를 때마다 DB 를 읽는다(옛 순서 그대로). */
    private final Source direct = new Source() {
        @Override
        public Optional<MdmLayout> layout(long layoutId) {
            return layoutRepository.findById(layoutId);
        }

        @Override
        public Optional<MdmLayoutVer> version(long layoutId, BigDecimal ver) {
            return store.find(layoutId, ver);
        }

        @Override
        public Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf) {
            return LayoutComposer.this.headerAt(headerId, asOf);
        }

        @Override
        public List<MdmLayoutHeader> headers(long messageId, BigDecimal ver) {
            return queries.headersOf(messageId, ver);
        }

        @Override
        public List<MdmLayoutItem> items(long layoutId, BigDecimal ver) {
            return queries.itemsOf(layoutId, ver);
        }

        @Override
        public List<MdmLayoutConst> consts(long messageId, BigDecimal ver) {
            return queries.constsOf(messageId, ver);
        }

        @Override
        public Function<Collection<String>, Map<String, LayoutColumnInfo>> columns() {
            return null;
        }
    };

    /** {@link #batch} 참고. */
    public final class Batch implements Source {

        private final Set<Long> versionScope;
        private final Set<LayoutKey> messageScope;
        private final Set<LayoutKey> itemScope;
        private final Map<Long, MdmLayout> layouts = new HashMap<>();
        private final Map<Long, List<MdmLayoutVer>> versions;
        private final Map<LayoutKey, List<MdmLayoutHeader>> headers;
        private final Map<LayoutKey, List<MdmLayoutItem>> items;
        private final Map<LayoutKey, List<MdmLayoutConst>> consts;
        private final LayoutDictionary.Cache dictionary = assembler.dictionaryCache();

        private Batch(Collection<LayoutKey> messageKeys) {
            messageScope = new LinkedHashSet<>(messageKeys);
            headers = queries.headersOf(messageScope);
            Set<Long> messageIds = new LinkedHashSet<>();
            messageScope.forEach(k -> messageIds.add(k.layoutId()));
            Set<Long> headerIds = new LinkedHashSet<>();
            headers.values().forEach(list -> list.forEach(h -> headerIds.add(h.getHeaderLayoutId())));
            versionScope = new LinkedHashSet<>(messageIds);
            versionScope.addAll(headerIds);
            for (MdmLayout l : queries.layoutsByIds(versionScope)) {
                layouts.put(l.getLayoutId(), l);
            }
            versions = store.versionsOf(versionScope);
            // 헤더 항목은 그 헤더의 모든 버전(시각·고정 버전으로 무엇을 고를지 아직 모른다), 전문 항목은 요청 키만
            itemScope = new HashSet<>(messageScope);
            headerIds.forEach(hid -> versions.getOrDefault(hid, List.of()).forEach(v -> itemScope.add(LayoutKey.of(v))));
            items = queries.itemsOf(itemScope);
            consts = queries.constsOf(messageScope);
            // 읽어 둔 항목의 물리명을 사전에 미리 한 번 — 합성마다 처음 보는 물리명이 생겨 사전을 다시 읽지 않게(항목이 없으면 읽지 않는다)
            List<String> phys = new ArrayList<>();
            items.values().forEach(list -> list.forEach(i -> phys.add(i.getColumnPhys())));
            dictionary.byPhysNames(phys);
        }

        /** headerPins 에 있는 헤더는 시각과 무관하게 그 버전을 쓴다 — {@link LayoutComposer#composeDetailed} 와 같다. */
        public Composition composeDetailed(long messageId, BigDecimal ver, LocalDateTime asOf, Map<Long, BigDecimal> headerPins) {
            return composeWith(this, messageId, ver, asOf, headerPins);
        }

        public MdmLayoutSnapshot compose(long messageId, BigDecimal ver, LocalDateTime asOf) {
            return composeDetailed(messageId, ver, asOf, Map.of()).snapshot();
        }

        /** 묶음에 읽어 둔 레이아웃의 버전 행(최신부터, 없으면 빈 목록). 묶음 밖이면 DB 를 읽는다. */
        public List<MdmLayoutVer> versions(long layoutId) {
            return versionScope.contains(layoutId) ? versions.getOrDefault(layoutId, List.of()) : store.versions(layoutId);
        }

        @Override
        public Optional<MdmLayout> layout(long layoutId) {
            return versionScope.contains(layoutId) ? Optional.ofNullable(layouts.get(layoutId)) : direct.layout(layoutId);
        }

        @Override
        public Optional<MdmLayoutVer> version(long layoutId, BigDecimal ver) {
            if (!versionScope.contains(layoutId)) {
                return direct.version(layoutId, ver);
            }
            return versions(layoutId).stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst();
        }

        @Override
        public Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf) {
            return versionScope.contains(headerId) ? LayoutVersions.releasedAt(versions(headerId), asOf) : direct.headerAt(headerId, asOf);
        }

        @Override
        public List<MdmLayoutHeader> headers(long messageId, BigDecimal ver) {
            LayoutKey k = new LayoutKey(messageId, ver);
            return messageScope.contains(k) ? headers.getOrDefault(k, List.of()) : direct.headers(messageId, ver);
        }

        @Override
        public List<MdmLayoutItem> items(long layoutId, BigDecimal ver) {
            LayoutKey k = new LayoutKey(layoutId, ver);
            return itemScope.contains(k) ? items.getOrDefault(k, List.of()) : direct.items(layoutId, ver);
        }

        @Override
        public List<MdmLayoutConst> consts(long messageId, BigDecimal ver) {
            LayoutKey k = new LayoutKey(messageId, ver);
            return messageScope.contains(k) ? consts.getOrDefault(k, List.of()) : direct.consts(messageId, ver);
        }

        @Override
        public Function<Collection<String>, Map<String, LayoutColumnInfo>> columns() {
            return dictionary::byPhysNames;
        }
    }
}

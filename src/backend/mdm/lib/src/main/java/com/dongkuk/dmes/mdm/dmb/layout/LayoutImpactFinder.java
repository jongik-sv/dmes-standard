package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.HashSet;
import java.util.Set;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 컬럼·도메인 변경 영향 전문 목록(TSK-05-03 design.md §6.7 — 불변 I21, 03:48). 키워드가 컬럼 표준 물리명이면 그 컬럼, 도메인 표준명·
 * 이름이면 그 도메인 하위 트리의 모든 컬럼(둘 다 맞으면 합친다). 컬럼마다 쓰는 전문·헤더 행을 내고, 안 쓰는 컬럼은 한 줄로
 * "레이아웃에서 쓰지 않는다". 같은 조회가 {@link LayoutItemReferenceSpi} 로 domainMng 영향도의 레이아웃 행을 채운다(D12).
 * 네이티브 SQL 을 새로 쓰지 않는다 — 하위 트리는 {@link DomainImpactQueries#subtree} 를 다시 쓴다.
 */
@Component
public class LayoutImpactFinder {

    private static final String HEADER = "HEADER";

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final DomainTreeReader treeReader;
    private final DomainImpactQueries domainQueries;
    private final LayoutVersionStore versionStore;
    private final Clock clock;

    public LayoutImpactFinder(LayoutQueries queries, LayoutDictionary dictionary, DomainTreeReader treeReader,
                              DomainImpactQueries domainQueries, LayoutVersionStore versionStore, Clock clock) {
        this.versionStore = versionStore;
        this.clock = clock;
        this.queries = queries;
        this.dictionary = dictionary;
        this.treeReader = treeReader;
        this.domainQueries = domainQueries;
    }

    /** 사용 행 하나 — 항목이 든 (레이아웃, 버전)과 그 버전의 상태({@code CURRENT|FUTURE|DRAFT}, PAST 는 결과에 없다). */
    public record Usage(MdmLayoutItem item, MdmLayout layout, MdmLayoutVer version, String state, long usedByCount) {
        public boolean header() {
            return HEADER.equals(layout.getLayoutKind());
        }

        /** {@code v1.001}. */
        public String label() {
            return VersionNumbers.label(version.getVer());
        }

        /** 상태 한글 — 현재·예정·작성 중. */
        public String stateText() {
            return switch (state) {
                case "FUTURE" -> "예정";
                case "DRAFT" -> "작성 중";
                default -> "현재";
            };
        }
    }

    public List<Map<String, Object>> search(String keyword) {
        String kw = keyword == null ? "" : keyword.trim();
        if (kw.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> phys = new LinkedHashSet<>();
        String upper = kw.toUpperCase(Locale.ROOT);
        if (!dictionary.byPhysNames(List.of(upper)).isEmpty()) {
            phys.add(upper);
        }
        for (DomainNode n : treeReader.load().nodes()) {
            if (upper.equalsIgnoreCase(n.stdName()) || kw.equalsIgnoreCase(n.domainName())) {
                for (DomainImpactQueries.SubtreeRow r : domainQueries.subtree(n.domainId())) {
                    if (r.physName() != null) {
                        phys.add(r.physName());
                    }
                }
            }
        }
        if (phys.isEmpty()) {
            return List.of();
        }
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        Map<String, List<Usage>> byPhys = new HashMap<>();
        for (Usage u : itemsUsing(phys)) {
            byPhys.computeIfAbsent(u.item().getColumnPhys(), k -> new ArrayList<>()).add(u);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (String p : phys) {
            LayoutColumnInfo c = dict.get(p);
            String name = c == null ? p : c.displayName();
            List<Usage> uses = byPhys.getOrDefault(p, List.of());
            if (uses.isEmpty()) {
                Map<String, Object> row = base(p, name, c);
                row.put("LAYOUT_ID", null);
                row.put("LAYOUT_NAME", null);
                row.put("LAYOUT_KIND", null);
                row.put("VER", null);
                row.put("VER_STATE", null);
                row.put("SEQ", null);
                row.put("ITEM", null);
                row.put("SND_RCV", null);
                row.put("USED_BY_COUNT", null);
                row.put("IMPACT", "레이아웃에서 쓰지 않는다");
                out.add(row);
                continue;
            }
            for (Usage u : uses) {
                MdmLayout l = u.layout();
                MdmLayoutItem i = u.item();
                Map<String, Object> row = base(p, name, c);
                row.put("LAYOUT_ID", l.getLayoutId());
                row.put("LAYOUT_NAME", l.getLayoutName());
                row.put("LAYOUT_KIND", l.getLayoutKind());
                row.put("VER", VersionNumbers.plain(u.version().getVer()));
                row.put("VER_STATE", u.state());
                row.put("SEQ", i.getSeq());
                // 저장 오프셋은 헤더 항목이면 헤더 안, 전문 본문 항목이면 본문 시작 기준 상대값이다
                row.put("ITEM", i.getSeq() + " " + name + " (" + (u.header() ? "헤더 안 " : "본문 ") + i.getOffset() + " / "
                        + i.getLength() + ")");
                row.put("SND_RCV", u.header() ? null : l.getSndSystem() + " → " + l.getRcvSystem());
                row.put("USED_BY_COUNT", u.header() ? u.usedByCount() : null);
                row.put("IMPACT", impact(u));
                out.add(row);
            }
        }
        return out;
    }

    private static String impact(Usage u) {
        return switch (u.state()) {
            case "FUTURE" -> "적용 예정 " + u.label() + " (" + LayoutTimes.text(u.version().getApplyFrom()) + ") — 확정취소 또는 새 버전으로 반영";
            case "DRAFT" -> "작성 중 " + u.label() + " — 확정 전에 고칠 수 있다";
            default -> u.header() ? "헤더 변경 — 사용 전문 " + u.usedByCount() + "건 동시 전환" : "길이·형식 변경 시 새 버전, 양측 동시 전환";
        };
    }

    /**
     * 이 컬럼들을 쓰는 항목(레이아웃 이름·SEQ 순, 같은 SEQ 는 새 버전 먼저). 현재·적용 예정·작성 중 버전의 항목만 — 닫힌(PAST)
     * 버전은 뺀다. 헤더면 그 헤더를 쌓은 전문 수를 함께.
     */
    public List<Usage> itemsUsing(Collection<String> physNames) {
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        List<Object[]> raw = queries.itemsUsingColumns(physNames);
        List<Usage> out = new ArrayList<>();
        Map<Long, Long> counts = new HashMap<>();
        for (Object[] r : raw) {
            MdmLayoutItem i = (MdmLayoutItem) r[0];
            MdmLayout l = (MdmLayout) r[1];
            MdmLayoutVer v = (MdmLayoutVer) r[2];
            String state = LayoutVersions.state(v, now);
            if ("PAST".equals(state)) {
                continue;
            }
            long used = HEADER.equals(l.getLayoutKind()) ? counts.computeIfAbsent(l.getLayoutId(), id -> messagesStacking(id, now)) : 0L;
            out.add(new Usage(i, l, v, state, used));
        }
        out.sort(Comparator.comparing((Usage u) -> u.layout().getLayoutName()).thenComparing(u -> u.layout().getLayoutId())
                .thenComparing(u -> u.item().getSeq()).thenComparing(u -> u.version().getVer(), Comparator.reverseOrder()));
        return out;
    }

    /**
     * 이 헤더를 쌓은 현재·적용 예정·작성 중 전문 버전이 있는 서로 다른 전문 수(닫힌 버전만 쌓은 전문은 세지 않는다). 버전 상태는
     * {@link LayoutVersionStore#versionsOf} 한 번으로 읽는다.
     */
    private long messagesStacking(Long headerLayoutId, LocalDateTime now) {
        List<MdmLayoutHeader> stacks = queries.stacksUsing(headerLayoutId);
        if (stacks.isEmpty()) {
            return 0L;
        }
        Map<Long, List<MdmLayoutVer>> versions = versionStore.versionsOf(
                stacks.stream().map(MdmLayoutHeader::getLayoutId).distinct().toList());
        Set<Long> messages = new HashSet<>();
        for (MdmLayoutHeader h : stacks) {
            for (MdmLayoutVer v : versions.getOrDefault(h.getLayoutId(), List.of())) {
                if (VersionNumbers.same(v.getVer(), h.getVer()) && !"PAST".equals(LayoutVersions.state(v, now))) {
                    messages.add(h.getLayoutId());
                }
            }
        }
        return messages.size();
    }

    private static Map<String, Object> base(String phys, String name, LayoutColumnInfo c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("COLUMN_PHYS", phys);
        row.put("COLUMN_NAME", name);
        row.put("DOMAIN_NAME", c == null ? null : c.domainName());
        return row;
    }
}

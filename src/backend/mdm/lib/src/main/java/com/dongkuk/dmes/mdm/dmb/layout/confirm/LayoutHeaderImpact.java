package com.dongkuk.dmes.mdm.dmb.layout.confirm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssueCode;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutKey;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutLengthRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutTimes;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutSerializer;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Component;

/**
 * 헤더 확정 영향도(D-144 3단계, 스펙 §7) — 이 헤더를 쌓은 전문 버전(현재·미래 RELEASED, DRAFT)마다 apply_from 시점(그 버전이 더 늦게
 * 시작하면 그 시각)으로 "지금 헤더" 와 "이 헤더 DRAFT" 를 각각 합성해 총 길이 변화와 깨짐을 본다. 헤더 확정은 전문 버전을 만들지
 * 않는다(I18 폐지) — 영향은 판정 시각 해석으로 생긴다. MSG_LENGTH 용량(L16)·재정의 넘침(L12)은 새로 생긴 것만 오류이고, "지금 헤더"
 * 합성에 이미 있던 것은 {@link #ALREADY} 문구를 붙인 경고다(Ruling P3-25 — 무관한 헤더 확정이 옛 문제로 막히지 않게).
 *
 * <p>EAI 표준 헤더도 시각 T 해석이다(Ruling P3-15) — apply_from 과 그 뒤 관련 헤더 RELEASED 경계마다(Ruling P3-24) 이 DRAFT 를 RELEASED
 * 로 넣은 해석과 뺀 해석({@link LayoutComposer#eaiHeadersAt} 과 같은 식)을 비교해, 표준 헤더가 바뀌는 EAI 마다
 * {@link #EAI_STANDARD_HEADER_SWITCH} 경고를 낸다(Ruling P3-17 — 넘겨받기·되찾기·내려놓기). {@code TB_MDM_EAI.HEADER_LAYOUT_ID} 는 읽지 않는다.
 */
@Component
public class LayoutHeaderImpact {

    /** 경고 — 재정의 대상이 새 헤더 버전에 CONST 항목으로 없어 그 전문은 헤더 기본값으로 나간다. */
    public static final String ORPHAN_OVERRIDE = "ORPHAN_OVERRIDE";
    /** 경고 — 이 확정으로 apply_from 부터 어떤 EAI 의 표준 헤더가 바뀐다(넘겨받기·되찾기·내려놓기). */
    public static final String EAI_STANDARD_HEADER_SWITCH = "EAI_STANDARD_HEADER_SWITCH";
    /** 경고 — 이 헤더를 쌓은 전문 버전을 판정 시각에 합성할 수 없다(다른 쌓인 헤더에 그 시각 확정 버전이 없는 등). */
    public static final String HEADER_UNRESOLVED = "HEADER_UNRESOLVED";
    /** "전" 합성에 이미 있던 L16·L12 를 경고로 낮출 때의 문구 머리(Ruling P3-25). */
    public static final String ALREADY = "이미 있던 문제(이 헤더 확정 전에도 같음) — ";

    /**
     * @param rows     영향 행 — {@code LAYOUT_ID, LAYOUT_NAME, SND_RCV, VER, STATE, EVALUATED_AT, TOTAL_LENGTH_BEFORE, TOTAL_LENGTH_AFTER, ISSUES}
     * @param eaiCodes 이 확정 뒤 apply_from 시점에 이 헤더가 표준 헤더인 EAI(코드 순)
     */
    public record Result(List<Map<String, Object>> rows, List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings, List<String> eaiCodes) {
    }

    private final LayoutQueries queries;
    private final LayoutVersionStore store;
    private final LayoutComposer composer;
    private final MdmLayoutRepository layoutRepository;
    private final Clock clock;

    public LayoutHeaderImpact(LayoutQueries queries, LayoutVersionStore store, LayoutComposer composer,
                              MdmLayoutRepository layoutRepository, Clock clock) {
        this.queries = queries;
        this.store = store;
        this.composer = composer;
        this.layoutRepository = layoutRepository;
        this.clock = clock;
    }

    /**
     * @param headerId  확정할 헤더
     * @param draftVer  확정할 DRAFT 버전
     * @param applyFrom 판정 시각 — null 불가
     */
    public Result evaluate(long headerId, BigDecimal draftVer, LocalDateTime applyFrom) {
        Objects.requireNonNull(applyFrom, "applyFrom");
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        Set<LayoutKey> keys = new LinkedHashSet<>();
        for (MdmLayoutHeader h : queries.stacksUsing(headerId)) {
            keys.add(new LayoutKey(h.getLayoutId(), h.getVer()));
        }
        Map<Long, List<MdmLayoutVer>> versions = store.versionsOf(keys.stream().map(LayoutKey::layoutId).distinct().toList());
        List<Map<String, Object>> rows = new ArrayList<>();
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (LayoutKey k : keys) {
            MdmLayoutVer v = versions.getOrDefault(k.layoutId(), List.of()).stream()
                    .filter(x -> VersionNumbers.same(x.getVer(), k.ver())).findFirst().orElse(null);
            if (v == null || v.isLegacySnapshot() || !v.isDraft() && !v.isReleased()
                    || v.isReleased() && !v.getApplyTo().isAfter(applyFrom)) {
                continue;
            }
            LocalDateTime at = v.isReleased() && v.getApplyFrom().isAfter(applyFrom) ? v.getApplyFrom() : applyFrom;
            MdmLayout msg = layoutRepository.findById(k.layoutId()).orElseThrow(() -> LayoutRejections.notFound(k.layoutId(), "MESSAGE"));
            String itemKey = k.layoutId() + "@" + VersionNumbers.plain(k.ver());
            String label = "전문 " + msg.getLayoutName() + " " + VersionNumbers.label(k.ver());
            MdmLayoutSnapshot beforeSnapshot = null;
            try {
                beforeSnapshot = composer.compose(k.layoutId(), k.ver(), at);
            } catch (BusinessException e) {
                // 지금 헤더로는 합성할 수 없다(예: 이 헤더의 첫 확정) — 전 길이를 비우고, 뒤 문제는 모두 새로 생긴 것으로 본다
            }
            Integer before = beforeSnapshot == null ? null : beforeSnapshot.totalLength();
            // Ruling P3-25 — "전" 합성에 이미 있던 L16·L12 는 이 확정 탓이 아니다: 경고로 낮추고 새로 생긴 것만 오류로 막는다
            Set<String> knownL16 = new HashSet<>();
            Set<String> knownL12 = new HashSet<>();
            if (beforeSnapshot != null) {
                LayoutLengthRules.msgLengthIssues(beforeSnapshot).forEach(i -> knownL16.add(l16Cell(i)));
                overrides(beforeSnapshot, headerId).forEach(o -> knownL12.add(o.key()));
            }
            List<String> issues = new ArrayList<>();
            Integer after = null;
            try {
                LayoutComposer.Composition c = composer.composeDetailed(k.layoutId(), k.ver(), at, Map.of(headerId, draftVer));
                after = c.snapshot().totalLength();
                for (LayoutIssue i : LayoutLengthRules.msgLengthIssues(c.snapshot())) {
                    boolean known = knownL16.contains(l16Cell(i));
                    String text = (known ? ALREADY : "") + i.message();
                    (known ? warnings : errors).add(new MdmCheckIssue(i.code().name(), label + ": " + text, i.field(), itemKey));
                    issues.add(text);
                }
                for (Overflow o : overrides(c.snapshot(), headerId)) {
                    boolean known = knownL12.contains(o.key());
                    String text = (known ? ALREADY : "") + "재정의 " + o.key() + " 가 새 항목 길이 " + o.length() + " 를 넘습니다";
                    (known ? warnings : errors).add(new MdmCheckIssue(LayoutIssueCode.L12.name(), label + ": " + text, "CONST_VALUE", itemKey));
                    issues.add(text);
                }
                List<String> orphans = c.orphans().stream().filter(o -> o.headerLayoutId() == headerId)
                        .map(o -> o.headerColumnPhys() + "=" + o.value()).toList();
                if (!orphans.isEmpty()) {
                    // 전문 버전마다 한 줄 — 그 전문의 재정의 가운데 새 헤더 버전에 CONST 항목이 없는 것을 모은다
                    String message = label + ": 재정의 " + String.join(", ", orphans)
                            + " 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다)";
                    warnings.add(new MdmCheckIssue(ORPHAN_OVERRIDE, message, "HEADER_COLUMN_PHYS", itemKey));
                    issues.add(message);
                }
            } catch (BusinessException e) {
                // 합성 실패는 모두 경고로 보인다 — 고정한 DRAFT 는 있는 버전이므로 실패는 다른 쌓인 헤더에 그 시각 확정 버전이 없거나(noReleased)
                // 전문·헤더가 없는(notFound) 경우다. 이 헤더 DRAFT 자체의 결함은 앞의 헤더 항목 검사(L01~L08, L12~L15)가 오류로 막는다
                warnings.add(new MdmCheckIssue(HEADER_UNRESOLVED, label + ": " + e.getMessage(), "HEADER_LAYOUT_ID", itemKey));
                issues.add(e.getMessage());
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", k.layoutId());
            row.put("LAYOUT_NAME", msg.getLayoutName());
            row.put("SND_RCV", msg.getSndSystem() + " → " + msg.getRcvSystem());
            row.put("VER", VersionNumbers.plain(k.ver()));
            row.put("STATE", LayoutVersions.state(v, now));
            row.put("EVALUATED_AT", LayoutTimes.text(at));
            row.put("TOTAL_LENGTH_BEFORE", before);
            row.put("TOTAL_LENGTH_AFTER", after);
            row.put("ISSUES", String.join(" / ", issues));
            rows.add(row);
        }
        List<String> eais = eaiSwitches(headerId, draftVer, applyFrom, warnings);
        return new Result(rows, errors, warnings, eais);
    }

    /**
     * EAI 표준 헤더를 이 DRAFT 를 넣고·빼고 두 번 해석해(Ruling P3-15·P3-17) 바뀐 EAI 마다 경고를 더하고, apply_from 시점에 넣은 해석에서 이
     * 헤더가 표준 헤더인 EAI 를 돌려준다. 넣은 해석에서 이 헤더의 버전은 DRAFT 하나([apply_from, 끝))뿐이다 — 확정이 직전 열린 버전을
     * apply_from 에서 닫고 미적용 버전은 하나뿐이므로 그 뒤를 덮는 이 헤더의 다른 RELEASED 는 없다.
     *
     * <p>비교 시각은 apply_from 하나가 아니다(Ruling P3-24) — 이 DRAFT 와 이 헤더의 직전 버전이 주장하는 EAI 를 주장하는 헤더 RELEASED
     * 버전들의 적용 시작·끝 가운데 apply_from 보다 늦은 시각마다 다시 비교한다. 그래야 다른 헤더의 미래 확정과 겹쳐 나중에야 생기는 전환
     * (예: 넘겨받은 헤더가 미래에 내려놓은 뒤 "없음" 으로 바뀌는 것)도 경고로 드러난다. 같은 EAI 의 같은 전환(전후 헤더가 같음)이 여러
     * 시각에서 나오면 처음 시각 한 줄로 모은다.
     */
    private List<String> eaiSwitches(long headerId, BigDecimal draftVer, LocalDateTime applyFrom, List<MdmCheckIssue> warnings) {
        MdmLayoutVer draft = store.find(headerId, draftVer).orElseThrow(() -> LayoutRejections.noVersion(headerId, draftVer));
        Map<Long, List<MdmLayoutVer>> released = store.releasedHeaderVersions();
        Map<Long, List<MdmLayoutVer>> withDraft = new LinkedHashMap<>(released);
        withDraft.put(headerId, List.of(asReleasedFrom(draft, applyFrom)));

        List<MdmLayoutVer> own = released.getOrDefault(headerId, List.of());
        Set<String> related = new TreeSet<>();
        if (draft.getEaiCode() != null) {
            related.add(draft.getEaiCode());
        }
        LayoutVersions.releasedAt(own, applyFrom).map(MdmLayoutVer::getEaiCode).ifPresent(related::add);
        LayoutVersions.previousReleased(own, draftVer).map(MdmLayoutVer::getEaiCode).ifPresent(related::add);
        TreeSet<LocalDateTime> times = new TreeSet<>();
        times.add(applyFrom);
        for (List<MdmLayoutVer> versions : released.values()) {
            for (MdmLayoutVer v : versions) {
                if (v.getEaiCode() == null || !related.contains(v.getEaiCode())) {
                    continue;
                }
                for (LocalDateTime t : new LocalDateTime[] {v.getApplyFrom(), v.getApplyTo()}) {
                    if (t != null && t.isAfter(applyFrom) && t.isBefore(VersionConventions.OPEN_END)) {
                        times.add(t);
                    }
                }
            }
        }

        List<String> mine = new ArrayList<>();
        Set<String> reported = new HashSet<>();
        for (LocalDateTime t : times) {
            Map<String, Long> without = LayoutVersions.eaiHeadersAt(released, t);
            Map<String, Long> with = LayoutVersions.eaiHeadersAt(withDraft, t);
            Set<String> codes = new TreeSet<>(without.keySet());
            codes.addAll(with.keySet());
            for (String eai : codes) {
                Long before = without.get(eai);
                Long after = with.get(eai);
                if (t.equals(applyFrom) && Objects.equals(after, headerId)) {
                    mine.add(eai);
                }
                if (Objects.equals(before, after) || !reported.add(eai + "|" + before + "|" + after)) {
                    continue;
                }
                String verb;
                if (Objects.equals(after, headerId)) {
                    verb = claimedBefore(own, eai, applyFrom) ? "되찾습니다" : "넘겨받습니다";
                } else {
                    verb = "내려놓습니다";
                }
                // 변경 분류 요약의 "EAI 표준 헤더 주장 G1 → G2"(이 헤더 버전 행의 EAI_CODE)와 달리, 여기는 그 주장을 시각 T 로 해석한 결과(헤더)다
                warnings.add(new MdmCheckIssue(EAI_STANDARD_HEADER_SWITCH, "EAI 표준 헤더 전환 — EAI " + eai + " 의 표준 헤더가 "
                        + LayoutTimes.text(t) + " 부터 " + headerText(before) + " → " + headerText(after) + " 로 바뀝니다(이 헤더가 "
                        + verb + "). 그 뒤 저장하는 전문은 새 표준 헤더를 맨 앞에 쌓습니다(이미 저장된 전문의 적층은 그대로)", "EAI_CODE", eai));
            }
        }
        return List.copyOf(mine);
    }

    /** 이 헤더가 apply_from 전에 그 EAI 를 주장한 RELEASED 버전이 있었는가 — 있으면 "되찾기". */
    private static boolean claimedBefore(List<MdmLayoutVer> versions, String eai, LocalDateTime applyFrom) {
        return versions.stream().anyMatch(v -> eai.equals(v.getEaiCode()) && v.getApplyFrom() != null && v.getApplyFrom().isBefore(applyFrom));
    }

    /** DRAFT 를 apply_from 부터 열린 RELEASED 로 본 해석용 사본 — 영속 컨텍스트에 붙지 않은 객체라 DB 에 쓰이지 않는다. */
    private static MdmLayoutVer asReleasedFrom(MdmLayoutVer draft, LocalDateTime applyFrom) {
        MdmLayoutVer v = new MdmLayoutVer(draft.getLayoutId(), draft.getVer(), draft.getVerKind(), draft.getOwnerId());
        v.setEaiCode(draft.getEaiCode());
        v.setStatus("RELEASED");
        v.setApplyFrom(applyFrom);
        v.setApplyTo(LocalDateTime.MAX);
        return v;
    }

    private String headerText(Long headerId) {
        if (headerId == null) {
            return "없음";
        }
        return layoutRepository.findById(headerId).map(l -> l.getLayoutName() + "(" + headerId + ")").orElse(String.valueOf(headerId));
    }

    /** L16 한 칸의 정체 — 항목 순번과 총 길이 숫자만 뺀 문구(어느 헤더·본문의 어느 칸, 몇 자리). */
    private static String l16Cell(LayoutIssue i) {
        return i.seq() + "|" + i.message().replaceAll("총 길이 \\d+", "총 길이 N");
    }

    /** 재정의 넘침 한 건 — {@code key} 는 "물리명=값". */
    private record Overflow(String key, int length) {
    }

    /** 이 헤더의 재정의 값이 항목 길이(인코딩 바이트)를 넘는 것 — L12, 직렬화가 넘침으로 실패한다. */
    private static List<Overflow> overrides(MdmLayoutSnapshot s, long headerId) {
        List<Overflow> out = new ArrayList<>();
        Charset cs = LayoutSerializer.charset(s);
        for (MdmLayoutHeaderRef h : s.headers()) {
            if (h.headerLayoutId() != headerId) {
                continue;
            }
            for (MdmLayoutItemSnapshot i : h.items()) {
                if (i.overrideValue() != null && i.overrideValue().getBytes(cs).length > i.length()) {
                    out.add(new Overflow(i.columnPhys() + "=" + i.overrideValue(), i.length()));
                }
            }
        }
        return out;
    }
}

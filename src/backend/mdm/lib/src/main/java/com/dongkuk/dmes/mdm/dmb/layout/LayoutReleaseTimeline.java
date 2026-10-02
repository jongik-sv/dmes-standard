package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import org.springframework.stereotype.Component;

/**
 * 전문 하나의 RELEASED 버전 목록과 버전별 합성 구간(D-144 3단계, ADR-0007 D6 — 메타 피드 LAYOUT). 업무 모듈은 판정 시각 하나로
 * 버전과 구간을 고른다 — 헤더 버전 행·조립기가 없으므로 합성은 여기서 끝낸다.
 *
 * <p>전문 버전의 적용 구간 {@code [applyFrom, applyTo)} 를 그 버전이 쌓은 헤더들의 RELEASED 버전 경계(적용 시작·끝)로 나누고,
 * 구간마다 시작 시각으로 {@link LayoutComposer#compose} 한다. 구간 안에서는 헤더마다 고르는 버전({@link LayoutVersions#releasedAt})이
 * 바뀌지 않으므로 그 구간의 어느 시각 T 로 합성해도 {@code LayoutComposer.at(id, T)} 와 같다. 이웃 구간의 합성이 같으면 하나로 합친다.
 * LEGACY 버전(이행 전 이력)은 저장된 스냅샷 그대로라 나누지 않는다. 구간이 비는 버전({@code applyFrom >= applyTo})은 고를 수 없으므로
 * 합성하지 않고 빈 구간 목록으로 둔다. 합성이 깨지면(쌓은 헤더에 그 시각 RELEASED 가 없음 등) {@code BusinessException} 이 그대로
 * 올라간다 — 호출자가 그 키를 failed 로 돌린다(Ruling R4). 정상 운영 경로의 빈틈(쌓인 헤더의 첫 버전 확정 취소 등)은 헤더 확정 취소
 * 가드(판정 P3-22)가 원장에서 막는다.
 *
 * <p>전제 — EAI 표준 헤더: 지금 합성({@link LayoutComposer#compose})은 저장된 적층({@code TB_MDM_LAYOUT_HEADER})만 읽고 EAI 표준
 * 헤더를 시각 T 로 다시 해석하지 않는다(DRAFT 저장 시각에 적층으로 박힌다). 그래서 경계는 쌓은 헤더의 버전 경계뿐이다. 합성이 EAI 를
 * 시각 T 로 해석하게 바뀌면, 그 EAI 를 주장하는 헤더 버전({@link LayoutVersionStore#releasedHeaderVersions} 중 같은 {@code EAI_CODE})의
 * 적용 시작·끝도 구간 경계에 넣어야 한다.
 */
@Component
public class LayoutReleaseTimeline {

    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final LayoutComposer composer;

    public LayoutReleaseTimeline(LayoutVersionStore store, LayoutQueries queries, LayoutComposer composer) {
        this.store = store;
        this.queries = queries;
        this.composer = composer;
    }

    /** 합성 구간 하나 — {@code [applyFrom, applyTo)} 동안 이 스냅샷이다. */
    public record Segment(LocalDateTime applyFrom, LocalDateTime applyTo, MdmLayoutSnapshot snapshot) {
    }

    /** RELEASED 전문 버전 하나 — 버전 자체의 적용 구간과, 그 구간을 헤더 버전 경계로 나눈 합성 구간들(시각 순, 빈틈 없음). */
    public record ReleasedVersion(BigDecimal ver, LocalDateTime applyFrom, LocalDateTime applyTo, List<Segment> segments) {
    }

    /**
     * 전문의 RELEASED 버전(적용 시작·끝이 있는 것) 전부 — VER 수 비교 오름차순. 전문이 아니면 호출자가 먼저 거른다.
     *
     * @throws com.dongkuk.dmes.cactus.common.BusinessException 어느 구간이든 합성할 수 없을 때
     */
    public List<ReleasedVersion> released(long messageId) {
        List<MdmLayoutVer> released = store.versions(messageId).stream()
                .filter(v -> v.isReleased() && v.getApplyFrom() != null && v.getApplyTo() != null)
                .sorted(Comparator.comparing(MdmLayoutVer::getVer)) // BigDecimal compareTo — 문자열 정렬 아님
                .toList();
        List<ReleasedVersion> out = new ArrayList<>();
        for (MdmLayoutVer v : released) {
            out.add(new ReleasedVersion(v.getVer(), v.getApplyFrom(), v.getApplyTo(), segments(messageId, v)));
        }
        return out;
    }

    private List<Segment> segments(long messageId, MdmLayoutVer v) {
        LocalDateTime from = v.getApplyFrom();
        LocalDateTime to = v.getApplyTo();
        if (!from.isBefore(to)) {
            return List.of();
        }
        List<LocalDateTime> cuts = new ArrayList<>();
        cuts.add(from);
        if (!v.isLegacySnapshot()) {
            List<Long> headerIds = queries.headersOf(messageId, v.getVer()).stream().map(MdmLayoutHeader::getHeaderLayoutId).distinct().toList();
            cuts.addAll(boundaries(from, to, store.versionsOf(headerIds)));
        }
        cuts.add(to);
        List<Segment> out = new ArrayList<>();
        for (int i = 0; i + 1 < cuts.size(); i++) {
            LocalDateTime start = cuts.get(i);
            MdmLayoutSnapshot snapshot = composer.compose(messageId, v.getVer(), start);
            Segment last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last != null && Objects.equals(last.snapshot(), snapshot)) {
                out.set(out.size() - 1, new Segment(last.applyFrom(), cuts.get(i + 1), snapshot));
            } else {
                out.add(new Segment(start, cuts.get(i + 1), snapshot));
            }
        }
        return List.copyOf(out);
    }

    /**
     * 헤더 RELEASED 버전의 적용 시작·끝 가운데 {@code (from, to)} 안쪽에 있는 시각 — 오름차순, 중복 없음. 시각 T 의 헤더 버전은
     * {@code releasedAt}(구간이 T 를 담는 RELEASED 중 VER 최대)이므로 이 시각들 사이에서는 바뀌지 않는다.
     */
    static List<LocalDateTime> boundaries(LocalDateTime from, LocalDateTime to, Map<Long, ? extends Collection<MdmLayoutVer>> headerVersions) {
        TreeSet<LocalDateTime> out = new TreeSet<>();
        for (Collection<MdmLayoutVer> versions : headerVersions.values()) {
            for (MdmLayoutVer h : versions) {
                if (!h.isReleased() || h.getApplyFrom() == null || h.getApplyTo() == null) {
                    continue;
                }
                for (LocalDateTime t : List.of(h.getApplyFrom(), h.getApplyTo())) {
                    if (t.isAfter(from) && t.isBefore(to)) {
                        out.add(t);
                    }
                }
            }
        }
        return List.copyOf(out);
    }
}

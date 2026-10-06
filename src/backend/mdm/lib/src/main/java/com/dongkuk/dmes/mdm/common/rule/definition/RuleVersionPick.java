package com.dongkuk.dmes.mdm.common.rule.definition;

import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.version.VersionedRow;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;
import java.util.function.Function;

/**
 * 정의 조회기의 버전 선택 모드(spec 2026-10-06 §3, D-156). {@link #RELEASED} 는 판정 시각 RELEASED(지금 동작), {@link #myDraft} 는
 * {@code draftOwner} 가 소유한 DRAFT(상태가 정확히 DRAFT — REQUESTED·APPROVED 는 아니다)를 판정 시각과 무관하게 먼저 고르고, 없으면 판정 시각
 * RELEASED. 사용자 ID 는 요청이 아니라 서버의 {@code MdmCurrentUser} 에서만 온다.
 */
public record RuleVersionPick(String draftOwner) {

    public static final RuleVersionPick RELEASED = new RuleVersionPick(null);

    /** 사용자 ID 가 null·빈 글자면 {@link #RELEASED}. */
    public static RuleVersionPick myDraft(String userId) {
        return userId == null || userId.isBlank() ? RELEASED : new RuleVersionPick(userId);
    }

    public boolean draftFirst() {
        return draftOwner != null;
    }

    /** 내 DRAFT(여럿이면 VER 최대) → 없으면 {@link RuleVersions#currentReleased}. 소유자는 엔티티마다 다른 게터라 함수로 받는다. */
    public <T extends VersionedRow> Optional<T> pick(Collection<T> versions, Function<T, String> owner, LocalDateTime at) {
        if (draftOwner != null) {
            Optional<T> mine = versions.stream()
                    .filter(v -> "DRAFT".equals(v.getStatus()) && draftOwner.equals(owner.apply(v)))
                    .max(Comparator.comparing(VersionedRow::getVer));
            if (mine.isPresent()) {
                return mine;
            }
        }
        return RuleVersions.currentReleased(versions, at);
    }
}

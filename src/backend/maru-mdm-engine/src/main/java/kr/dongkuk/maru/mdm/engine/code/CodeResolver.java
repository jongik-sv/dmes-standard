package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 마루 코드 해석기 — 기준일 버전 선택·버전 소급·카테고리 소급·REGEX/TABLE 해석(06-business-rule.md:460,
 * 02:393-416, 04 「판정 참고 구현」 04:670-735). EvalEx 를 쓰지 않는다. {@code spi} 만 본다(06:463).
 * 구현은 {@code CodeLookup}·{@code CodeEffLookup} 을 받아 만든다(TSK-03-02).
 *
 * <p>{@code baseDt} 는 KST 벽시계 초 단위다. {@code MASTER} 는 평가 시각을, {@code MASTER_AT} 은 넷째 인자를,
 * {@code CODE_LIST} 는 호출자가 준 시각(주지 않으면 서버 API 가 현재 시각)을 넘긴다.
 */
public interface CodeResolver {

    /** apply_from ≤ baseDt < apply_to 인 RELEASED 버전, 없으면 최초 RELEASED(버전 소급). RELEASED 가 없으면 빈 값. */
    Optional<BigDecimal> selectVersion(String maruCodeId, LocalDateTime baseDt);

    /** {@code MASTER}(마루 코드 대상) — 고른 버전의 카테고리 해석 결과에 code 가 있으면 true. code 가 null 이면 false. */
    boolean isMember(String maruCodeId, String cateId, String code, LocalDateTime baseDt);

    /** {@code MASTER(…, attr)} — isMember 가 참일 때 그 버전에 유효한 코드 행의 attrNN 문자열. 아니면 빈 값. */
    Optional<String> attr(String maruCodeId, String cateId, String code, LocalDateTime baseDt, int attrNo);

    /**
     * {@code MASTER}·{@code MASTER_AT} 한 번 — 목차({@code CodeLookup#code})를 한 번만 읽어 마루 코드인지 가리고, 맞으면 소속과
     * 속성을 함께 돌려준다. 마루 코드가 아니면 빈 값(호출자가 마루 데이터로 넘긴다). {@code withAttrs} 가 거짓이면 속성을 읽지 않는다.
     * 결과 의미는 {@link #isMember}·{@link #attr} 와 같다.
     */
    Optional<CodeMatch> match(String maruCodeId, String cateId, String code, LocalDateTime baseDt, boolean withAttrs);

    /** {@code CODE_LIST} — seq 오름차순, 같으면 code 순. DEPRECATED 마루 코드는 빈 목록(02:425-426). */
    List<CodeListEntry> codeList(String maruCodeId, String cateId, LocalDateTime baseDt);

    /** 사본 적재용 — (버전, 카테고리)의 코드 집합. 소급을 적용한 결과(04:732). */
    Set<String> effectiveCodes(String maruCodeId, BigDecimal ver, String cateId);

    /**
     * {@link #match} 결과 — 소속 여부와 그 버전에 유효한 코드 행의 attr01..attr10(소속이 아니거나 속성을 읽지 않았으면 빈 목록).
     */
    record CodeMatch(boolean member, List<String> attrs) {

        public CodeMatch {
            attrs = attrs == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(attrs)); // 빈 칸 null 을 담으므로 List.copyOf 를 쓰지 않는다
        }

        /** attrNN(1~10) 문자열. 소속이 아니거나 값이 NULL 이면 빈 값. */
        public Optional<String> attr(int attrNo) {
            return member && attrNo >= 1 && attrNo <= attrs.size() ? Optional.ofNullable(attrs.get(attrNo - 1)) : Optional.empty();
        }
    }

    /** CODE_LIST 한 줄 — 열 넷(02:425). */
    record CodeListEntry(String code, String name, String alterName, Integer seq) {}
}

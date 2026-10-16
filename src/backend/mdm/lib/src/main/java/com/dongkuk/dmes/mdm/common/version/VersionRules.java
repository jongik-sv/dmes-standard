package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.support.MdmStrings;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * 버전 입력 처리 공통 규칙(D-144) — 화면이 보낸 버전·종류·적용 시작 일시 문자열 해석, 새 버전 번호 검사, 새 버전 가능 여부 플래그,
 * 미적용·결재 중 판정.
 * 룰·룰 세트·레이아웃·마스터코드·ERD 화면 서비스가 같이 쓴다. 번호 계산 자체는 {@link VersionNumbers}.
 */
public final class VersionRules {

    private static final DateTimeFormatter APPLY_FROM_TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final String APPLY_FROM = "applyFrom";

    private VersionRules() {
    }

    /**
     * 확정 화면이 보낸 적용 시작 일시 {@code yyyy-MM-dd HH:mm:ss}(KST). 빈 값은 REQUIRED_VALUE, 형식 오류·열린 끝
     * ({@link VersionConventions#OPEN_END}) 이상은 INVALID_VALUE 이고 둘 다 field {@code applyFrom} 칸 오류를 단다.
     * 룰·룰 세트·마스터코드·레이아웃·ERD 확정이 같이 쓴다(전에는 룰·코드 확정 화면에 사본이 있었다).
     */
    public static LocalDateTime parseApplyFrom(String value) {
        String v = MdmStrings.trimToNull(value);
        if (v == null) {
            throw applyFromError(ErrorCode.REQUIRED_VALUE, "적용 시작 일시를 입력하세요");
        }
        LocalDateTime parsed;
        try {
            parsed = LocalDateTime.parse(v, APPLY_FROM_TEXT);
        } catch (DateTimeParseException e) {
            throw applyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 yyyy-MM-dd HH:mm:ss 형식이어야 합니다: " + v);
        }
        if (!parsed.isBefore(VersionConventions.OPEN_END)) {
            throw applyFromError(ErrorCode.INVALID_VALUE, "적용 시작 일시는 9999-12-31 00:00:00 보다 앞이어야 합니다");
        }
        return parsed;
    }

    private static BusinessException applyFromError(ErrorCode code, String message) {
        return new BusinessException(code, message, List.of(ErrorDetail.ofGrid(null, null, APPLY_FROM, code.getCode(), message)));
    }

    /** 새 버전 가능 여부와 다음 번호(문자열). nextMajor 는 늘 채우고, nextMinor 는 minor 번호가 남았을 때만 채운다(아니면 null). */
    public record NewVersionFlags(boolean canNewMajor, boolean canNewMinor, String nextMajor, String nextMinor) {
    }

    /**
     * 화면이 보낸 버전 문자열(예: {@code "1.001"})을 scale 3 버전으로. 비면 필수 오류(REQUIRED_VALUE), 소수 넷째 자리 이상이거나
     * 지수 표기 등 숫자 형식이 아니면 INVALID_INPUT(MDM021). 정수 문자열 {@code "1"} 은 {@code 1.000} 이다.
     */
    public static BigDecimal requireVer(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "버전은 필수입니다.");
        }
        return parseVer(raw);
    }

    /** 비어 있으면 null(서버가 기본 버전을 고른다). 형식 오류는 {@link #requireVer} 와 같다. */
    public static BigDecimal optionalVer(String raw) {
        return raw == null || raw.isBlank() ? null : parseVer(raw);
    }

    /** 형식 검사만. 빈 값 처리는 호출자 몫이다(빈 값도 형식 오류로 본다). */
    public static BigDecimal parseVer(String raw) {
        try {
            return VersionNumbers.parse(raw);
        } catch (IllegalArgumentException | ArithmeticException e) { // NumberFormatException 포함
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 형식이 올바르지 않습니다: " + raw, List.of());
        }
    }

    /** 비면 MAJOR, MAJOR·MINOR 이외는 INVALID_INPUT. */
    public static VersionKind parseKind(String raw) {
        if (raw == null || raw.isBlank()) {
            return VersionKind.MAJOR;
        }
        try {
            return VersionKind.valueOf(raw.trim());
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 종류는 MAJOR 또는 MINOR 입니다", List.of());
        }
    }

    /** 종류별 다음 번호. 버전이 없는데 minor 이거나 상한을 넘으면 거부한다. max 는 상태로 거르지 않은 모든 버전의 최대값. */
    public static BigDecimal nextNumber(BigDecimal max, VersionKind kind) {
        if (kind == VersionKind.MINOR && max == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전이 없으면 major 만 만들 수 있습니다", List.of());
        }
        if (kind == VersionKind.MINOR && !VersionNumbers.canMinor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "minor 를 더 올릴 수 없습니다. major 를 올리십시오", List.of());
        }
        if (kind == VersionKind.MAJOR && !VersionNumbers.canMajor(max)) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "major 를 더 올릴 수 없습니다", List.of());
        }
        return VersionNumbers.next(max, kind);
    }

    /**
     * 새 버전 가능 여부 플래그. {@code allowed} 는 번호와 무관한 허용 조건(원천·폐기·미적용 버전 등). {@code nextMajor} 는 허용
     * 여부와 무관하게 항상 채우고(상한을 넘어도 계산한 값), {@code nextMinor} 는 minor 번호가 남아 있을 때만 채운다.
     */
    public static NewVersionFlags newVersionFlags(BigDecimal max, boolean allowed) {
        boolean minorLeft = VersionNumbers.canMinor(max);
        return new NewVersionFlags(
                allowed && VersionNumbers.canMajor(max),
                allowed && minorLeft,
                VersionNumbers.plain(VersionNumbers.nextMajor(max)),
                minorLeft ? VersionNumbers.plain(VersionNumbers.nextMinor(max)) : null);
    }

    /**
     * 미적용(넓은 뜻, BE 리팩토링 2회차 C2) — DRAFT·REQUESTED·APPROVED, 또는 적용 시작이 {@code now} 보다 뒤인 RELEASED(04:284).
     * 경계({@code applyFrom == now})는 적용됨이다. 적용 시작이 없는 RELEASED 와 CANCELLED 는 미적용이 아니다. REQUESTED·APPROVED 는
     * 결재 보류로 지금은 생기지 않지만 생기면 미적용으로 센다. {@code now} 를 몇 자리로 자를지는 호출자가 정한다.
     */
    public static boolean isUnapplied(String status, LocalDateTime applyFrom, LocalDateTime now) {
        if (VersionStatus.DRAFT.name().equals(status) || isInApproval(status)) {
            return true;
        }
        return VersionStatus.RELEASED.name().equals(status) && applyFrom != null && applyFrom.isAfter(now);
    }

    /** 결재 중 — REQUESTED·APPROVED(C2). 결재 보류로 지금은 생기지 않는다. */
    public static boolean isInApproval(String status) {
        return VersionStatus.REQUESTED.name().equals(status) || VersionStatus.APPROVED.name().equals(status);
    }
}

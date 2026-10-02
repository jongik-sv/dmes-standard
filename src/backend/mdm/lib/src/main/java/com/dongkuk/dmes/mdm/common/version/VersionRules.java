package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import java.math.BigDecimal;
import java.util.List;

/**
 * 버전 입력 처리 공통 규칙(D-144) — 화면이 보낸 버전·종류 문자열 해석, 새 버전 번호 검사, 새 버전 가능 여부 플래그.
 * 룰·룰 세트·레이아웃·마스터코드 화면 서비스가 같이 쓴다. 번호 계산 자체는 {@link VersionNumbers}.
 */
public final class VersionRules {

    private VersionRules() {
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
}

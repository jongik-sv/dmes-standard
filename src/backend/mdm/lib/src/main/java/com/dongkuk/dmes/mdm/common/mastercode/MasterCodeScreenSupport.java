package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSegments.same;
import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;
import static com.dongkuk.dmes.mdm.common.support.MdmStrings.isBlank;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 마스터코드 편집 화면 서비스 공용 — 마루 코드 헤더 읽기·버전 고르기·응답 map·버전 문자열(BE 리팩토링 2회차 C6). 업무 규칙은 두지
 * 않는다.
 *
 * <p>카테고리 편집({@code codeCateEdit})과 코드 항목 편집({@code codeItemEdit})이 같은 private 사본을 따로 두던 것을 모았다.
 * 본보기는 {@code common/rule/RuleScreenSupport} 다. 마루 코드 수정({@code codeEdit})·확정({@code codeConfirm})의 {@code parseVer} 는
 * 입력의 공백을 자르고 오류 문구도 달라 합치지 않는다.
 */
@Component
public class MasterCodeScreenSupport {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int VER_SCALE = VersionTarget.MASTER_CODE.versionScale();

    private final MasterCodeRows rows;
    private final Clock clock;

    public MasterCodeScreenSupport(MasterCodeRows rows, Clock clock) {
        this.rows = rows;
        this.clock = clock;
    }

    /** 마루 코드 헤더 행. id 가 비었거나 행이 없으면 INVALID 다. */
    public MdmCode header(String maruCodeId) {
        if (isBlank(maruCodeId)) {
            throw invalid("maruCodeId 가 필요합니다");
        }
        return rows.code(maruCodeId).orElseThrow(() -> invalid("마루 코드가 없습니다: " + maruCodeId));
    }

    /** 쓰기 대상 버전 행이 없으면 MDM001(ROW_VERSION_CONFLICT)이다. */
    public void requireVersionExists(String id, BigDecimal v) {
        if (rows.versions(id).stream().noneMatch(e -> same(e.getVer(), v))) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
    }

    /**
     * 미적용 — 공통 {@link VersionRules#isUnapplied}(넓은 뜻: DRAFT·REQUESTED·APPROVED, 또는 적용 시작이 지금보다 뒤인 RELEASED.
     * 경계 = now 는 적용됨, F5). 지금 시각은 초 단위로 자른다.
     */
    public boolean isUnapplied(MdmCodeVer ver) {
        return VersionRules.isUnapplied(ver.getStatus(), ver.getApplyFrom(),
                LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS));
    }

    /** 버전 목록에서 {@code v} 를 찾는다. 없으면 INVALID 다. */
    public static MdmCodeVer version(List<MdmCodeVer> versions, BigDecimal v) {
        return versions.stream().filter(e -> same(e.getVer(), v)).findFirst()
                .orElseThrow(() -> invalid("버전이 없습니다: " + verText(v)));
    }

    /** DRAFT → 없으면 CANCELLED 가 아닌 가장 큰 버전(versions 는 내림차순). */
    public static Optional<MdmCodeVer> defaultVersion(List<MdmCodeVer> versions) {
        Optional<MdmCodeVer> draft = versions.stream()
                .filter(e -> VersionStatus.DRAFT.name().equals(e.getStatus())).findFirst();
        return draft.isPresent() ? draft : versions.stream()
                .filter(e -> !VersionStatus.CANCELLED.name().equals(e.getStatus())).findFirst();
    }

    /** 헤더 응답 5키. 돌려주는 map 은 고칠 수 있다(코드 항목 편집이 뒤에 {@code attrLabels} 를 더한다). */
    public static Map<String, Object> headerMap(MdmCode code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("maruCodeId", code.getMaruCodeId());
        m.put("maruCodeName", code.getMaruCodeName());
        m.put("sourceKind", code.getSourceKind());
        m.put("status", code.getStatus());
        m.put("lvlCnt", code.getLvlCnt());
        return m;
    }

    /** 버전 응답 7키. */
    public static Map<String, Object> versionMap(MdmCodeVer ver) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ver", verText(ver.getVer()));
        m.put("display", display(ver.getVer()));
        m.put("status", ver.getStatus());
        m.put("verKind", ver.getVerKind());
        m.put("ownerId", ver.getOwnerId());
        m.put("applyFrom", ver.getApplyFrom() == null ? null : DATE_TIME.format(ver.getApplyFrom()));
        m.put("applyTo", ver.getApplyTo() == null ? null : DATE_TIME.format(ver.getApplyTo()));
        return m;
    }

    public static VersionRef ref(String id, BigDecimal v) {
        return new VersionRef(VersionTarget.MASTER_CODE, id, v);
    }

    /** 요청·응답의 버전은 문자열이다(JS number 는 2.000 의 소수 자릿수를 잃는다). 비면 INVALID 다. */
    public static BigDecimal parseVer(String raw) {
        if (isBlank(raw)) {
            throw invalid("ver 가 필요합니다");
        }
        return VersionRules.parseVer(raw);
    }

    /**
     * 응답에 싣는 버전 문자열({@code "1.000"}). 버전이 없으면 null. DB 가 돌려주는 값의 자릿수는 일정하지 않으므로(SQLite 는
     * NUMERIC(7,3) 을 INTEGER·REAL 로 저장하고(F8), Oracle 은 {@code 1.000} 을 {@code 1} 로 돌려준다) 마스터코드 자릿수로 맞춘 뒤 문자열로 바꾼다.
     */
    public static String verText(BigDecimal v) {
        return v == null ? null : v.setScale(VER_SCALE).toPlainString();
    }

    /** 화면 표시 버전({@code "v1.000"}). */
    public static String display(BigDecimal v) {
        return "v" + verText(v);
    }
}

package com.dongkuk.dmes.mcm.widget.admin.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.admin.dto.CommWidgetMngRequest;
import com.dongkuk.dmes.mcm.widget.admin.dto.WidgetDefSaveRequest;
import com.dongkuk.dmes.mcm.widget.admin.repository.WidgetUsageRepository;
import com.dongkuk.dmes.mcm.widget.collect.WidgetCollectProperties;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.def.service.WidgetDefMaps;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

/**
 * 위젯관리 — 정의·덮어쓰기 action(스펙 2026-10-02-widget-admin-generic §5.2·§5.3). BPMN commWidgetMng 이 부른다.
 * 메뉴 권한(RBAC)으로 보호되는 관리자 서비스라 정의 설정(SQL 등)을 그대로 돌려준다. 기본 배치 action 은
 * {@code CommWidgetLayoutService}. 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1) —
 * 쓰기는 저장소 한 번 호출이라 그 호출의 트랜잭션으로 충분하다.
 */
@Service("commWidgetMngService")
public class CommWidgetMngService {

    static final int PREVIEW_MAX_ROWS = 50;
    static final String MCM_DATA_SRC = "mcm";
    private static final int GRID_COLS = 24;
    private static final int TITLE_MAX = 50;
    private static final int REFRESH_MIN = 30;
    private static final int REFRESH_MAX = 86_400;
    private static final int ID_ATTEMPTS = 10;
    /** shared validateWidgetMeta 의 위젯 ID 정규식 — 코드 위젯 ID 형식. */
    private static final Pattern CODE_ID = Pattern.compile("^[a-z][a-zA-Z0-9]*\\.[a-zA-Z][a-zA-Z0-9]*$");
    private static final Pattern TYPE_ID = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private static final String DEF_PREFIX = "def.";
    private static final String LOWER = "abcdefghijklmnopqrstuvwxyz";
    private static final String LOWER_DIGIT = LOWER + "0123456789";

    private final WidgetDefRepository defRepository;
    private final WidgetUsageRepository usageRepository;
    private final WidgetQueryRunner queryRunner;
    private final ApplicationEventPublisher eventPublisher;
    private final WidgetCollectProperties collectProperties;
    private final SecureRandom random = new SecureRandom();

    @Autowired
    public CommWidgetMngService(WidgetDefRepository defRepository,
                                WidgetUsageRepository usageRepository,
                                WidgetQueryRunner queryRunner,
                                ApplicationEventPublisher eventPublisher,
                                WidgetCollectProperties collectProperties) {
        this.defRepository = defRepository;
        this.usageRepository = usageRepository;
        this.queryRunner = queryRunner;
        this.eventPublisher = eventPublisher;
        this.collectProperties = collectProperties;
    }

    /**
     * 정의·덮어쓰기 행 전체(configJson 그대로 + userCount)와 usage — 사용자 탭에 놓인 위젯별 DISTINCT 사용자 수
     * (DB 행이 없는 코드 위젯 포함).
     */
    public Map<String, Object> search(CommWidgetMngRequest request) {
        String detailId = request == null ? null : blankToNull(request.getWidgetId());
        if (detailId != null) {
            // 상세 — 행을 고를 때 설정(configJson)을 받는다(목록은 설정 없이 내려갈 수 있다).
            List<Map<String, Object>> one = new ArrayList<>();
            defRepository.findById(detailId).ifPresent(d -> one.add(WidgetDefMaps.toMap(d)));
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("defs", one);
            return detail;
        }
        Map<String, Long> usage = new TreeMap<>();
        for (Object[] row : usageRepository.countUsersByWidget()) {
            usage.put(String.valueOf(row[0]), ((Number) row[1]).longValue());
        }
        boolean withConfig = request == null || request.getIncludeConfig() == null || request.getIncludeConfig();
        List<Map<String, Object>> defs = new ArrayList<>();
        if (withConfig) {
            for (WidgetDef d : defRepository.findAllByOrderByWidgetIdAsc()) {
                Map<String, Object> m = WidgetDefMaps.toMap(d);
                m.put("userCount", usage.getOrDefault(d.getWidgetId(), 0L));
                defs.add(m);
            }
        } else {
            // 설정 칸을 읽지 않는다 — 정렬·나머지 키는 설정 포함 조회와 같다.
            for (Object[] r : defRepository.findAllSummaryOrderByWidgetIdAsc()) {
                Map<String, Object> m = WidgetDefMaps.toSummaryMap(r);
                m.put("userCount", usage.getOrDefault(String.valueOf(r[0]), 0L));
                defs.add(m);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("defs", defs);
        result.put("usage", usage);
        return result;
    }

    /**
     * 정의 행 1개 저장. 코드 위젯(C)은 덮어쓰기 upsert, 정의 위젯(D)은 신규면 {@code def.{key}} 를 만들어 insert·그 밖 update.
     * 검사는 §5.3. 저장 뒤 {@link WidgetDefSavedEvent} 를 낸다(쿼리 결과 캐시 비우기).
     */
    public Map<String, Object> save(WidgetDefSaveRequest request) {
        String srcTp = blankToNull(request.getSrcTp());
        if (!WidgetDef.SRC_CODE.equals(srcTp) && !WidgetDef.SRC_DEF.equals(srcTp)) {
            throw invalid("위젯 구분(srcTp)은 C 또는 D 여야 합니다.");
        }
        boolean definition = WidgetDef.SRC_DEF.equals(srcTp);
        String widgetId = blankToNull(request.getWidgetId());

        String title = text(request.getTitle(), "이름", TITLE_MAX, definition);
        String subtitle = text(request.getSubtitle(), "부제", 100, false);
        String description = text(request.getDescription(), "설명", 400, false);
        String linkPageId = text(request.getLinkPageId(), "화면 열기 pageId", 200, false);
        checkSizes(request);
        Integer refreshSec = request.getRefreshSec();
        if (refreshSec != null && (refreshSec < REFRESH_MIN || refreshSec > REFRESH_MAX)) {
            throw invalid("새로 고침 주기는 " + REFRESH_MIN + "~" + REFRESH_MAX + "초로 정합니다(비우면 없음).");
        }
        String multipleYn = yn(request.getMultipleYn(), "여러 번 허용(multipleYn)");
        // 분류 — 공통코드 그룹 WIDGET_CTG 값. 화면이 옵션을 내려주므로 여기서는 길이만 본다.
        String categoryCd = text(request.getCategoryCd(), "분류(categoryCd)", 20, false);
        // 비공개 — Y 면 서랍에 안 보인다(2026-10-05 위젯 개선 §10).
        String privateYn = yn(request.getPrivateYn(), "비공개(privateYn)");
        String useYn = yn(request.getUseYn(), "사용(useYn)");

        String typeId = null;
        String dataSrc = null;
        String configJson = null;
        WidgetDef row;
        if (definition) {
            typeId = blankToNull(request.getTypeId());
            if (typeId == null || typeId.length() > 40 || !TYPE_ID.matcher(typeId).matches()) {
                throw invalid("위젯 유형 ID 형식이 올바르지 않습니다(소문자·숫자·하이픈, 40자 이하): " + typeId);
            }
            configJson = blankToNull(request.getConfigJson());
            if (configJson == null) configJson = "{}";
            dataSrc = WidgetDefConfigRules.check(typeId, request.getDataSrc(), configJson, queryRunner,
                    collectProperties::isAllowedHost); // 정시 수집 http 원천은 허용 호스트만 저장
            if (widgetId == null) {
                row = new WidgetDef();
                widgetId = newDefinitionId();
            } else {
                row = defRepository.findById(widgetId)
                        .orElseThrow(() -> invalid("위젯 정의를 찾을 수 없습니다"));
                if (!row.isDefinition()) throw invalid("코드 위젯을 정의 위젯으로 바꿀 수 없습니다: " + row.getWidgetId());
            }
        } else {
            if (widgetId == null || widgetId.length() > 100 || widgetId.startsWith(DEF_PREFIX)
                    || !CODE_ID.matcher(widgetId).matches()) {
                throw invalid("코드 위젯 ID 형식이 올바르지 않습니다: " + widgetId);
            }
            row = defRepository.findById(widgetId).orElseGet(WidgetDef::new);
        }

        row.setWidgetId(widgetId);
        row.setSrcTp(srcTp);
        row.setTypeId(typeId);
        row.setTitle(title);
        row.setSubtitle(subtitle);
        row.setDescription(description);
        row.setDefW(request.getDefW());
        row.setDefH(request.getDefH());
        row.setMinW(request.getMinW());
        row.setMinH(request.getMinH());
        row.setMaxW(request.getMaxW());
        row.setMaxH(request.getMaxH());
        row.setRefreshSec(refreshSec);
        row.setLinkPageId(linkPageId);
        row.setMultipleYn(multipleYn);
        row.setCategoryCd(categoryCd);
        row.setPrivateYn(privateYn);
        row.setUseYn(useYn == null ? "Y" : useYn);
        row.setDataSrc(dataSrc);
        row.setConfigJson(configJson);
        defRepository.save(row);
        eventPublisher.publishEvent(new WidgetDefSavedEvent(widgetId));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("def", WidgetDefMaps.toMap(row));
        return result;
    }

    /**
     * 정의 위젯(D)은 사용자 수 0 일 때만 지운다. 코드 위젯(C)은 덮어쓰기 행을 지운다(= 코드 값으로 되돌리기).
     * 지운 뒤 {@link WidgetDefSavedEvent} 를 낸다.
     */
    public Map<String, Object> delete(CommWidgetMngRequest request) {
        String widgetId = blankToNull(request.getWidgetId());
        if (widgetId == null) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "위젯 ID 가 없습니다.");
        WidgetDef row = defRepository.findById(widgetId).orElseThrow(() -> invalid("위젯 정의를 찾을 수 없습니다"));
        if (row.isDefinition() && usageRepository.countUsers(widgetId) > 0) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요");
        }
        defRepository.delete(row);
        eventPublisher.publishEvent(new WidgetDefSavedEvent(widgetId));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", widgetId);
        return result;
    }

    /** 저장 전 SQL 시험 실행 — 관리자 본인 시스템 변수·입력 조건 기본값으로, 행 상한 50(§5.2). 검사·실행 오류는 실행기가 던진다. */
    public Map<String, Object> previewQuery(CommWidgetMngRequest request) {
        String dataSrc = WidgetDefConfigRules.requireDataSrc(request.getDataSrc());
        String sql = blankToNull(request.getSql());
        if (sql == null) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "SQL 을 입력해 주세요.");
        WidgetQueryResult r = queryRunner.preview(dataSrc, sql, PREVIEW_MAX_ROWS, blankToNull(request.getParamsJson()));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", r.columns());
        result.put("rows", r.rows());
        result.put("truncated", r.truncated());
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** {@code def.} + 소문자 1 + 소문자·숫자 7. 이미 있으면 다시 만든다. */
    private String newDefinitionId() {
        for (int attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
            StringBuilder sb = new StringBuilder(DEF_PREFIX);
            sb.append(LOWER.charAt(random.nextInt(LOWER.length())));
            for (int i = 0; i < 7; i++) sb.append(LOWER_DIGIT.charAt(random.nextInt(LOWER_DIGIT.length())));
            String id = sb.toString();
            if (!defRepository.existsById(id)) return id;
        }
        throw new BusinessException(ErrorCode.DUPLICATE_DATA, "위젯 ID 를 만들지 못했습니다. 다시 저장해 주세요.");
    }

    private static void checkSizes(WidgetDefSaveRequest r) {
        positive(r.getDefW(), "기본 폭");
        positive(r.getDefH(), "기본 높이");
        positive(r.getMinW(), "최소 폭");
        positive(r.getMinH(), "최소 높이");
        positive(r.getMaxW(), "최대 폭");
        positive(r.getMaxH(), "최대 높이");
        ordered(r.getMinW(), r.getDefW(), r.getMaxW(), "폭");
        ordered(r.getMinH(), r.getDefH(), r.getMaxH(), "높이");
        if (r.getDefW() != null && r.getDefW() > GRID_COLS) throw invalid("기본 폭은 " + GRID_COLS + "칸 이하로 정합니다.");
        if (r.getMinW() != null && r.getMinW() > GRID_COLS) throw invalid("최소 폭은 " + GRID_COLS + "칸 이하로 정합니다.");
    }

    private static void positive(Integer v, String label) {
        if (v != null && v < 1) throw invalid(label + "은(는) 1 이상 정수로 정합니다(비우면 기본값).");
    }

    /** 같은 축 MIN ≤ DEF ≤ MAX(둘 다 있을 때). */
    private static void ordered(Integer min, Integer def, Integer max, String axis) {
        if ((min != null && def != null && min > def) || (def != null && max != null && def > max)
                || (min != null && max != null && min > max)) {
            throw invalid(axis + "은 최소 ≤ 기본 ≤ 최대로 정합니다.");
        }
    }

    private static String text(String raw, String label, int max, boolean required) {
        String v = blankToNull(raw);
        if (v == null) {
            if (required) throw new BusinessException(ErrorCode.REQUIRED_VALUE, label + "을(를) 입력해 주세요.");
            return null;
        }
        if (v.length() > max) throw invalid(label + "은(는) " + max + "자 이하로 정합니다.");
        return v;
    }

    private static String yn(String raw, String label) {
        String v = blankToNull(raw);
        if (v == null) return null;
        if (!"Y".equals(v) && !"N".equals(v)) throw invalid(label + "은(는) Y 또는 N 이어야 합니다.");
        return v;
    }

    static String blankToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() || "null".equals(t) ? null : t;
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}

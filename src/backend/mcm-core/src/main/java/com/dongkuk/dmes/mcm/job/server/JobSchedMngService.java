package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.job.builtin.QueryStatementGuard;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfig;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.job.builtin.collect.CollectException;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import com.dongkuk.dmes.mcm.job.server.dto.JobSchedMngRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 예약 작업 관리 OASIS 서비스 {@code jobSchedMng}(설계 §7). {@code @Transactional} 없음(OASIS 가 서비스마다 트랜잭션을 연다). SYSADMIN 만 호출한다(메뉴 RBAC).
 * 저장은 검사를 모두 통과해야 하고 서비스 ID·Action 은 유형이 정한다(BPMN 만 사용자가 고른다). 저장은 커밋되면 다음 분 틱부터 모든 MCM 에 반영된다(캐시 없음).
 * CODE 작업(출처 CODE)은 일정·사용·시간 초과·변수 값·설명·고급 설정만 바꾼다. 실행 기록 MSG 와 로그에는 SQL 원문·주소·인증값을 넣지 않는다.
 */
public class JobSchedMngService {

    private static final Pattern JOB_ID = Pattern.compile("^[A-Za-z0-9_.-]{1,60}$");
    private static final Pattern SERVICE_ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_^.-]{0,199}$");
    private static final Pattern ACTION = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,49}$");
    private static final Set<String> MODULES = Set.of("MCM", "MDM", "MPP", "MLS", "MQC", "MPN");
    private static final Set<String> KINDS = Set.of("CODE", "BPMN", "QUERY", "COLLECT");
    /** 내장 서비스 ID — BPMN 유형으로는 등록할 수 없다(쿼리 실행·수집 유형으로 등록). */
    private static final Set<String> BUILTIN_SERVICE_IDS = Set.of("jobCode", "jobQuery", "jobCollect");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JobDefStore store;
    private final JobDispatchService dispatch;
    private final JobCallSink sink;
    private final JobCollectSql collectSql;
    private final Duration decisionWait;
    private final SecurityIdentity identity;

    /** @param identity 인증된 사용자 ID 를 읽는다. null 이면 {@code admin}(시험용). */
    public JobSchedMngService(JobDefStore store, JobDispatchService dispatch, JobCallSink sink, JobCollectSql collectSql, Duration decisionWait,
                              SecurityIdentity identity) {
        this.store = store;
        this.dispatch = dispatch;
        this.sink = sink;
        this.collectSql = collectSql;
        this.decisionWait = decisionWait;
        this.identity = identity;
    }

    private String currentUser() {
        return identity == null ? "admin" : identity.requireUserId();
    }

    // ── 조회 ─────────────────────────────────────────────────────────

    public Map<String, Object> list(JobSchedMngRequest req) {
        List<Map<String, Object>> rows = store.list(new JobDefStore.Filter(req.getModuleCd(), req.getJobKind(), req.getUseYn(), req.getLastStatus(), req.getKeyword()));
        List<Map<String, Object>> out = new ArrayList<>();
        LocalDateTime now = store.dbNow();
        for (Map<String, Object> r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("jobId", r.get("JOB_ID"));
            m.put("moduleCd", r.get("MODULE_CD"));
            m.put("jobNm", r.get("JOB_NM"));
            m.put("jobKind", r.get("JOB_KIND"));
            m.put("cronExpr", r.get("CRON_EXPR"));
            m.put("cronDesc", describe((String) r.get("CRON_EXPR")));
            m.put("useYn", r.get("USE_YN"));
            m.put("nextRunAt", iso(r.get("NEXT_RUN_AT")));
            m.put("lastStatus", r.get("LAST_STATUS"));
            m.put("lastServerNm", r.get("LAST_SERVER_NM"));
            m.put("lastEndedAt", iso(r.get("LAST_ENDED_AT")));
            m.put("ownerTp", r.get("OWNER_TP"));
            m.put("codeMissing", "CODE".equals(r.get("JOB_KIND")) && stale(r.get("HANDLER_SEEN_AT"), now));
            out.add(m);
        }
        return Map.of("jobs", out);
    }

    public Map<String, Object> get(JobSchedMngRequest req) {
        return Map.of("def", defView(requireExisting(req.getJobId())));
    }

    public Map<String, Object> history(JobSchedMngRequest req) {
        int limit = req.getLimit() == null ? 50 : Math.max(1, Math.min(100, req.getLimit()));
        List<Map<String, Object>> runs = new ArrayList<>();
        for (Map<String, Object> r : store.history(req.getJobId(), limit)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("schedAt", iso(r.get("SCHED_AT")));
            m.put("triggerTp", r.get("TRIGGER_TP"));
            m.put("status", r.get("STATUS"));
            m.put("serverNm", r.get("SERVER_NM"));
            m.put("serviceTag", r.get("SERVICE_TAG"));
            m.put("startedAt", iso(r.get("STARTED_AT")));
            m.put("endedAt", iso(r.get("ENDED_AT")));
            m.put("itemCnt", r.get("ITEM_CNT"));
            m.put("msg", r.get("MSG"));
            m.put("reqUsrId", r.get("REQ_USR_ID"));
            runs.add(m);
        }
        return Map.of("runs", runs);
    }

    public Map<String, Object> cronPreview(JobSchedMngRequest req) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            CronSpec spec = CronSpec.parse(req.getExpr());
            out.put("valid", true);
            out.put("desc", spec.describe());
            out.put("next", spec.nextN(store.dbNow(), 5).stream().map(t -> t.format(ISO)).toList());
            out.put("minGapMin", spec.minGap().toMinutes());
        } catch (IllegalArgumentException e) {
            out.put("valid", false);
            out.put("error", e.getMessage());
        }
        return out;
    }

    public Map<String, Object> handlers(JobSchedMngRequest req) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : store.handlers()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("handlerId", r.get("HANDLER_ID"));
            m.put("moduleCd", r.get("MODULE_CD"));
            m.put("handlerNm", r.get("HANDLER_NM"));
            m.put("defaultCron", r.get("DEFAULT_CRON"));
            m.put("varsJson", r.get("VARS_JSON"));
            m.put("seenAt", iso(r.get("SEEN_AT")));
            m.put("missing", "Y".equals(r.get("MISSING")));
            out.add(m);
        }
        return Map.of("handlers", out);
    }

    // ── 저장 ─────────────────────────────────────────────────────────

    public Map<String, Object> save(JobSchedMngRequest req) {
        return save(req, currentUser());
    }

    /** 사용자 ID 는 인증 정보에서 읽은 값이다 — 요청 본문의 값은 쓰지 않는다. */
    public Map<String, Object> save(JobSchedMngRequest req, String userId) {
        String jobId = req.getJobId() == null ? "" : req.getJobId().strip();
        if (!JOB_ID.matcher(jobId).matches()) throw invalid("작업 ID 는 영문·숫자·_ . - 1~60자여야 합니다");
        Map<String, Object> existing = store.find(jobId).orElse(null);
        boolean isNew = existing == null;
        if (isNew && Boolean.FALSE.equals(req.getNewJob())) throw invalid("작업을 찾을 수 없습니다: " + jobId);
        if (!isNew && Boolean.TRUE.equals(req.getNewJob())) throw invalid("이미 있는 작업 ID 입니다: " + jobId);
        boolean codeOwned = !isNew && "CODE".equals(existing.get("OWNER_TP"));

        String moduleCd = upper(req.getModuleCd());
        String kind = upper(req.getJobKind());
        if (!MODULES.contains(moduleCd)) throw invalid("모듈은 MCM·MDM·MPP·MLS·MQC·MPN 중 하나여야 합니다");
        if (!KINDS.contains(kind)) throw invalid("유형은 CODE·BPMN·QUERY·COLLECT 중 하나여야 합니다");
        String name = req.getJobNm() == null ? "" : req.getJobNm().strip();
        if (name.isEmpty() || name.length() > 100) throw invalid("작업 이름은 1~100자여야 합니다");
        int timeout = req.getTimeoutSec() == null ? 0 : req.getTimeoutSec();
        if (timeout < 10 || timeout > 86400) throw invalid("시간 초과는 10~86400초여야 합니다");
        String desc = req.getJobDesc() == null ? null : req.getJobDesc().strip();
        if (desc != null && desc.length() > 500) throw invalid("설명은 500자까지입니다");
        String useYn = "N".equals(req.getUseYn()) ? "N" : "Y";

        CronSpec cron;
        try {
            cron = CronSpec.parse(req.getCronExpr());
        } catch (IllegalArgumentException e) {
            throw invalid(e.getMessage());
        }
        List<JobVar> vars;
        try {
            vars = JobVars.parse(req.getVarsJson());
        } catch (IllegalArgumentException e) {
            throw invalid(e.getMessage());
        }
        List<String> varErrors = JobVars.validate(vars);
        if (!varErrors.isEmpty()) throw invalid(varErrors.get(0));
        String opts = checkOpts(req.getOptsJson());
        Set<String> varNames = vars.stream().map(JobVar::name).collect(Collectors.toSet());

        String serviceId;
        String svcAction = "run";
        String configJson = blankToNull(req.getConfigJson());
        switch (kind) {
            case "CODE" -> {
                serviceId = "jobCode";
                JsonNode cfg = readObject(configJson, "처리기 설정(configJson)");
                String handlerId = cfg.path("handlerId").asText("");
                if (handlerId.isBlank() || !store.handlerExists(handlerId, moduleCd)) throw invalid("등록된 처리기가 아닙니다: " + handlerId + " (그 모듈 앱이 기동할 때 등록됩니다)");
            }
            case "BPMN" -> {
                serviceId = req.getServiceId() == null ? "" : req.getServiceId().strip();
                svcAction = req.getSvcAction() == null ? "" : req.getSvcAction().strip();
                if (!SERVICE_ID.matcher(serviceId).matches()) throw invalid("서비스 ID 를 형식에 맞게 입력해 주세요");
                if (BUILTIN_SERVICE_IDS.contains(serviceId)) throw invalid("내장 서비스(jobCode·jobQuery·jobCollect)는 쿼리 실행·수집 유형으로 등록하세요");
                if (!ACTION.matcher(svcAction).matches()) throw invalid("Action 을 형식에 맞게 입력해 주세요");
                configJson = null;
            }
            case "QUERY" -> {
                serviceId = "jobQuery";
                JsonNode cfg = readObject(configJson, "쿼리 설정(configJson)");
                QueryStatementGuard.Checked checked;
                try {
                    checked = QueryStatementGuard.check(cfg.path("sql").asText(""));
                } catch (IllegalArgumentException e) {
                    throw invalid(e.getMessage());
                }
                for (String v : checked.variables()) if (!varNames.contains(v)) throw invalid("변수 :" + v + " 를 변수 표에 선언해 주세요");
            }
            default -> {
                serviceId = "jobCollect";
                JsonNode cfg = readObject(configJson, "수집 설정(configJson)");
                CollectConfig parsed;
                try {
                    parsed = CollectConfigs.check(cfg, moduleCd, sql -> collectSql.validate(sql, varNames), null);
                } catch (CollectException | BusinessException e) {
                    throw invalid(e.getMessage());
                }
                long minGap = cron.minGap().toMinutes();
                int floor = parsed.source() instanceof CollectConfig.ExchangeSource ? 60 : 5;
                if (minGap < floor) throw invalid("수집 간격은 " + floor + "분 이상이어야 합니다(지금 최소 " + minGap + "분)");
            }
        }

        LocalDateTime now = store.dbNow();
        if (isNew) {
            store.insert(new JobDefStore.DefRow(jobId, moduleCd, name, kind, serviceId, svcAction, cron.expression(), useYn, configJson, JobVars.toJson(vars), opts,
                    timeout, desc, "USER", cron.next(now)), userId);
        } else {
            if (codeOwned) checkCodeOwnedEdit(existing, name, kind, moduleCd, configJson, vars);
            if (req.getVer() != null && req.getVer() != ((Number) existing.get("VER")).longValue()) {
                throw invalid("다른 사용자가 먼저 고쳤습니다. 다시 불러온 뒤 저장해 주세요");
            }
            boolean scheduleChanged = !cron.expression().equals(existing.get("CRON_EXPR"));
            boolean resumed = "N".equals(existing.get("USE_YN")) && "Y".equals(useYn);
            LocalDateTime next = scheduleChanged || resumed ? cron.next(now) : null;   // 옛 NEXT_RUN_AT 이 남아 밀린 회차가 쏟아지지 않게
            int changed = store.update(new JobDefStore.DefRow(jobId, moduleCd, name, kind, serviceId, svcAction, cron.expression(), useYn, configJson,
                    JobVars.toJson(vars), opts, timeout, desc, (String) existing.get("OWNER_TP"), next), userId, ((Number) existing.get("VER")).longValue());
            if (changed == 0) throw invalid("다른 사용자가 먼저 고쳤습니다. 다시 불러온 뒤 저장해 주세요");
        }
        return Map.of("def", defView(requireExisting(jobId)));
    }

    public Map<String, Object> setUse(JobSchedMngRequest req) {
        Map<String, Object> def = requireExisting(req.getJobId());
        String useYn = "N".equals(req.getUseYn()) ? "N" : "Y";
        LocalDateTime next = null;
        if ("Y".equals(useYn) && "N".equals(def.get("USE_YN"))) {
            next = CronSpec.parse((String) def.get("CRON_EXPR")).next(store.dbNow());   // 사용으로 되돌릴 때 지금 기준으로 다시 계산
        }
        store.setUse(req.getJobId(), useYn, next, currentUser());
        return Map.of("def", defView(requireExisting(req.getJobId())));
    }

    public Map<String, Object> delete(JobSchedMngRequest req) {
        Map<String, Object> def = requireExisting(req.getJobId());
        if (!"USER".equals(def.get("OWNER_TP"))) throw invalid("코드 작업은 삭제할 수 없습니다 — 사용 안 함으로 바꾸세요");
        if (store.hasLiveRun(req.getJobId())) throw invalid("실행 중인 작업은 삭제할 수 없습니다");
        store.delete(req.getJobId());
        return Map.of("deleted", req.getJobId());
    }

    // ── 지금 실행 ────────────────────────────────────────────────────

    public Map<String, Object> runNow(JobSchedMngRequest req) {
        return runNow(req, currentUser());
    }

    public Map<String, Object> runNow(JobSchedMngRequest req, String userId) {
        requireExisting(req.getJobId());
        Map<String, String> overrides = readOverrides(req.getVarOverridesJson());
        JobDispatchService.ManualClaim claim = dispatch.claimManual(req.getJobId(), userId, overrides);
        Map<String, Object> out = new LinkedHashMap<>();
        if (claim.request() == null) {
            out.put("accepted", false);
            out.put("message", claim.rejectReason());
            return out;
        }
        sink.submit(claim.request());   // 커밋 뒤 호출 풀에 넘긴다
        out.put("runId", claim.request().runId());
        String decision = store.awaitDecision(claim.request().runId(), decisionWait);
        if (decision == null) {
            out.put("accepted", true);
            out.put("message", "호출을 보냈습니다. 접수 여부를 아직 모릅니다 — 실행 이력을 확인하세요");
        } else if (decision.startsWith("ACCEPTED:")) {
            out.put("accepted", true);
            out.put("message", "접수되었습니다(" + decision.substring("ACCEPTED:".length()) + ")");
        } else {
            String[] parts = decision.split(":", 3);
            boolean ok = "OK".equals(parts[1]);
            out.put("accepted", ok);
            out.put("message", ok ? "이미 끝났습니다" : "실행되지 않았습니다 — " + (parts.length > 2 && !parts[2].isBlank() ? parts[2] : parts[1]));
        }
        return out;
    }

    // ── 도우미 ───────────────────────────────────────────────────────

    private void checkCodeOwnedEdit(Map<String, Object> existing, String name, String kind, String moduleCd, String configJson, List<JobVar> vars) {
        if (!name.equals(existing.get("JOB_NM"))) throw invalid("코드 작업은 이름을 바꿀 수 없습니다");
        if (!kind.equals(existing.get("JOB_KIND")) || !moduleCd.equals(existing.get("MODULE_CD"))) throw invalid("코드 작업은 유형·모듈을 바꿀 수 없습니다");
        if (!String.valueOf(existing.get("CONFIG_JSON")).replaceAll("\\s", "").equals(String.valueOf(configJson).replaceAll("\\s", ""))) {
            throw invalid("코드 작업은 처리기를 바꿀 수 없습니다");
        }
        List<JobVar> old = JobVars.parse((String) existing.get("VARS_JSON"));
        List<String> oldKeys = old.stream().map(v -> v.name() + ":" + v.type()).toList();
        List<String> newKeys = vars.stream().map(v -> v.name() + ":" + v.type()).toList();
        if (!oldKeys.equals(newKeys)) throw invalid("코드 작업의 변수는 값만 바꿀 수 있습니다(이름·형식은 코드가 정합니다)");
    }

    private Map<String, Object> requireExisting(String jobId) {
        return store.find(jobId).orElseThrow(() -> invalid("작업을 찾을 수 없습니다: " + jobId));
    }

    private Map<String, Object> defView(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId", r.get("JOB_ID"));
        m.put("moduleCd", r.get("MODULE_CD"));
        m.put("jobNm", r.get("JOB_NM"));
        m.put("jobKind", r.get("JOB_KIND"));
        m.put("serviceId", r.get("SERVICE_ID"));
        m.put("svcAction", r.get("ACTION"));
        m.put("cronExpr", r.get("CRON_EXPR"));
        m.put("cronDesc", describe((String) r.get("CRON_EXPR")));
        m.put("useYn", r.get("USE_YN"));
        m.put("configJson", r.get("CONFIG_JSON"));
        m.put("varsJson", r.get("VARS_JSON"));
        m.put("optsJson", r.get("OPTS_JSON"));
        m.put("timeoutSec", r.get("TIMEOUT_SEC"));
        m.put("nextRunAt", iso(r.get("NEXT_RUN_AT")));
        m.put("jobDesc", r.get("JOB_DESC"));
        m.put("ownerTp", r.get("OWNER_TP"));
        m.put("ver", r.get("VER"));
        return m;
    }

    private static String describe(String expr) {
        try {
            return CronSpec.parse(expr).describe();
        } catch (IllegalArgumentException e) {
            return "-";
        }
    }

    private static boolean stale(Object seenAt, LocalDateTime now) {
        if (!(seenAt instanceof Timestamp t)) return true;
        return t.toLocalDateTime().isBefore(now.minusDays(JobDefStore.HANDLER_STALE_DAYS));
    }

    private static String iso(Object ts) {
        return ts instanceof Timestamp t ? t.toLocalDateTime().format(ISO) : null;
    }

    private static String upper(String s) {
        return s == null ? "" : s.strip().toUpperCase(java.util.Locale.ROOT);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static JsonNode readObject(String json, String label) {
        try {
            JsonNode n = json == null ? null : JSON.readTree(json);
            if (n == null || !n.isObject()) throw invalid(label + " 은(는) JSON 객체여야 합니다");
            return n;
        } catch (JsonProcessingException e) {
            throw invalid(label + " 이(가) 올바른 JSON 이 아닙니다");
        }
    }

    /** 고급 설정 {@code {retry:{count,intervalMin}}} 검사(D12 — 첫 판은 재시도만). 비어 있으면 null. */
    private static String checkOpts(String optsJson) {
        if (optsJson == null || optsJson.isBlank()) return null;
        JsonNode n = readObject(optsJson, "고급 설정(optsJson)");
        JsonNode retry = n.get("retry");
        if (retry != null && !retry.isNull()) {
            int count = retry.path("count").asInt(-1);
            int interval = retry.path("intervalMin").asInt(-1);
            if (count < 0 || count > 5) throw invalid("재시도 횟수는 0~5 여야 합니다");
            if (count > 0 && (interval < 1 || interval > 120)) throw invalid("재시도 간격은 1~120분이어야 합니다");
        }
        return n.size() == 0 ? null : optsJson;
    }

    private static Map<String, String> readOverrides(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            Map<String, Object> raw = JSON.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
            Map<String, String> out = new LinkedHashMap<>();
            raw.forEach((k, v) -> out.put(k, v == null ? "" : String.valueOf(v)));
            return out;
        } catch (JsonProcessingException e) {
            throw invalid("변수 덮어쓰기 값(varOverridesJson)이 올바른 JSON 이 아닙니다");
        }
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}

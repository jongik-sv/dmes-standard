package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.code.CodeResolver;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * 업무 모듈 MDM 메타 엔드포인트 {@code /api/{module}/mdmMeta/*}(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.5). 포털 BFF
 * catch-all 이 경로를 그대로 넘기므로 BE 경로가 {@code /api/{module}/...} 로 시작한다. {@code {module}} 이 이 인스턴스 모듈과 다르면 404.
 *
 * <p>권한: columns·domains 는 로그인 사용자(BFF AUTH_ONLY). status·entries·load 는 SYSADMIN 만 — 요청 헤더 {@code X-Authenticated-Role}
 * 로 판정한다(Ruling R10 — mqc·mpp·mpn 에는 ClientKeyFilter·사용자 문맥이 없다). {@code DmomReceiveController} 처럼 {@code @Controller} 없이
 * 클래스 수준 {@code @RequestMapping} + {@code @ResponseBody} 로 두고 자동 설정이 {@code @Bean} 으로 만든다.
 */
@ResponseBody
@RequestMapping("/api/{module}/mdmMeta")
public class MdmMetaController {

    private static final Logger log = LoggerFactory.getLogger(MdmMetaController.class);
    static final String ROLE_HEADER = "X-Authenticated-Role";
    static final String SYSADMIN = "SYSADMIN";
    static final int MAX_PAGE_SIZE = 500;

    private final String module;
    private final String instanceId;
    private final MdmMetaService service;
    private final MdmMetaCache cache;
    private final MdmRevisionPoller poller;
    private final CodeResolver codes;
    private final Clock clock;

    public MdmMetaController(String module, String instanceId, MdmMetaService service, MdmMetaCache cache, MdmRevisionPoller poller,
                             Clock clock) {
        this.module = module;
        this.instanceId = instanceId;
        this.service = service;
        this.cache = cache;
        this.poller = poller;
        this.clock = clock;
        this.codes = new DefaultCodeResolver(new MdmDefinitionLookup(service), CodeEffLookup.NONE);
    }

    public record NamesRequest(List<String> names) {
    }

    public record DomainIdsRequest(List<String> domainIds) {
    }

    public record LoadRequest(String type, List<String> keys) {
    }

    public String module() {
        return module;
    }

    /** 화면 메타 — 요청 이름(물리명 또는 camelCase) 그대로 키를 쓴다. */
    @PostMapping("/columns")
    public ResponseEntity<Map<String, Object>> columns(@PathVariable("module") String module,
                                                       @RequestBody(required = false) NamesRequest body) {
        if (!this.module.equals(module)) {
            return ResponseEntity.notFound().build();
        }
        Map<String, String> physByName = new LinkedHashMap<>();
        for (String name : body == null || body.names() == null ? List.<String>of() : body.names()) {
            String phys = MdmNames.toPhysName(name);
            if (phys != null) {
                physByName.putIfAbsent(name, phys);
            }
        }
        MdmMetaService.MdmLookup r = service.lookup(MdmTargetType.COLUMN, new LinkedHashSet<>(physByName.values()));
        Map<String, Object> items = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        physByName.forEach((name, phys) -> {
            Object v = r.found().get(phys);
            if (v instanceof MdmColumnMeta m) {
                items.put(name, MdmJson.plain(screen(m)));
            } else if (r.unavailable().contains(phys)) {
                unavailable.add(name);
            } else {
                missing.add(name);
            }
        });
        return ResponseEntity.ok(result(items, missing, unavailable));
    }

    @PostMapping("/domains")
    public ResponseEntity<Map<String, Object>> domains(@PathVariable("module") String module,
                                                       @RequestBody(required = false) DomainIdsRequest body) {
        if (!this.module.equals(module)) {
            return ResponseEntity.notFound().build();
        }
        List<String> ids = new ArrayList<>(new LinkedHashSet<>(trimmed(body == null ? null : body.domainIds())));
        MdmMetaService.MdmLookup r = service.lookup(MdmTargetType.DOMAIN, ids);
        Map<String, Object> items = new LinkedHashMap<>();
        r.found().forEach((k, v) -> items.put(k, MdmJson.plain(v)));
        return ResponseEntity.ok(result(items, r.missing(), r.unavailable()));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(@PathVariable("module") String module,
                                                      @RequestHeader(value = ROLE_HEADER, required = false) String roles) {
        ResponseEntity<Map<String, Object>> denied = guard(module, roles);
        if (denied != null) {
            return denied;
        }
        MdmRevisionPoller.Status s = poller.status();
        Map<String, Integer> counts = new LinkedHashMap<>();
        cache.sizes().forEach((t, n) -> counts.put(t.name(), n));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("module", this.module);
        out.put("instanceId", instanceId);
        out.put("appliedSeq", s.appliedSeq());
        out.put("latestSeq", s.latestSeq());
        out.put("lastSuccessAt", s.lastSuccessAt() == null ? null : s.lastSuccessAt().toString());
        out.put("consecutiveFailures", s.consecutiveFailures());
        out.put("lastError", s.lastError());
        out.put("counts", counts);
        out.put("maxEntries", cache.maxEntries());
        out.put("maxAgeSeconds", cache.maxAge().getSeconds());
        return ResponseEntity.ok(out);
    }

    @GetMapping("/entries")
    public ResponseEntity<Map<String, Object>> entries(@PathVariable("module") String module,
                                                       @RequestHeader(value = ROLE_HEADER, required = false) String roles,
                                                       @RequestParam(value = "type", required = false) String type,
                                                       @RequestParam(value = "q", required = false) String q,
                                                       @RequestParam(value = "page", defaultValue = "0") int page,
                                                       @RequestParam(value = "size", defaultValue = "50") int size) {
        ResponseEntity<Map<String, Object>> denied = guard(module, roles);
        if (denied != null) {
            return denied;
        }
        MdmTargetType t = null;
        if (type != null && !type.isBlank()) {
            Optional<MdmTargetType> parsed = MdmTargetType.parse(type);
            if (parsed.isEmpty()) {
                return badRequest("대상 종류가 올바르지 않습니다: " + type);
            }
            t = parsed.get();
        }
        int pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
        int pageNo = Math.max(0, page);
        List<MdmMetaCache.EntryView> all = cache.entries(t, q);
        List<Map<String, Object>> items = all.stream().skip((long) pageNo * pageSize).limit(pageSize).map(MdmMetaController::entryRow).toList();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", all.size());
        out.put("page", pageNo);
        out.put("size", pageSize);
        out.put("items", items);
        return ResponseEntity.ok(out);
    }

    /** 이 인스턴스에 미리 적재(관리 화면 신규). 이미 있으면 지우고 다시 받는다. */
    @PostMapping("/load")
    public ResponseEntity<Map<String, Object>> load(@PathVariable("module") String module,
                                                    @RequestHeader(value = ROLE_HEADER, required = false) String roles,
                                                    @RequestBody(required = false) LoadRequest body) {
        ResponseEntity<Map<String, Object>> denied = guard(module, roles);
        if (denied != null) {
            return denied;
        }
        Optional<MdmTargetType> type = MdmTargetType.parse(body == null ? null : body.type());
        if (type.isEmpty()) {
            return badRequest("대상 종류가 올바르지 않습니다: " + (body == null ? null : body.type()));
        }
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (String k : trimmed(body.keys())) {
            keys.add(type.get() == MdmTargetType.COLUMN ? MdmNames.toPhysName(k) : k);
        }
        MdmMetaService.MdmLookup r = service.reload(type.get(), keys);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("loaded", new ArrayList<>(r.found().keySet()));
        out.put("missing", r.missing());
        out.put("unavailable", r.unavailable());
        return ResponseEntity.ok(out);
    }

    static boolean isSysadmin(String roles) {
        if (roles == null) {
            return false;
        }
        for (String role : roles.split(",")) {
            String t = role.trim();
            if (t.regionMatches(true, 0, "ROLE_", 0, 5)) {
                t = t.substring(5);
            }
            if (SYSADMIN.equalsIgnoreCase(t)) {
                return true;
            }
        }
        return false;
    }

    private ResponseEntity<Map<String, Object>> guard(String module, String roles) {
        if (!this.module.equals(module)) {
            return ResponseEntity.notFound().build();
        }
        if (!isSysadmin(roles)) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("message", "시스템 관리자만 할 수 있습니다");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
        }
        return null;
    }

    /**
     * 컬럼 메타 → 화면 메타. 컬럼 메타는 {@link MdmMetaService} 로 직접 받은 값이다 — {@link MdmDefinitionLookup#column} 을 거치지 않는다(그
     * 경로는 코드 원본까지 미리 받아 실패를 던지므로 캡션·툴팁 메타까지 unavailable 이 된다). 허용 코드는 따로 풀고, 풀 수 없으면(코드 원본을 받을
     * 수 없음·코드 정의 손상) 컬럼은 그대로 두고 {@code allowedCodes} 만 null 로 둔다.
     */
    private MdmScreenColumn screen(MdmColumnMeta m) {
        List<MdmScreenColumn.AllowedCode> allowed = null;
        if (m.codeRef() != null && m.codeRef().maruCodeId() != null && !m.codeRef().maruCodeId().isBlank()) {
            try {
                LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), MdmDefinitionLookup.KST);
                allowed = codes.codeList(m.codeRef().maruCodeId(), m.codeRef().cateId(), now).stream()
                        .map(e -> new MdmScreenColumn.AllowedCode(e.code(), e.name())).toList();
            } catch (RuntimeException e) {
                log.debug("[mdm] 허용 코드를 풀 수 없어 비워 둔다 — {} {}: {}", m.physName(), m.codeRef().maruCodeId(), e.getMessage());
                allowed = null;
            }
        }
        return MdmScreenColumn.of(m, allowed);
    }

    private static Map<String, Object> entryRow(MdmMetaCache.EntryView v) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("type", v.type().name());
        row.put("key", v.key());
        row.put("absent", v.absent());
        row.put("value", MdmJson.plain(v.value()));
        row.put("loadedAt", v.loadedAt().toString());
        row.put("hits", v.hits());
        row.put("remainingSeconds", v.remainingSeconds());
        row.put("loadSeq", v.loadSeq());
        return row;
    }

    private static List<String> trimmed(List<String> values) {
        List<String> out = new ArrayList<>();
        if (values != null) {
            for (String v : values) {
                if (v != null && !v.isBlank()) {
                    out.add(v.trim());
                }
            }
        }
        return out;
    }

    private static Map<String, Object> result(Map<String, Object> items, List<String> missing, List<String> unavailable) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("missing", missing);
        out.put("unavailable", unavailable);
        return out;
    }

    private static ResponseEntity<Map<String, Object>> badRequest(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        return ResponseEntity.badRequest().body(body);
    }
}

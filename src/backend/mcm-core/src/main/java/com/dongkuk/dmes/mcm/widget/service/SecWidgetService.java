package com.dongkuk.dmes.mcm.widget.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetUserSearchRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultLayouts;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 사용자 위젯 탭·배치 저장 — OASIS {@code secWidget}(스펙 2026-10-02-widget-foundation §4.2, 기본 탭·공유는
 * docs/widget-2026-10/design-widget-tabs.md §3.1). 사용자는 늘 인증 컨텍스트에서 얻는다(IDOR). 쓰기 원자성은
 * {@link SecWidgetTabWriter} 가 맡는다 — 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1).
 * <p>기본 탭({@code def-N})은 관리자 테이블에서 접속 때마다 풀어 준다. 사용자가 배치를 바꾸면 사용자 테이블에 같은 탭 ID 로
 * 재정의 행을 두고, 이름·순서는 늘 관리자 값을 쓴다. 해석 집합 밖의 재정의 행은 숨긴다.
 */
@Service("secWidgetService")
public class SecWidgetService {

    static final String HOME_TAB_ID = "home";
    static final String HOME_TAB_NM = "홈";
    static final int GRID_COLS = 24;
    static final int MAX_TABS = 10;
    static final int MAX_WIDGETS = 30;
    static final int TAB_NM_MAX = 20;
    /** 기본 탭 줄의 tabSeq = 이 값 + 관리자 순서(사용자 일반 탭 1~9 와 겹치지 않게). */
    static final int DEFAULT_TAB_SEQ_BASE = 100;
    static final int MAX_SHARE_TARGETS = 10;
    static final String SHARE_PREFIX = "(공유) ";
    static final int USER_SEARCH_MIN = 2;
    static final int USER_SEARCH_MAX = 30;
    static final int USER_SEARCH_LIMIT = 20;
    private static final int USER_ID_MAX = 30;
    private static final Pattern TAB_ID = Pattern.compile("^(home|tab-\\d{1,6}|def-\\d{1,6})$");
    private static final Pattern USER_TAB_ID = Pattern.compile("^tab-(\\d{1,6})$");
    private static final String TAB_PREFIX = "tab-";

    private final SecUserWidgetTabRepository tabRepository;
    private final SecUserWidgetRepository widgetRepository;
    private final SecWidgetTabWriter writer;
    private final SecurityIdentity securityIdentity;
    private final WidgetDefaultTabs defaultTabs;
    private final WidgetDefaultLayoutRepository layoutRepository;
    private final WidgetUserContextResolver userContextResolver;
    private final WidgetUserLookupRepository userLookup;

    @Autowired
    public SecWidgetService(SecUserWidgetTabRepository tabRepository,
                            SecUserWidgetRepository widgetRepository,
                            SecWidgetTabWriter writer,
                            SecurityIdentity securityIdentity,
                            WidgetDefaultTabs defaultTabs,
                            WidgetDefaultLayoutRepository layoutRepository,
                            WidgetUserContextResolver userContextResolver,
                            WidgetUserLookupRepository userLookup) {
        this.tabRepository = tabRepository;
        this.widgetRepository = widgetRepository;
        this.writer = writer;
        this.securityIdentity = securityIdentity;
        this.defaultTabs = defaultTabs;
        this.layoutRepository = layoutRepository;
        this.userContextResolver = userContextResolver;
        this.userLookup = userLookup;
    }

    /**
     * 사용자 탭 전체와 위젯 전체. 탭 순서 = 「홈」 → 해석된 기본 탭(관리자 순서) → 일반 탭. 탭 줄마다 defaultYn·customYn 을 더한다.
     * 재정의 행이 없는 기본 탭의 위젯은 관리자 배치를 그 탭 ID 로 돌려준다(configJson=null).
     */
    public Map<String, Object> search(SecWidgetSearchRequest request) {
        String userId = requireUser();
        WidgetDefaultTabs.Resolved resolved = resolvedFor(userId);
        List<Map<String, Object>> homeTabs = new ArrayList<>();
        List<Map<String, Object>> userTabs = new ArrayList<>();
        Map<String, SecUserWidgetTab> overrides = new HashMap<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) {
            if (WidgetDefaultTabs.isDefaultTabId(t.getTabId())) {
                overrides.put(t.getTabId(), t);
                continue;
            }
            boolean home = HOME_TAB_ID.equals(t.getTabId());
            (home ? homeTabs : userTabs).add(tabMap(t.getTabId(), home ? HOME_TAB_NM : t.getTabNm(), t.getTabSeq(),
                    t.getLockYn(), false, false));
        }
        List<Map<String, Object>> tabs = new ArrayList<>(homeTabs);
        Set<String> shownOverrides = new HashSet<>();
        List<Map<String, Object>> defaultWidgets = new ArrayList<>();
        Map<String, List<WidgetDefaultTabItem>> items = resolved.size() == 0 ? Map.of()
                : defaultTabs.itemsByTab(resolved.layoutKey());
        for (WidgetDefaultTab d : resolved.tabs()) {
            SecUserWidgetTab o = overrides.get(d.getTabId());
            tabs.add(tabMap(d.getTabId(), d.getTabNm(), DEFAULT_TAB_SEQ_BASE + d.getTabSeq(),
                    o == null ? "N" : o.getLockYn(), true, o != null));
            if (o != null) {
                shownOverrides.add(d.getTabId());
                continue;
            }
            for (WidgetDefaultTabItem i : items.getOrDefault(d.getTabId(), List.of())) {
                defaultWidgets.add(widgetMap(d.getTabId(), i.getInstId(), i.getWidgetId(), i.getPosX(), i.getPosY(),
                        i.getSizeW(), i.getSizeH(), i.getLockYn(), null));
            }
        }
        tabs.addAll(userTabs);

        List<Map<String, Object>> widgets = new ArrayList<>();
        for (SecUserWidget w : widgetRepository.findByUserId(userId)) {
            if (WidgetDefaultTabs.isDefaultTabId(w.getTabId()) && !shownOverrides.contains(w.getTabId())) continue;
            widgets.add(widgetMap(w.getTabId(), w.getInstId(), w.getWidgetId(), w.getPosX(), w.getPosY(),
                    w.getSizeW(), w.getSizeH(), w.getLockYn(), w.getConfigJson()));
        }
        widgets.addAll(defaultWidgets);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabs", tabs);
        result.put("widgets", widgets);
        return result;
    }

    /**
     * 탭 하나를 통째로 바꾼다. 위젯 목록은 grids.widgets.rows. 기본 탭({@code def-N})은 해석 집합에 있을 때만 받고(재정의 행 저장),
     * 이름은 관리자 이름으로 덮어쓰며 요청 순서는 쓰지 않는다. newYn=Y 인 {@code tab-N} 이 이미 있으면(화면이 연 뒤 공유 사본이 그 번호로
     * 생긴 경우) 덮어쓰지 않고 사용자 탭 최대 번호 + 1 로 옮겨 새 탭으로 저장하며, 응답 tabId 에 실제 ID 를 돌려준다.
     */
    public Map<String, Object> saveTab(SecWidgetTabSaveRequest request, List<Map<String, Object>> widgets) {
        String userId = requireUser();
        String requestedId = requireTabId(request.getTabId());
        List<SecUserWidgetTab> existing = tabRepository.findByUserIdOrderByTabSeqAsc(userId);
        String tabId = "Y".equals(request.getNewYn()) && USER_TAB_ID.matcher(requestedId).matches()
                && existing.stream().anyMatch(t -> t.getTabId().equals(requestedId))
                ? TAB_PREFIX + (maxUserTabNo(existing) + 1) : requestedId;
        boolean home = HOME_TAB_ID.equals(tabId);
        boolean def = WidgetDefaultTabs.isDefaultTabId(tabId);
        WidgetDefaultTabs.Resolved resolved = resolvedFor(userId);
        WidgetDefaultTab defTab = def ? requireResolved(resolved, tabId) : null;
        String tabNm = home ? HOME_TAB_NM : def ? defTab.getTabNm() : trim(request.getTabNm());
        if (tabNm == null || tabNm.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "탭 이름을 입력해 주세요.");
        }
        if (!def && tabNm.length() > TAB_NM_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 이름은 " + TAB_NM_MAX + "자 이하로 정합니다.");
        }
        boolean isNew = existing.stream().noneMatch(t -> t.getTabId().equals(tabId));
        // 「홈」 포함 MAX_TABS 개: home 은 한도 검사에서 늘 빼고, 새 일반 탭만 (일반 탭 수 + 해석된 기본 탭 수)로 센다.
        // 기본 탭 재정의 행(def-*)은 해석된 기본 탭 수에 이미 들어 있으므로 일반 탭 수에서 뺀다.
        if (!home && !def && isNew && userTabCount(existing) + resolved.size() >= MAX_TABS - 1) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "탭은 " + MAX_TABS + "개까지 만들 수 있습니다.");
        }
        if (!home && !def && (existing.stream().anyMatch(t -> !WidgetDefaultTabs.isDefaultTabId(t.getTabId())
                && !t.getTabId().equals(tabId) && tabNm.equals(t.getTabNm()))
                || resolved.tabs().stream().anyMatch(d -> tabNm.equals(d.getTabNm())))) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 이름의 탭이 있습니다.");
        }
        List<Map<String, Object>> rows = widgets == null ? List.of() : widgets;
        if (rows.size() > MAX_WIDGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "위젯은 탭당 " + MAX_WIDGETS + "개까지 놓을 수 있습니다.");
        }
        List<SecWidgetTabWriter.WidgetValues> values = new ArrayList<>();
        Set<String> instIds = new HashSet<>();
        for (Map<String, Object> row : rows) {
            SecWidgetTabWriter.WidgetValues v = toWidget(row);
            if (!instIds.add(v.instId())) {
                throw new BusinessException(ErrorCode.DUPLICATE_DATA, "같은 위젯 인스턴스 ID 가 두 번 있습니다: " + v.instId());
            }
            values.add(v);
        }
        int seq = home ? 0 : def ? DEFAULT_TAB_SEQ_BASE + defTab.getTabSeq()
                : Math.max(1, request.getTabSeq() == null ? existing.size() : request.getTabSeq());
        String lockYn = "Y".equals(request.getLockYn()) ? "Y" : "N";
        writer.replaceTab(userId, new SecWidgetTabWriter.TabValues(tabId, tabNm, seq, lockYn), values);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("savedCount", values.size());
        return result;
    }

    public Map<String, Object> deleteTab(SecWidgetTabRequest request) {
        String userId = requireUser();
        String tabId = requireTabId(request.getTabId());
        if (HOME_TAB_ID.equals(tabId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "「홈」 탭은 지울 수 없습니다.");
        }
        if (WidgetDefaultTabs.isDefaultTabId(tabId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "기본 탭은 지울 수 없습니다. 기본으로 되돌리기를 쓰세요.");
        }
        writer.deleteTab(userId, tabId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("deleted", true);
        return result;
    }

    /** grids.tabs.rows 의 tabId 순서대로 1부터 매긴다. home 은 늘 0, 기본 탭(def-*)은 관리자 순서로 고정이라 건너뛴다. */
    public Map<String, Object> reorderTabs(List<Map<String, Object>> tabs) {
        String userId = requireUser();
        Set<String> owned = new HashSet<>();
        for (SecUserWidgetTab t : tabRepository.findByUserIdOrderByTabSeqAsc(userId)) owned.add(t.getTabId());
        Map<String, Integer> seq = new LinkedHashMap<>();
        int n = 1;
        for (Map<String, Object> row : tabs == null ? List.<Map<String, Object>>of() : tabs) {
            String tabId = row == null || row.get("tabId") == null ? null : trim(String.valueOf(row.get("tabId")));
            if (tabId == null || HOME_TAB_ID.equals(tabId) || WidgetDefaultTabs.isDefaultTabId(tabId)
                    || !owned.contains(tabId) || seq.containsKey(tabId)) continue;
            seq.put(tabId, n++);
        }
        writer.reorder(userId, seq);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("count", seq.size());
        return result;
    }

    public Map<String, Object> resetHome(SecWidgetSearchRequest request) {
        String userId = requireUser();
        writer.deleteTab(userId, HOME_TAB_ID);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("deleted", 1);
        return result;
    }

    /** 기본으로 되돌리기 — 「홈」 또는 해석 집합의 기본 탭({@code def-N})의 사용자 재정의 행을 지운다. 일반 탭은 거절. */
    public Map<String, Object> resetTab(SecWidgetTabRequest request) {
        String userId = requireUser();
        String tabId = requireTabId(request.getTabId());
        if (WidgetDefaultTabs.isDefaultTabId(tabId)) {
            requireResolved(resolvedFor(userId), tabId);
        } else if (!HOME_TAB_ID.equals(tabId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "「홈」과 기본 탭만 기본으로 되돌릴 수 있습니다.");
        }
        writer.deleteTab(userId, tabId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tabId", tabId);
        result.put("deleted", true);
        return result;
    }

    /**
     * 탭 공유 — 본인 탭의 사본을 받는 사람(grids.targets.rows = [{userId}])마다 「(공유) 이름」 새 일반 탭으로 넣는다.
     * 원본은 본인 행에서만 읽는다(기본 탭·「홈」은 재정의 행, 없으면 기본 배치). 배치·위젯 설정만 넘기고 instId 는 새로 만들며
     * 잠금은 모두 푼다. 받는 사람마다 결과를 돌려주고, 통과한 사본은 한 트랜잭션으로 넣는다.
     */
    public Map<String, Object> shareTab(SecWidgetTabRequest request, List<Map<String, Object>> targets) {
        String userId = requireUser();
        String tabId = requireTabId(request.getTabId());
        // 받는 사람 → 입력 오류 문구(null 이면 정상). 빈 ID·너무 긴 ID 도 조용히 빼지 않고 실패 줄로 돌려준다.
        Map<String, String> requested = new LinkedHashMap<>();
        Set<String> targetIds = new LinkedHashSet<>();
        for (Map<String, Object> row : targets == null ? List.<Map<String, Object>>of() : targets) {
            String id = row == null || row.get("userId") == null ? "" : trim(String.valueOf(row.get("userId")));
            if (id == null || id.isEmpty()) {
                requested.putIfAbsent("", "사용자 ID 가 비었습니다.");
            } else if (id.length() > USER_ID_MAX) {
                requested.putIfAbsent(id, "사용자 ID 가 너무 깁니다.");
            } else {
                requested.putIfAbsent(id, null);
                targetIds.add(id);
            }
        }
        if (requested.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "공유할 사용자를 골라 주세요.");
        }
        if (requested.size() > MAX_SHARE_TARGETS) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "한 번에 " + MAX_SHARE_TARGETS + "명까지 공유할 수 있습니다.");
        }
        ShareSource source = shareSource(userId, tabId);
        Set<String> others = new LinkedHashSet<>(targetIds);
        others.remove(userId);
        Set<String> active = new HashSet<>(userLookup.findActiveUserIds(others, LocalDateTime.now()));

        List<Map<String, Object>> results = new ArrayList<>();
        List<SecWidgetTabWriter.TabCopy> copies = new ArrayList<>();
        for (Map.Entry<String, String> req : requested.entrySet()) {
            String target = req.getKey();
            if (req.getValue() != null) {
                results.add(shareResult(target, false, null, req.getValue()));
                continue;
            }
            if (target.equals(userId)) {
                results.add(shareResult(target, false, null, "본인에게는 공유할 수 없습니다."));
                continue;
            }
            if (!active.contains(target)) {
                results.add(shareResult(target, false, null, "없거나 사용하지 않는 사용자입니다."));
                continue;
            }
            List<SecUserWidgetTab> rows = tabRepository.findByUserIdOrderByTabSeqAsc(target);
            WidgetDefaultTabs.Resolved resolved = resolvedFor(target);
            if (userTabCount(rows) + resolved.size() >= MAX_TABS - 1) {
                results.add(shareResult(target, false, null, "받는 사람의 탭이 가득 찼습니다(" + MAX_TABS + "개)."));
                continue;
            }
            Set<String> names = new HashSet<>();
            names.add(HOME_TAB_NM);
            int maxNo = 0;
            int maxSeq = 0;
            for (SecUserWidgetTab t : rows) {
                if (WidgetDefaultTabs.isDefaultTabId(t.getTabId()) || HOME_TAB_ID.equals(t.getTabId())) continue;
                names.add(t.getTabNm());
                Matcher m = USER_TAB_ID.matcher(t.getTabId());
                if (m.matches()) maxNo = Math.max(maxNo, Integer.parseInt(m.group(1)));
                maxSeq = Math.max(maxSeq, t.getTabSeq() == null ? 0 : t.getTabSeq());
            }
            for (WidgetDefaultTab d : resolved.tabs()) names.add(d.getTabNm());
            String tabNm = shareName(source.tabNm(), names);
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (SecWidgetTabWriter.WidgetValues w : source.widgets()) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(newInstId(), w.widgetId(), w.posX(), w.posY(), w.sizeW(),
                        w.sizeH(), "N", w.configJson()));
            }
            copies.add(new SecWidgetTabWriter.TabCopy(target,
                    new SecWidgetTabWriter.TabValues("tab-" + (maxNo + 1), tabNm, maxSeq + 1, "N"), widgets));
            results.add(shareResult(target, true, tabNm, null));
        }
        if (!copies.isEmpty()) writer.copyTabs(copies);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("results", results);
        return result;
    }

    /** 공유 받는 사람 고르기 — 아이디·이름에 keyword 가 들어간 사용 중 사용자(본인 제외), 최대 20건. 칸은 userId·userNm·deptNm. */
    public Map<String, Object> searchUsers(SecWidgetUserSearchRequest request) {
        String userId = requireUser();
        String keyword = trim(request.getKeyword());
        if (keyword == null || keyword.length() < USER_SEARCH_MIN) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "검색어는 " + USER_SEARCH_MIN + "자 이상 입력해 주세요.");
        }
        if (keyword.length() > USER_SEARCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "검색어는 " + USER_SEARCH_MAX + "자 이하로 입력해 주세요.");
        }
        List<Map<String, Object>> users = new ArrayList<>();
        for (WidgetUserLookupRepository.UserRow r : userLookup.searchActive(keyword, userId, LocalDateTime.now(), USER_SEARCH_LIMIT)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", r.userId());
            m.put("userNm", r.userNm());
            m.put("deptNm", r.deptNm());
            users.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("users", users);
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** 공유 원본 — 이름과 위젯(instId 는 원본 그대로, 사본에서 새로 만든다). */
    private record ShareSource(String tabNm, List<SecWidgetTabWriter.WidgetValues> widgets) {}

    /** 본인 행에서만 원본을 읽는다. 「홈」·기본 탭에 재정의 행이 없으면 사용자 부서 기준 기본 배치를 쓴다. */
    private ShareSource shareSource(String userId, String tabId) {
        Optional<SecUserWidgetTab> own = tabRepository.findById(new SecUserWidgetTabId(userId, tabId));
        if (own.isPresent()) {
            String nm = HOME_TAB_ID.equals(tabId) ? HOME_TAB_NM : own.get().getTabNm();
            if (WidgetDefaultTabs.isDefaultTabId(tabId)) nm = requireResolved(resolvedFor(userId), tabId).getTabNm();
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (SecUserWidget w : widgetRepository.findByUserIdAndTabId(userId, tabId)) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(w.getInstId(), w.getWidgetId(), w.getPosX(), w.getPosY(),
                        w.getSizeW(), w.getSizeH(), w.getLockYn(), w.getConfigJson()));
            }
            return new ShareSource(nm, widgets);
        }
        if (WidgetDefaultTabs.isDefaultTabId(tabId)) {
            WidgetDefaultTabs.Resolved resolved = resolvedFor(userId);
            WidgetDefaultTab d = requireResolved(resolved, tabId);
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (WidgetDefaultTabItem i : defaultTabs.items(resolved.layoutKey(), tabId)) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(i.getInstId(), i.getWidgetId(), i.getPosX(), i.getPosY(),
                        i.getSizeW(), i.getSizeH(), i.getLockYn(), null));
            }
            return new ShareSource(d.getTabNm(), widgets);
        }
        if (HOME_TAB_ID.equals(tabId)) {
            WidgetDefaultLayouts.Found found = WidgetDefaultLayouts.firstExisting(layoutRepository, layoutKeys(userId));
            if (found == null) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, "「홈」 배치를 한 번 저장한 뒤 공유해 주세요.");
            }
            List<SecWidgetTabWriter.WidgetValues> widgets = new ArrayList<>();
            for (WidgetDefaultLayout l : found.rows()) {
                widgets.add(new SecWidgetTabWriter.WidgetValues(l.getInstId(), l.getWidgetId(), l.getPosX(), l.getPosY(),
                        l.getSizeW(), l.getSizeH(), l.getLockYn(), null));
            }
            return new ShareSource(HOME_TAB_NM, widgets);
        }
        throw new BusinessException(ErrorCode.BUSINESS_ERROR, "없는 탭입니다.");
    }

    /** 「(공유) 」+원본 이름을 20자로 자르고, 받는 사람 탭 이름과 겹치면 숫자 꼬리(" 2", " 3" …)를 붙여 다시 20자 안에 맞춘다. */
    static String shareName(String sourceNm, Set<String> taken) {
        String full = SHARE_PREFIX + (sourceNm == null ? "" : sourceNm);
        String name = cut(full, TAB_NM_MAX);
        for (int n = 2; taken.contains(name); n++) {
            String tail = " " + n;
            name = cut(full, TAB_NM_MAX - tail.length()) + tail;
        }
        return name;
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** 공유 사본의 새 instId — 기본 배치 instId 형식({@code [A-Za-z0-9_-]{1,40}})에 맞춘다. */
    private static String newInstId() {
        return "s" + UUID.randomUUID().toString().replace("-", "");
    }

    private static Map<String, Object> shareResult(String userId, boolean ok, String tabNm, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", userId);
        m.put("ok", ok);
        m.put("tabNm", tabNm);
        m.put("message", message);
        return m;
    }

    /** 사용자 부서 사슬 → 전사 순서로 해석한 기본 탭 집합. 부서는 사용자 행에서 읽는다(요청 값을 쓰지 않는다). */
    private WidgetDefaultTabs.Resolved resolvedFor(String userId) {
        return defaultTabs.resolve(userContextResolver.deptChain(userLookup.findDeptCd(userId)));
    }

    private List<String> layoutKeys(String userId) {
        Set<String> keys = new LinkedHashSet<>(userContextResolver.deptChain(userLookup.findDeptCd(userId)));
        keys.add(WidgetDefaultLayout.COMPANY_KEY);
        return List.copyOf(keys);
    }

    private static WidgetDefaultTab requireResolved(WidgetDefaultTabs.Resolved resolved, String tabId) {
        return resolved.find(tabId).orElseThrow(
                () -> new BusinessException(ErrorCode.BUSINESS_ERROR, "쓸 수 없는 기본 탭입니다: " + tabId));
    }

    /** 사용자 일반 탭({@code tab-N}) 중 가장 큰 N. 없으면 0. */
    private static int maxUserTabNo(List<SecUserWidgetTab> rows) {
        int max = 0;
        for (SecUserWidgetTab t : rows) {
            Matcher m = USER_TAB_ID.matcher(t.getTabId());
            if (m.matches()) max = Math.max(max, Integer.parseInt(m.group(1)));
        }
        return max;
    }

    /** 「홈」과 기본 탭 재정의 행(def-*)을 뺀 사용자 일반 탭 수. */
    private static long userTabCount(List<SecUserWidgetTab> rows) {
        return rows.stream()
                .filter(t -> !HOME_TAB_ID.equals(t.getTabId()) && !WidgetDefaultTabs.isDefaultTabId(t.getTabId()))
                .count();
    }

    private static Map<String, Object> tabMap(String tabId, String tabNm, Integer tabSeq, String lockYn,
                                              boolean defaultTab, boolean custom) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tabId", tabId);
        m.put("tabNm", tabNm);
        m.put("tabSeq", tabSeq);
        m.put("lockYn", lockYn);
        m.put("defaultYn", defaultTab ? "Y" : "N");
        m.put("customYn", custom ? "Y" : "N");
        return m;
    }

    private static Map<String, Object> widgetMap(String tabId, String instId, String widgetId, Integer posX, Integer posY,
                                                 Integer sizeW, Integer sizeH, String lockYn, String configJson) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tabId", tabId);
        m.put("instId", instId);
        m.put("widgetId", widgetId);
        m.put("posX", posX);
        m.put("posY", posY);
        m.put("sizeW", sizeW);
        m.put("sizeH", sizeH);
        m.put("lockYn", lockYn);
        m.put("configJson", configJson);
        return m;
    }

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String requireTabId(String raw) {
        String tabId = trim(raw);
        if (tabId == null || !TAB_ID.matcher(tabId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "탭 ID 형식이 올바르지 않습니다.");
        }
        return tabId;
    }

    private static String trim(String s) {
        return s == null || "null".equals(s) ? null : s.trim();
    }

    private static int intOf(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v instanceof Number num) return num.intValue();
        try {
            return Integer.parseInt(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, key + " 는 정수여야 합니다.");
        }
    }

    private static SecWidgetTabWriter.WidgetValues toWidget(Map<String, Object> row) {
        String instId = trim(row.get("instId") == null ? null : String.valueOf(row.get("instId")));
        String widgetId = trim(row.get("widgetId") == null ? null : String.valueOf(row.get("widgetId")));
        if (instId == null || instId.isEmpty() || instId.length() > 40) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 인스턴스 ID 가 올바르지 않습니다.");
        }
        if (widgetId == null || widgetId.isEmpty() || widgetId.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 ID 가 올바르지 않습니다.");
        }
        int x = intOf(row, "posX");
        int y = intOf(row, "posY");
        int w = intOf(row, "sizeW");
        int h = intOf(row, "sizeH");
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > GRID_COLS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 자리·크기가 격자(" + GRID_COLS + "칸) 밖입니다: " + instId);
        }
        String lockYn = "Y".equals(row.get("lockYn")) ? "Y" : "N";
        Object config = row.get("configJson");
        String configJson = config == null ? null : String.valueOf(config);
        if (configJson != null && configJson.length() > 4000) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "위젯 설정이 너무 깁니다: " + instId);
        }
        return new SecWidgetTabWriter.WidgetValues(instId, widgetId, x, y, w, h, lockYn, configJson);
    }
}

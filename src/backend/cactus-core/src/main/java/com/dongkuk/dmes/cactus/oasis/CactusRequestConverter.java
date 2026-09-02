package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CactusRequest → Map&lt;String, TypedObject&gt; 변환기.
 * OASIS ServiceContext는 Map&lt;String, TypedObject&gt;를 입력으로 받는다.
 */
public class CactusRequestConverter {

    /**
     * CactusRequest를 OASIS ServiceContext 입력 형태로 변환한다.
     *
     * @param request CactusRequest
     * @param action  URL에서 추출한 액션
     * @return OASIS ServiceContext 입력 Map
     */
    public Map<String, TypedObject> convert(CactusRequest request, String action) {
        Map<String, TypedObject> map = new HashMap<>();

        // action (BPMN 게이트웨이 분기용)
        map.put("action", new TypedObject(action));

        // meta는 inputs Map에 넣지 않는다.
        // 이유: meta.userId/menuId 키가 DTO 필드(예: SecUserSearchRequest.userId)와 충돌하여
        //      클라이언트가 보낸 검색 파라미터를 덮어쓰는 문제가 있음.
        // meta는 OasisServiceExecutor에서 txId 생성/감사 컬럼 주입 용도로만 사용한다.
        // BPMN 내부에서 meta가 필요하면 별도 메커니즘(__meta_userId 등 prefix)을 추가할 것.

        // params → flat 전개
        if (request.getParams() != null) {
            request.getParams().forEach((key, value) ->
                    map.put(key, new TypedObject(value)));
        }

        // grids → gridId: List<Map> 형태로 전달
        if (request.getGrids() != null) {
            request.getGrids().forEach((gridId, gridData) ->
                    map.put(gridId, new TypedObject(gridData.getRows(),
                            new TypeReference<List<Map<String, Object>>>() {})));
        }

        return map;
    }
}

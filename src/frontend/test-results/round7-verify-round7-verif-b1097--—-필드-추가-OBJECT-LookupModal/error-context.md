# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: round7-verify.spec.ts >> round7 verify commMenuMng — 필드 추가 + OBJECT LookupModal
- Location: e2e/round7-verify.spec.ts:59:5

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: locator.click: Test timeout of 180000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '필드 추가', exact: true }).first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]
  - alert [ref=e11]
  - generic [ref=e12]:
    - banner [ref=e13]:
      - generic [ref=e14]:
        - img "DMES Portal" [ref=e16] [cursor=pointer]
        - button "개인 정보" [ref=e18] [cursor=pointer]:
          - paragraph [ref=e23]: 관리자 님
    - main [ref=e26]:
      - generic [ref=e27]:
        - generic [ref=e29]:
          - generic "드래그하여 너비 조절" [ref=e30]
          - button "메뉴 접기" [ref=e31] [cursor=pointer]:
            - generic [ref=e32]: ◀
          - radiogroup [ref=e34]:
            - generic [ref=e36]:
              - radio "메뉴" [checked]
              - generic [ref=e37] [cursor=pointer]: 메뉴
            - generic [ref=e41]:
              - radio "즐겨찾기"
              - generic [ref=e42] [cursor=pointer]: 즐겨찾기
          - generic [ref=e47]:
            - textbox "메뉴명 검색" [ref=e50]
            - generic [ref=e51]:
              - button "전체 펼치기" [ref=e52] [cursor=pointer]:
                - generic [ref=e54]:
                  - generic [ref=e55]: ≡
                  - generic [ref=e56]: ▼
              - button "전체 접기" [ref=e57] [cursor=pointer]:
                - generic [ref=e59]:
                  - generic [ref=e60]: ≡
                  - generic [ref=e61]: ▲
          - list [ref=e65]:
            - listitem [ref=e66]:
              - generic [ref=e67] [cursor=pointer]: 공통관리
              - list [ref=e72]:
                - listitem [ref=e73]:
                  - generic [ref=e74] [cursor=pointer]: 마스터관리(원장)
                - listitem [ref=e79]:
                  - generic [ref=e80] [cursor=pointer]: 시스템관리
                  - list [ref=e85]:
                    - listitem [ref=e86]:
                      - generic [ref=e87] [cursor=pointer]: OBJECT 관리
                    - listitem [ref=e92]:
                      - generic [ref=e93] [cursor=pointer]: 메뉴 관리
                    - listitem [ref=e98]:
                      - generic [ref=e99] [cursor=pointer]: 역할 관리
                    - listitem [ref=e104]:
                      - generic [ref=e105] [cursor=pointer]: 역할 그룹 관리
                    - listitem [ref=e110]:
                      - generic [ref=e111] [cursor=pointer]: 사용자 관리
                    - listitem [ref=e116]:
                      - generic [ref=e117] [cursor=pointer]: PERMISSION 관리
                    - listitem [ref=e122]:
                      - generic [ref=e123] [cursor=pointer]: 사용자 권한 일괄 등록
                    - listitem [ref=e128]:
                      - generic [ref=e129] [cursor=pointer]: 동기화 관리
                - listitem [ref=e134]:
                  - generic [ref=e135] [cursor=pointer]: 마스터관리(가동)
                - listitem [ref=e140]:
                  - generic [ref=e141] [cursor=pointer]: 업무기준관리(원장)
            - listitem [ref=e146]:
              - generic [ref=e147] [cursor=pointer]: 로그 분석
        - generic [ref=e153]:
          - generic [ref=e155]:
            - button "홈" [ref=e156] [cursor=pointer]
            - generic [ref=e162] [cursor=pointer]:
              - generic [ref=e163]: 메뉴 관리
              - button "메뉴 관리 탭 닫기": ×
            - generic [ref=e164]:
              - button "새로고침" [ref=e165] [cursor=pointer]
              - button "화면 캡쳐 (PNG 다운로드)" [ref=e170] [cursor=pointer]
              - button "즐겨찾기 추가" [ref=e175] [cursor=pointer]
              - button "1" [ref=e180] [cursor=pointer]
              - button "헤더 접기" [ref=e183] [cursor=pointer]
          - generic [ref=e189]:
            - generic [ref=e190]:
              - heading "메뉴 관리" [level=2] [ref=e191]
              - generic [ref=e192]:
                - button "조회" [ref=e193] [cursor=pointer]
                - button "초기화" [ref=e196] [cursor=pointer]
                - button "저장" [ref=e199] [cursor=pointer]
            - search [ref=e202]:
              - generic [ref=e203]:
                - generic [ref=e204]:
                  - paragraph [ref=e205]: 메뉴 ID
                  - textbox [ref=e208]
                - generic [ref=e209]:
                  - paragraph [ref=e210]: 메뉴 명
                  - textbox [ref=e213]
                - generic [ref=e214]:
                  - paragraph [ref=e215]: 사용 유무
                  - combobox [ref=e218] [cursor=pointer]:
                    - option "전체" [selected]
                    - option "사용"
                    - option "미사용"
            - generic [ref=e219]:
              - generic [ref=e221]:
                - generic [ref=e222]:
                  - generic [ref=e223]:
                    - generic [ref=e224]: 메뉴 구조
                    - generic [ref=e225]: 8건
                  - button "필드 관리" [ref=e226] [cursor=pointer]
                - tree [ref=e228]:
                  - treeitem "공통관리" [expanded] [level=1] [ref=e229] [cursor=pointer]:
                    - group [ref=e234]:
                      - treeitem "마스터관리(원장)" [level=2] [ref=e235]
                      - treeitem "시스템관리" [level=2] [ref=e239]
                      - treeitem "마스터관리(가동)" [level=2] [ref=e243]
                      - treeitem "업무기준관리(원장)" [level=2] [ref=e247]
                      - treeitem "팝업" [level=2] [ref=e251]
                  - treeitem "로그 분석" [expanded] [level=1] [ref=e255] [cursor=pointer]:
                    - group [ref=e260]:
                      - treeitem "로그 조회" [level=2] [ref=e261]
              - generic [ref=e265]:
                - generic [ref=e266]:
                  - generic [ref=e267]:
                    - generic [ref=e268]:
                      - generic [ref=e269]: 메뉴 목록
                      - generic [ref=e270]: 21건
                    - generic [ref=e272]:
                      - button "행추가" [ref=e273] [cursor=pointer]
                      - button "행삭제" [ref=e274] [cursor=pointer]
                      - button "행복사" [ref=e275] [cursor=pointer]
                      - button "행취소" [ref=e276] [cursor=pointer]
                  - generic "데이터 목록" [ref=e278]:
                    - grid [ref=e281]:
                      - rowgroup [ref=e283]:
                        - row [ref=e284]:
                          - columnheader "메뉴순서" [ref=e285]
                          - columnheader "메뉴 ID *" [ref=e288]
                          - columnheader "메뉴명 *" [ref=e291]
                          - columnheader "OBJECT ID *" [ref=e294]
                          - columnheader "FULL SEQ" [ref=e297]
                          - columnheader "사용구분" [ref=e300]
                          - columnheader "메뉴타입" [ref=e303]
                          - columnheader "유효개시일" [ref=e306]
                          - columnheader "유효기한일" [ref=e309]
                      - rowgroup [ref=e312]:
                        - row [ref=e313]:
                          - gridcell "00000001" [ref=e314]
                          - gridcell "commMenuMng" [ref=e315]
                          - gridcell "메뉴 관리" [ref=e316]
                          - gridcell "commMenuMng" [ref=e317]
                          - gridcell "1020110" [ref=e318]
                          - gridcell "사용" [ref=e319]
                          - gridcell "WEB" [ref=e320]
                          - gridcell "2026-09-23" [ref=e321]
                          - gridcell "9999-12-31" [ref=e322]
                        - row [ref=e323]:
                          - gridcell "00000001" [ref=e324]
                          - gridcell "commObjMng" [ref=e325]
                          - gridcell "OBJECT 관리" [ref=e326]
                          - gridcell "commObjMng" [ref=e327]
                          - gridcell "1020100" [ref=e328]
                          - gridcell "사용" [ref=e329]
                          - gridcell "WEB" [ref=e330]
                          - gridcell "2026-09-23" [ref=e331]
                          - gridcell "9999-12-31" [ref=e332]
                        - row [ref=e333]:
                          - gridcell "00000001" [ref=e334]
                          - gridcell "commPermMng" [ref=e335]
                          - gridcell "PERMISSION 관리" [ref=e336]
                          - gridcell "commPermMng" [ref=e337]
                          - gridcell "1020150" [ref=e338]
                          - gridcell "사용" [ref=e339]
                          - gridcell "WEB" [ref=e340]
                          - gridcell "2026-09-23" [ref=e341]
                          - gridcell "9999-12-31" [ref=e342]
                        - row [ref=e343]:
                          - gridcell "00000001" [ref=e344]
                          - gridcell "commRoleGrpMng" [ref=e345]
                          - gridcell "역할 그룹 관리" [ref=e346]
                          - gridcell "commRoleGrpMng" [ref=e347]
                          - gridcell "1020130" [ref=e348]
                          - gridcell "사용" [ref=e349]
                          - gridcell "WEB" [ref=e350]
                          - gridcell "2026-09-23" [ref=e351]
                          - gridcell "9999-12-31" [ref=e352]
                        - row [ref=e353]:
                          - gridcell "00000001" [ref=e354]
                          - gridcell "commRoleMng" [ref=e355]
                          - gridcell "역할 관리" [ref=e356]
                          - gridcell "commRoleMng" [ref=e357]
                          - gridcell "1020120" [ref=e358]
                          - gridcell "사용" [ref=e359]
                          - gridcell "WEB" [ref=e360]
                          - gridcell "2026-09-23" [ref=e361]
                          - gridcell "9999-12-31" [ref=e362]
                        - row [ref=e363]:
                          - gridcell "00000001" [ref=e364]
                          - gridcell "commSyncMng" [ref=e365]
                          - gridcell "동기화 관리" [ref=e366]
                          - gridcell "commSyncMng" [ref=e367]
                          - gridcell "1020170" [ref=e368]
                          - gridcell "사용" [ref=e369]
                          - gridcell "WEB" [ref=e370]
                          - gridcell "2026-09-23" [ref=e371]
                          - gridcell "9999-12-31" [ref=e372]
                        - row [ref=e373]:
                          - gridcell "00000001" [ref=e374]
                          - gridcell "commUserMng" [ref=e375]
                          - gridcell "사용자 관리" [ref=e376]
                          - gridcell "commUserMng" [ref=e377]
                          - gridcell "1020140" [ref=e378]
                          - gridcell "사용" [ref=e379]
                          - gridcell "WEB" [ref=e380]
                          - gridcell "2026-09-23" [ref=e381]
                          - gridcell "9999-12-31" [ref=e382]
                        - row [ref=e383]:
                          - gridcell "00000001" [ref=e384]
                          - gridcell "commUserRoleCopy" [ref=e385]
                          - gridcell "사용자 권한 일괄 등록" [ref=e386]
                          - gridcell "commUserRoleCopy" [ref=e387]
                          - gridcell "1020160" [ref=e388]
                          - gridcell "사용" [ref=e389]
                          - gridcell "WEB" [ref=e390]
                          - gridcell "2026-09-23" [ref=e391]
                          - gridcell "9999-12-31" [ref=e392]
                        - row [ref=e393]:
                          - gridcell "00000001" [ref=e394]
                          - gridcell "logViewer" [ref=e395]
                          - gridcell "로그 뷰어" [ref=e396]
                          - gridcell "logViewer" [ref=e397]
                          - gridcell "2010100" [ref=e398]
                          - gridcell "사용" [ref=e399]
                          - gridcell "WEB" [ref=e400]
                          - gridcell "2026-09-23" [ref=e401]
                          - gridcell "9999-12-31" [ref=e402]
                        - row [ref=e403]:
                          - gridcell "00000001" [ref=e404]
                          - gridcell "masterCategoryMng" [ref=e405]
                          - gridcell "카테고리 관리" [ref=e406]
                          - gridcell "masterCategoryMng" [ref=e407]
                          - gridcell "1010100" [ref=e408]
                          - gridcell "사용" [ref=e409]
                          - gridcell "WEB" [ref=e410]
                          - gridcell "2026-09-23" [ref=e411]
                          - gridcell "9999-12-31" [ref=e412]
                        - row [ref=e413]:
                          - gridcell "00000001" [ref=e414]
                          - gridcell "masterCodeMng" [ref=e415]
                          - gridcell "Master Code 관리" [ref=e416]
                          - gridcell "masterCodeMng" [ref=e417]
                          - gridcell "1010110" [ref=e418]
                          - gridcell "사용" [ref=e419]
                          - gridcell "WEB" [ref=e420]
                          - gridcell "2026-09-23" [ref=e421]
                          - gridcell "9999-12-31" [ref=e422]
                        - row [ref=e423]:
                          - gridcell "00000001" [ref=e424]
                          - gridcell "masterCodeMngList" [ref=e425]
                          - gridcell "Master Code 상세조회" [ref=e426]
                          - gridcell "masterCodeMngList" [ref=e427]
                          - gridcell "1030100" [ref=e428]
                          - gridcell "사용" [ref=e429]
                          - gridcell "WEB" [ref=e430]
                          - gridcell "2026-09-23" [ref=e431]
                          - gridcell "9999-12-31" [ref=e432]
                        - row [ref=e433]:
                          - gridcell "00000001" [ref=e434]
                          - gridcell "masterCodeSelPop" [ref=e435]
                          - gridcell "마스터코드 선택 팝업" [ref=e436]
                          - gridcell "masterCodeSelPop" [ref=e437]
                          - gridcell "1050100" [ref=e438]
                          - gridcell "사용" [ref=e439]
                          - gridcell "WEB" [ref=e440]
                          - gridcell "2026-09-23" [ref=e441]
                          - gridcell "9999-12-31" [ref=e442]
                        - row [ref=e443]:
                          - gridcell "00000001" [ref=e444]
                          - gridcell "masterCodeUploadFilePopup" [ref=e445]
                          - gridcell "마스터코드 등록(Excel Upload)" [ref=e446]
                          - gridcell "masterCodeUploadFilePopup" [ref=e447]
                          - gridcell "1050110" [ref=e448]
                          - gridcell "사용" [ref=e449]
                          - gridcell "WEB" [ref=e450]
                          - gridcell "2026-09-23" [ref=e451]
                          - gridcell "9999-12-31" [ref=e452]
                        - row [ref=e453]:
                          - gridcell "00000001" [ref=e454]
                          - gridcell "masterRuleData" [ref=e455]
                          - gridcell "업무기준 Data관리" [ref=e456]
                          - gridcell "masterRuleData" [ref=e457]
                          - gridcell "1040110" [ref=e458]
                          - gridcell "사용" [ref=e459]
                          - gridcell "WEB" [ref=e460]
                          - gridcell "2026-09-23" [ref=e461]
                          - gridcell "9999-12-31" [ref=e462]
                        - row [ref=e463]:
                          - gridcell "00000001" [ref=e464]
                          - gridcell "masterRuleDataList" [ref=e465]
                          - gridcell "업무기준 상세조회" [ref=e466]
                          - gridcell "masterRuleDataList" [ref=e467]
                          - gridcell "1040120" [ref=e468]
                          - gridcell "사용" [ref=e469]
                          - gridcell "WEB" [ref=e470]
                          - gridcell "2026-09-23" [ref=e471]
                          - gridcell "9999-12-31" [ref=e472]
                        - row [ref=e473]:
                          - gridcell "00000001" [ref=e474]
                          - gridcell "masterRuleDataUploadFilePopup" [ref=e475]
                          - gridcell "일반 업무기준 등록(Excel Upload)" [ref=e476]
                          - gridcell "masterRuleDataUploadFilePopup" [ref=e477]
                          - gridcell "1050140" [ref=e478]
                          - gridcell "사용" [ref=e479]
                          - gridcell "WEB" [ref=e480]
                          - gridcell "2026-09-23" [ref=e481]
                          - gridcell "9999-12-31" [ref=e482]
                        - row [ref=e483]:
                          - gridcell "00000001" [ref=e484]
                          - gridcell "masterRuleFrame" [ref=e485]
                          - gridcell "업무기준 구조관리" [ref=e486]
                          - gridcell "masterRuleFrame" [ref=e487]
                          - gridcell "1040130" [ref=e488]
                          - gridcell "사용" [ref=e489]
                          - gridcell "WEB" [ref=e490]
                          - gridcell "2026-09-23" [ref=e491]
                          - gridcell "9999-12-31" [ref=e492]
                        - row [ref=e493]:
                          - gridcell "00000001" [ref=e494]
                          - gridcell "masterRuleFrameColListPopup" [ref=e495]
                          - gridcell "업무기준 컬럼 리스트 등록 팝업" [ref=e496]
                          - gridcell "masterRuleFrameColListPopup" [ref=e497]
                          - gridcell "1050130" [ref=e498]
                          - gridcell "사용" [ref=e499]
                          - gridcell "WEB" [ref=e500]
                          - gridcell "2026-09-23" [ref=e501]
                          - gridcell "9999-12-31" [ref=e502]
                        - row [ref=e503]:
                          - gridcell "00000001" [ref=e504]
                          - gridcell "masterRuleList" [ref=e505]
                          - gridcell "업무기준 목록조회" [ref=e506]
                          - gridcell "masterRuleList" [ref=e507]
                          - gridcell "1040100" [ref=e508]
                          - gridcell "사용" [ref=e509]
                          - gridcell "WEB" [ref=e510]
                          - gridcell "2026-09-23" [ref=e511]
                          - gridcell "9999-12-31" [ref=e512]
                        - row [ref=e513]:
                          - gridcell "00000001" [ref=e514]
                          - gridcell "masterRuleListPop" [ref=e515]
                          - gridcell "업무기준 List조회 팝업" [ref=e516]
                          - gridcell "masterRuleListPop" [ref=e517]
                          - gridcell "1050120" [ref=e518]
                          - gridcell "사용" [ref=e519]
                          - gridcell "WEB" [ref=e520]
                          - gridcell "2026-09-23" [ref=e521]
                          - gridcell "9999-12-31" [ref=e522]
                      - rowgroup
                      - rowgroup [ref=e523]
                      - rowgroup
                - generic:
                  - generic:
                    - generic [ref=e525]:
                      - generic [ref=e526]: OBJECT 정보
                      - generic [ref=e527]: 1건
                    - generic:
                      - generic "데이터 목록":
                        - generic:
                          - grid:
                            - rowgroup [ref=e530]:
                              - row [ref=e531]:
                                - columnheader "FORM URL" [ref=e532]
                                - columnheader "SERVICE" [ref=e535]
                                - columnheader "PARAM" [ref=e538]
                                - columnheader "사용 유무" [ref=e541]
                                - columnheader "유효 개시일" [ref=e544]
                                - columnheader "유효 기한일" [ref=e547]
                                - columnheader "SYSTEM" [ref=e550]
                                - columnheader "OBJECT TYPE" [ref=e553]
                            - rowgroup [ref=e556]:
                              - row [ref=e557]:
                                - gridcell [ref=e558]
                                - gridcell [ref=e559]
                                - gridcell [ref=e560]
                                - gridcell "사용" [ref=e561]
                                - gridcell "2026-09-23" [ref=e562]
                                - gridcell "9999-12-31" [ref=e563]
                                - gridcell "mcm" [ref=e564]
                                - gridcell "web" [ref=e565]
                            - rowgroup
                            - rowgroup [ref=e566]
                            - rowgroup
              - generic [ref=e568]:
                - generic [ref=e569]: 상세 정보
                - table [ref=e571]:
                  - rowgroup [ref=e572]:
                    - row [ref=e573]:
                      - rowheader "메뉴 ID *" [ref=e574]
                      - cell [ref=e575]:
                        - textbox [ref=e578]: commMenuMng
                    - row [ref=e579]:
                      - rowheader "메뉴 순서 *" [ref=e580]
                      - cell [ref=e581]:
                        - textbox "숫자만 입력 (저장 시 8자리 0 채움)" [ref=e584]: "00000001"
                    - row [ref=e585]:
                      - rowheader "메뉴명 *" [ref=e586]
                      - cell [ref=e587]:
                        - textbox [ref=e590]: 메뉴 관리
                    - row [ref=e591]:
                      - rowheader "OBJECT ID *" [ref=e592]
                      - cell [ref=e593]:
                        - generic [ref=e594]:
                          - textbox [ref=e598]: commMenuMng
                          - button "검색" [ref=e599] [cursor=pointer]
                    - row [ref=e600]:
                      - rowheader "상위 폴더 *" [ref=e601]
                      - cell [ref=e602]:
                        - combobox [ref=e605] [cursor=pointer]:
                          - option "(선택)"
                          - option "로그 분석 (analog)"
                          - option "로그 조회 (anl)"
                          - option "마스터관리(원장) (cma)"
                          - option "업무기준관리(원장) (cmb)"
                          - option "마스터관리(가동) (cme)"
                          - option "팝업 (cmz)"
                          - option "시스템관리 (csa)" [selected]
                          - option "공통관리 (mcm)"
                    - row [ref=e606]:
                      - rowheader "FULL SEQ" [ref=e607]
                      - cell [ref=e608]:
                        - textbox "저장 시 자동 부여" [ref=e611]: "1020110"
                    - row [ref=e612]:
                      - rowheader "사용 구분" [ref=e613]
                      - cell [ref=e614]:
                        - radiogroup "USE_TP" [ref=e616]:
                          - generic [ref=e617]:
                            - generic [ref=e619]:
                              - radio "사용" [checked] [ref=e621]
                              - generic [ref=e622]: 사용
                            - generic [ref=e625]:
                              - radio "미사용" [ref=e627]
                              - generic [ref=e628]: 미사용
                    - row [ref=e630]:
                      - rowheader "메뉴 타입" [ref=e631]
                      - cell [ref=e632]:
                        - combobox [ref=e635] [cursor=pointer]:
                          - option "(선택)"
                          - option "WEB" [selected]
                          - option "MOBIL"
                    - row [ref=e636]:
                      - rowheader "유효개시일" [ref=e637]
                      - cell [ref=e638]:
                        - generic [ref=e640]:
                          - textbox "YYYY-MM-DD" [ref=e641]: 2026-09-23
                          - button [ref=e643] [cursor=pointer]
                    - row [ref=e646]:
                      - rowheader "유효기한일" [ref=e647]
                      - cell [ref=e648]:
                        - generic [ref=e650]:
                          - textbox "YYYY-MM-DD" [ref=e651]: 9999-12-31
                          - button [ref=e653] [cursor=pointer]
                    - row [ref=e656]:
                      - rowheader "표시 여부" [ref=e657]
                      - cell [ref=e658]:
                        - radiogroup "MENU_VIEW_YN" [ref=e660]:
                          - generic [ref=e661]:
                            - generic [ref=e663]:
                              - radio "표시" [checked] [ref=e665]
                              - generic [ref=e666]: 표시
                            - generic [ref=e669]:
                              - radio "미표시" [ref=e671]
                              - generic [ref=e672]: 미표시
                    - row [ref=e674]:
                      - rowheader "메뉴 설명" [ref=e675]
                      - cell [ref=e676]:
                        - textbox [ref=e679]
                    - row [ref=e680]:
                      - rowheader "PARAM1" [ref=e681]
                      - cell [ref=e682]:
                        - textbox [ref=e685]
                    - row [ref=e686]:
                      - rowheader "PARAM2" [ref=e687]
                      - cell [ref=e688]:
                        - textbox [ref=e691]
                    - row [ref=e692]:
                      - rowheader "PARAM3" [ref=e693]
                      - cell [ref=e694]:
                        - textbox [ref=e697]
            - generic [ref=e698]:
              - generic [ref=e699]: 공통관리 > 시스템관리 > 메뉴 관리
              - generic [ref=e700]: mcm:csa/commMenuMng
```

# Test source

```ts
  1   | import { test } from "@playwright/test";
  2   | 
  3   | const BASE = "http://localhost:5100";
  4   | 
  5   | const SCREENS = [
  6   |   { id: "commObjMng",       label: "OBJECT 관리",         group: "시스템관리" },
  7   |   { id: "commMenuMng",      label: "메뉴 관리",            group: "시스템관리" },
  8   |   { id: "commRoleMng",      label: "역할 관리",            group: "시스템관리" },
  9   |   { id: "commRoleGrpMng",   label: "역할 그룹 관리",        group: "시스템관리" },
  10  |   { id: "commUserMng",      label: "사용자 관리",          group: "시스템관리" },
  11  |   { id: "commPermMng",      label: "PERMISSION 관리",     group: "시스템관리" },
  12  |   { id: "commUserRoleCopy", label: "사용자 권한 일괄 등록", group: "시스템관리" },
  13  |   { id: "commSyncMng",      label: "동기화 관리",          group: "시스템관리" },
  14  | ];
  15  | 
  16  | test.describe.configure({ mode: "serial" });
  17  | 
  18  | for (const s of SCREENS) {
  19  |   test(`round7 verify ${s.id} — 닫기 버튼 제거`, async ({ page, context }) => {
  20  |     test.setTimeout(180_000);
  21  |     page.setViewportSize({ width: 1600, height: 900 });
  22  | 
  23  |     const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  24  |     const { csrfToken } = await csrfResp.json();
  25  |     await context.request.post(`${BASE}/api/auth/callback/credentials`, {
  26  |       headers: { "Content-Type": "application/x-www-form-urlencoded" },
  27  |       data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  28  |     });
  29  |     await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  30  |     await page.waitForTimeout(3_000);
  31  | 
  32  |     for (let i = 0; i < 3; i++) {
  33  |       try {
  34  |         const b = page.getByRole("button", { name: "확인", exact: true }).first();
  35  |         if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
  36  |       } catch {}
  37  |     }
  38  | 
  39  |     for (const g of ["공통관리", "시스템관리"]) {
  40  |       try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  41  |     }
  42  |     await page.locator(`.tree-item:has-text("${s.label}")`).first().click();
  43  |     await page.waitForTimeout(5_000);
  44  |     try {
  45  |       const b = page.getByRole("button", { name: "확인", exact: true }).first();
  46  |       if (await b.isVisible({ timeout: 600 })) { await b.click(); await page.waitForTimeout(300); }
  47  |     } catch {}
  48  | 
  49  |     const buttons = await page.locator('.page-button, button[class*="page-button"]').evaluateAll(els =>
  50  |       Array.from(new Set(els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 20)))
  51  |     ).catch(() => []);
  52  |     const hasCloseBtn = buttons.some(b => b === "닫기");
  53  |     console.log(`[${s.id}] btns=${JSON.stringify(buttons.slice(0, 10))} hasCloseBtn=${hasCloseBtn}`);
  54  | 
  55  |     await page.screenshot({ path: `snap/round7_${s.id}.png`, fullPage: false });
  56  |   });
  57  | }
  58  | 
  59  | test(`round7 verify commMenuMng — 필드 추가 + OBJECT LookupModal`, async ({ page, context }) => {
  60  |   test.setTimeout(180_000);
  61  |   page.setViewportSize({ width: 1600, height: 900 });
  62  | 
  63  |   const csrfResp = await context.request.get(`${BASE}/api/auth/csrf`);
  64  |   const { csrfToken } = await csrfResp.json();
  65  |   await context.request.post(`${BASE}/api/auth/callback/credentials`, {
  66  |     headers: { "Content-Type": "application/x-www-form-urlencoded" },
  67  |     data: `csrfToken=${csrfToken}&userId=admin&password=admin123&callbackUrl=${encodeURIComponent(BASE + "/portal")}&json=true`,
  68  |   });
  69  |   await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
  70  |   await page.waitForTimeout(3_000);
  71  |   for (let i = 0; i < 3; i++) {
  72  |     try {
  73  |       const b = page.getByRole("button", { name: "확인", exact: true }).first();
  74  |       if (await b.isVisible({ timeout: 500 })) { await b.click(); await page.waitForTimeout(300); }
  75  |     } catch {}
  76  |   }
  77  |   for (const g of ["공통관리", "시스템관리"]) {
  78  |     try { await page.locator(`.tree-item:has-text("${g}")`).first().click(); await page.waitForTimeout(400); } catch {}
  79  |   }
  80  |   await page.locator(`.tree-item:has-text("메뉴 관리")`).first().click();
  81  |   await page.waitForTimeout(5_000);
  82  | 
  83  |   // 잔존 메시지 modal overlay 닫기 (확인 버튼 / ESC)
  84  |   for (let i = 0; i < 5; i++) {
  85  |     const overlay = await page.locator('.cm-message-modal-overlay').count();
  86  |     if (overlay === 0) break;
  87  |     try {
  88  |       const okBtn = page.locator('.cm-message-modal-overlay').getByRole("button", { name: /확인|닫기|취소/ }).first();
  89  |       if (await okBtn.isVisible({ timeout: 400 })) { await okBtn.click(); await page.waitForTimeout(300); continue; }
  90  |     } catch {}
  91  |     await page.keyboard.press("Escape");
  92  |     await page.waitForTimeout(300);
  93  |   }
  94  | 
  95  |   // 1. 필드 추가 버튼 click → 팝업 노출 확인
> 96  |   await page.getByRole("button", { name: "필드 추가", exact: true }).first().click();
      |                                                                          ^ Error: locator.click: Test timeout of 180000ms exceeded.
  97  |   await page.waitForTimeout(800);
  98  |   const fldModal = await page.locator('text=메뉴 필드 추가').count();
  99  |   console.log(`[commMenuMng] 필드추가 modal visible count=${fldModal}`);
  100 |   await page.screenshot({ path: `snap/round7_commMenuMng_fld_modal.png`, fullPage: false });
  101 |   // 취소 닫기
  102 |   await page.getByRole("button", { name: "취소", exact: true }).first().click();
  103 |   await page.waitForTimeout(500);
  104 | 
  105 |   // 2. 메뉴 트리 정렬 검증 — 트리 텍스트 1 행 단위로 추출
  106 |   const treeLabels = await page.locator(".tree-item").evaluateAll(els =>
  107 |     els.map(e => (e.textContent ?? "").trim()).filter(t => t.length > 0 && t.length < 40)
  108 |   ).catch(() => []);
  109 |   console.log(`[commMenuMng] treeLabels=${JSON.stringify(treeLabels.slice(0, 12))}`);
  110 | 
  111 |   // 3. OBJECT 검색 LookupModal 호출 — Detail 행 선택 후 OBJECT 검색 버튼 click
  112 |   try {
  113 |     await page.locator(".ag-row").first().click();
  114 |     await page.waitForTimeout(500);
  115 |     await page.getByRole("button", { name: "검색", exact: true }).first().click();
  116 |     await page.waitForTimeout(800);
  117 |     const objLovTitle = await page.locator('text=OBJECT 검색').count();
  118 |     console.log(`[commMenuMng] OBJECT LookupModal title count=${objLovTitle}`);
  119 |     await page.screenshot({ path: `snap/round7_commMenuMng_obj_lov.png`, fullPage: false });
  120 |   } catch (e) {
  121 |     console.log(`[commMenuMng] OBJECT LoV check skipped: ${e}`);
  122 |   }
  123 | });
  124 | 
```
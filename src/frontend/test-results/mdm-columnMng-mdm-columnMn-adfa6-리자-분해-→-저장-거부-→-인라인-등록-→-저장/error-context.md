# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mdm-columnMng.spec.ts >> mdm columnMng — 컬럼 사전 >> E2~E4 표준 관리자: 분해 → *** 저장 거부 → 인라인 등록 → 저장
- Location: e2e/mdm-columnMng.spec.ts:114:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('token-placeholder-4')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('token-placeholder-4')

```

```yaml
- alert
- banner:
  - img "DMES Portal"
  - button "개인 정보":
    - img
    - paragraph: E2E MDM 표준관리자 님
    - img
- main:
  - button "메뉴 접기": ◀
  - radiogroup:
    - radio "메뉴" [checked]
    - img
    - text: 메뉴
    - radio "즐겨찾기"
    - img
    - text: 즐겨찾기
    - radio "기본 화면"
    - img
    - text: 기본 화면
  - textbox "메뉴명 검색"
  - button "전체 펼치기": ≡ ▼
  - button "전체 접기": ≡ ▲
  - list:
    - listitem:
      - img
      - text: 마루 MDM
      - list:
        - listitem:
          - img
          - text: 용어·도메인
          - list:
            - listitem:
              - img
              - text: MDM 샘플
            - listitem:
              - img
              - text: 도메인 관리
            - listitem:
              - img
              - text: 단위 마스터
            - listitem:
              - img
              - text: 용어 관리
            - listitem:
              - img
              - text: 컬럼 사전
        - listitem:
          - img
          - text: 레이아웃
        - listitem:
          - img
          - text: 마스터코드
        - listitem:
          - img
          - text: 마스터데이터
        - listitem:
          - img
          - text: 업무기준
  - button "홈":
    - img
  - text: 컬럼 사전
  - button "컬럼 사전 탭 닫기": ×
  - button "새로고침":
    - img
  - button "화면 캡쳐 (PNG 다운로드)":
    - img
  - button "즐겨찾기 추가":
    - img
  - button "탭 목록":
    - img
    - text: "1"
  - button "전체 화면으로 보기":
    - img
  - button "헤더 접기":
    - img
  - heading "컬럼 사전" [level=2]
  - button "조회"
  - button "신규"
  - button "저장"
  - search:
    - paragraph: 검색어
    - textbox "논리명·표준 물리명·시스템별 실제 필드명"
    - paragraph: 도메인
    - combobox:
      - option "전체" [selected]
      - option "186 IP (IP)"
      - option "225 RPM (RPM)"
      - option "260 kg 시간당생산량 (KG_TPH)"
      - option "223 pH (PH)"
      - option "259 pH 소수 (PH_DEC)"
      - option "218 가격 (PRICE)"
      - option "240 각도 (ANG)"
      - option "190 값 (V)"
      - option "230 강도 (STRG)"
      - option "42 강종 규격 코드 (STEEL_STD_CD)"
      - option "231 경도 (HRDN)"
      - option "185 경로 (PATH)"
      - option "65 계수 도메인 (FCT)"
      - option "83 고객코드 (CUST_CD)"
      - option "212 고형분 (NV)"
      - option "162 공장 코드 (FAC_CD)"
      - option "176 공정 순번 (PROC_SEQ)"
      - option "40 공정 코드 (PROC_CD)"
      - option "262 공정 코드 (2) (PROC_CD_2)"
      - option "235 광택 (LUS)"
      - option "157 구분 (TP)"
      - option "217 금액 (AMNT)"
      - option "250 긴 내용 (LONG_CTT)"
      - option "257 긴 명 (LONG_NM)"
      - option "255 긴 코드 (LONG_CD)"
      - option "200 길이 (LTH)"
      - option "62 길이(m) (LEN_M)"
      - option "61 길이(mm) (LEN_MM)"
      - option "180 내용 (CTT)"
      - option "154 년도 (YR)"
      - option "153 년월 (YM)"
      - option "222 농도 (CCT)"
      - option "159 단위 (UNIT)"
      - option "236 도금량 (GW)"
      - option "202 두께 (THK)"
      - option "203 두께 공차 (THK_TLN)"
      - option "194 라우팅 (RTG)"
      - option "104 라인스피드 (LINE_SPD)"
      - option "208 롤 직경 (ROLL_DIA)"
      - option "191 메시지 (MSG)"
      - option "239 면적 (AREA)"
      - option "247 면적 소수 (AREA_DEC)"
      - option "181 명 (NM)"
      - option "96 문자 10자리 (CHAR10)"
      - option "97 문자 12자리 (CHAR12)"
      - option "98 문자 14자리 (CHAR14)"
      - option "90 문자 1자리 (CHAR1)"
      - option "99 문자 20자리 (CHAR20)"
      - option "91 문자 2자리 (CHAR2)"
      - option "92 문자 3자리 (CHAR3)"
      - option "93 문자 4자리 (CHAR4)"
      - option "94 문자 6자리 (CHAR6)"
      - option "95 문자 8자리 (CHAR8)"
      - option "170 번호 (NO)"
      - option "161 부적합 코드 (DEF_CD)"
      - option "229 부하 (LOAD)"
      - option "182 비고 (RMK)"
      - option "189 비밀번호 (PASSWORD)"
      - option "209 비율 (RT)"
      - option "66 비율(%) (PCT)"
      - option "237 비중 (GRA)"
      - option "63 비중(g/cm³) (SG)"
      - option "172 사업자등록번호 (ERN)"
      - option "103 사용 여부 (USE_YN)"
      - option "169 사원 아이디 (EMP_ID)"
      - option "234 색상 차 (CLR_DIF)"
      - option "163 색상 코드 (CLR_CD)"
      - option "183 설명 (DESC)"
      - option "213 성분 (ING)"
      - option "269 소수 버전 (DEC_VER)"
      - option "224 속도 (SPD)"
      - option "253 속도 소수 (SPD_DEC)"
      - option "69 속도(m/min) (SPEED_MPM)"
      - option "196 수 (CNT)"
      - option "68 수량 (QTY)"
      - option "264 수량 (13,3) (QTY_13)"
      - option "211 수율 (YLD)"
      - option "219 수치 (NUM)"
      - option "268 수치 여부 (NUM_YN)"
      - option "175 순번 (SEQ)"
      - option "177 순위 (RNK)"
      - option "100 숫자 4자리 (NUM4)"
      - option "101 숫자 5자리 (NUM5)"
      - option "102 숫자 6자리 (NUM6)"
      - option "245 숫자 아이디 (NUM_ID)"
      - option "258 숫자 코드 (NUM_CD)"
      - option "246 시 단위 시간 (HR_TIM)"
      - option "155 시각 (TIME)"
      - option "215 시간 (TIM)"
      - option "67 시간(h) (HOUR)"
      - option "226 시간당생산량 (TPH)"
      - option "197 시트 수 (SHT_CNT)"
      - option "168 아이디 (ID)"
      - option "221 압력 (PRES)"
      - option "165 야드 주소 (YRD_ADR)"
      - option "166 야드 행 (YRD_ROW)"
      - option "50 여부 (YN)"
      - option "167 연산자 (OPR)"
      - option "210 연신율 (ELGN)"
      - option "164 연필 경도 (PNCL_HRDN)"
      - option "193 예비 항목 (SPR_ITEM)"
      - option "214 온도 (TEM)"
      - option "70 온도(℃) (TEMP_C)"
      - option "179 외부 확정 키 (EXT_CFM_KEY)"
      - option "243 원단위 (UCNS)"
      - option "11 원재료 코일 두께 (RMTL_COIL_THK)"
      - option "81 이름 100자 (NAME100)"
      - option "80 이름 20자 (NAME20)"
      - option "187 이메일 (EMAIL)"
      - option "216 일 수 (DAY_CNT)"
      - option "150 일시 (DH)"
      - option "151 일시 문자 (DH_CHAR)"
      - option "249 일시 문자열 (DH_STR)"
      - option "30 일자 (DT)"
      - option "158 자재 코드 (MTL_CD)"
      - option "82 자재코드 (MAT_CD)"
      - option "227 장력 (TNS)"
      - option "232 재질 수치 (MQL_NUM)"
      - option "242 전도도 (CDTY)"
      - option "252 전력 (PWR)"
      - option "241 전류 (CRNT)"
      - option "248 전압 (VLTG)"
      - option "188 전화 번호 (TEL_NO)"
      - option "238 점도 (VISCO)"
      - option "261 점도 소수 (VISCO_DEC)"
      - option "254 정밀 단가 (PRCS_PRICE)"
      - option "53 제품 형태 코드 (PROD_TYPE_CD)"
      - option "233 조도 (ROU)"
      - option "174 주문 행번 (ORD_LN)"
      - option "184 주소 (ADR)"
      - option "251 주파수 (FREQ)"
      - option "12 중량 (WGT)"
      - option "265 중량 (15 kg) (WGT_15)"
      - option "52 중량 산출 기준 코드 (CALC_BASIS_CD)"
      - option "64 중량(kg) (WGT_KG)"
      - option "171 차량 번호 (CAR_NO)"
      - option "198 차수 (DEG)"
      - option "220 측정 값 (MSR_V)"
      - option "207 치수 (DMS)"
      - option "156 코드 (CD)"
      - option "14 코일 GROSS 중량 (COIL_GRS_WGT)"
      - option "201 코일 길이 (COIL_LTH)"
      - option "10 코일 두께 (COIL_THK)"
      - option "20 코일 식별자 (COIL_ID)"
      - option "263 코일 아이디 (7) (COIL_ID_7)"
      - option "13 코일 중량 (COIL_WGT)"
      - option "266 코일 중량 (5 kg) (COIL_WGT_5)"
      - option "178 키 (KEY)"
      - option "152 타임스탬프 (TMSTMP)"
      - option "199 톤 중량 (TON_WGT)"
      - option "160 통화 (CRCY)"
      - option "192 파라미터 (PARAMETER)"
      - option "51 판정등급 도메인 (QLTY_GRD_CD)"
      - option "205 폭 (WTH)"
      - option "206 폭 공차 (WTH_TLN)"
      - option "60 폭(mm) (WID_MM)"
      - option "41 표면등급 코드 (SURF_GRD_CD)"
      - option "204 필름 두께 (FLM_THK)"
      - option "256 필름 두께 소수 (FLM_THK_DEC)"
      - option "173 행번 (LN)"
      - option "195 확정자 정보 (CONFIRMER_INF)"
      - option "267 환산 계수 (EXC_COEFF)"
      - option "244 환율 (ER)"
      - option "228 힘 (FRC)"
    - img
  - text: 컬럼 목록 0건
  - grid:
    - rowgroup:
      - row "논리명 표준 물리명 표시명(긴/중간/짧은) 도메인 필수 구성 용어 시스템 필드":
        - columnheader "논리명"
        - columnheader "표준 물리명"
        - columnheader "표시명(긴/중간/짧은)"
        - columnheader "도메인"
        - columnheader "필수"
        - columnheader "구성 용어"
        - columnheader "시스템 필드"
    - rowgroup
    - rowgroup
    - rowgroup
    - rowgroup
    - text: 조회된 컬럼이 없습니다.
  - paragraph: 아래 자동 생성으로 첫 컬럼을 만드세요.
  - separator "드래그하여 크기 조절 · 더블클릭하면 기본 크기"
  - paragraph: 컬럼명 자동 생성
  - combobox:
    - option "한국어 → 물리명" [selected]
    - option "물리명 → 논리명"
  - img
  - 'textbox "예: 원재료 코일두께"': 원재료 코일두께 편차
  - button "분해"
  - grid:
    - rowgroup:
      - row "순서 토큰 매칭 약어 처리":
        - columnheader "순서"
        - columnheader "토큰"
        - columnheader "매칭"
        - columnheader "약어"
        - columnheader "처리"
    - rowgroup:
      - row "1 원재료 원재료 RMTL 등록됨":
        - gridcell "1"
        - gridcell "원재료"
        - gridcell "원재료"
        - gridcell "RMTL"
        - gridcell "등록됨"
      - row "2 코일 코일 COIL 등록됨":
        - gridcell "2"
        - gridcell "코일"
        - gridcell "코일"
        - gridcell "COIL"
        - gridcell "등록됨"
      - row "3 두께 두께 THK 등록됨":
        - gridcell "3"
        - gridcell "두께"
        - gridcell "두께"
        - gridcell "THK"
        - gridcell "등록됨"
      - row "4 편차 편차 DVI 등록됨":
        - gridcell "4"
        - gridcell "편차"
        - gridcell "편차"
        - gridcell "DVI"
        - gridcell "등록됨"
    - rowgroup
    - rowgroup
    - rowgroup
  - table:
    - rowgroup:
      - row "물리명 미리보기 RMTL_COIL_THK_DVI":
        - rowheader "물리명 미리보기"
        - cell "RMTL_COIL_THK_DVI"
      - row "추천 도메인 추천 없음":
        - rowheader "추천 도메인"
        - cell "추천 없음":
          - combobox:
            - option "추천 없음" [selected]
          - img
      - row "중복 검사 신규":
        - rowheader "중복 검사"
        - cell "신규"
  - button "상세에 적용"
  - separator "드래그하여 크기 조절 · 더블클릭하면 기본 크기"
  - paragraph: 컬럼 상세
  - table:
    - rowgroup:
      - row "논리명 *":
        - rowheader "논리명 *"
        - cell:
          - textbox
      - row "표준 물리명 *":
        - rowheader "표준 물리명 *"
        - cell:
          - textbox
      - 'row "표시명 긴/중간/짧은 표시: / /"':
        - rowheader "표시명 긴/중간/짧은"
        - 'cell "표시: / /"':
          - textbox
          - textbox
          - textbox
          - text: "표시: / /"
      - row "도메인 * 선택 필수 N":
        - rowheader "도메인 *"
        - cell "선택":
          - combobox:
            - option "선택" [selected]
            - option "186 IP (IP)"
            - option "225 RPM (RPM)"
            - option "260 kg 시간당생산량 (KG_TPH)"
            - option "223 pH (PH)"
            - option "259 pH 소수 (PH_DEC)"
            - option "218 가격 (PRICE)"
            - option "240 각도 (ANG)"
            - option "190 값 (V)"
            - option "230 강도 (STRG)"
            - option "42 강종 규격 코드 (STEEL_STD_CD)"
            - option "231 경도 (HRDN)"
            - option "185 경로 (PATH)"
            - option "65 계수 도메인 (FCT)"
            - option "83 고객코드 (CUST_CD)"
            - option "212 고형분 (NV)"
            - option "162 공장 코드 (FAC_CD)"
            - option "176 공정 순번 (PROC_SEQ)"
            - option "40 공정 코드 (PROC_CD)"
            - option "262 공정 코드 (2) (PROC_CD_2)"
            - option "235 광택 (LUS)"
            - option "157 구분 (TP)"
            - option "217 금액 (AMNT)"
            - option "250 긴 내용 (LONG_CTT)"
            - option "257 긴 명 (LONG_NM)"
            - option "255 긴 코드 (LONG_CD)"
            - option "200 길이 (LTH)"
            - option "62 길이(m) (LEN_M)"
            - option "61 길이(mm) (LEN_MM)"
            - option "180 내용 (CTT)"
            - option "154 년도 (YR)"
            - option "153 년월 (YM)"
            - option "222 농도 (CCT)"
            - option "159 단위 (UNIT)"
            - option "236 도금량 (GW)"
            - option "202 두께 (THK)"
            - option "203 두께 공차 (THK_TLN)"
            - option "194 라우팅 (RTG)"
            - option "104 라인스피드 (LINE_SPD)"
            - option "208 롤 직경 (ROLL_DIA)"
            - option "191 메시지 (MSG)"
            - option "239 면적 (AREA)"
            - option "247 면적 소수 (AREA_DEC)"
            - option "181 명 (NM)"
            - option "96 문자 10자리 (CHAR10)"
            - option "97 문자 12자리 (CHAR12)"
            - option "98 문자 14자리 (CHAR14)"
            - option "90 문자 1자리 (CHAR1)"
            - option "99 문자 20자리 (CHAR20)"
            - option "91 문자 2자리 (CHAR2)"
            - option "92 문자 3자리 (CHAR3)"
            - option "93 문자 4자리 (CHAR4)"
            - option "94 문자 6자리 (CHAR6)"
            - option "95 문자 8자리 (CHAR8)"
            - option "170 번호 (NO)"
            - option "161 부적합 코드 (DEF_CD)"
            - option "229 부하 (LOAD)"
            - option "182 비고 (RMK)"
            - option "189 비밀번호 (PASSWORD)"
            - option "209 비율 (RT)"
            - option "66 비율(%) (PCT)"
            - option "237 비중 (GRA)"
            - option "63 비중(g/cm³) (SG)"
            - option "172 사업자등록번호 (ERN)"
            - option "103 사용 여부 (USE_YN)"
            - option "169 사원 아이디 (EMP_ID)"
            - option "234 색상 차 (CLR_DIF)"
            - option "163 색상 코드 (CLR_CD)"
            - option "183 설명 (DESC)"
            - option "213 성분 (ING)"
            - option "269 소수 버전 (DEC_VER)"
            - option "224 속도 (SPD)"
            - option "253 속도 소수 (SPD_DEC)"
            - option "69 속도(m/min) (SPEED_MPM)"
            - option "196 수 (CNT)"
            - option "68 수량 (QTY)"
            - option "264 수량 (13,3) (QTY_13)"
            - option "211 수율 (YLD)"
            - option "219 수치 (NUM)"
            - option "268 수치 여부 (NUM_YN)"
            - option "175 순번 (SEQ)"
            - option "177 순위 (RNK)"
            - option "100 숫자 4자리 (NUM4)"
            - option "101 숫자 5자리 (NUM5)"
            - option "102 숫자 6자리 (NUM6)"
            - option "245 숫자 아이디 (NUM_ID)"
            - option "258 숫자 코드 (NUM_CD)"
            - option "246 시 단위 시간 (HR_TIM)"
            - option "155 시각 (TIME)"
            - option "215 시간 (TIM)"
            - option "67 시간(h) (HOUR)"
            - option "226 시간당생산량 (TPH)"
            - option "197 시트 수 (SHT_CNT)"
            - option "168 아이디 (ID)"
            - option "221 압력 (PRES)"
            - option "165 야드 주소 (YRD_ADR)"
            - option "166 야드 행 (YRD_ROW)"
            - option "50 여부 (YN)"
            - option "167 연산자 (OPR)"
            - option "210 연신율 (ELGN)"
            - option "164 연필 경도 (PNCL_HRDN)"
            - option "193 예비 항목 (SPR_ITEM)"
            - option "214 온도 (TEM)"
            - option "70 온도(℃) (TEMP_C)"
            - option "179 외부 확정 키 (EXT_CFM_KEY)"
            - option "243 원단위 (UCNS)"
            - option "11 원재료 코일 두께 (RMTL_COIL_THK)"
            - option "81 이름 100자 (NAME100)"
            - option "80 이름 20자 (NAME20)"
            - option "187 이메일 (EMAIL)"
            - option "216 일 수 (DAY_CNT)"
            - option "150 일시 (DH)"
            - option "151 일시 문자 (DH_CHAR)"
            - option "249 일시 문자열 (DH_STR)"
            - option "30 일자 (DT)"
            - option "158 자재 코드 (MTL_CD)"
            - option "82 자재코드 (MAT_CD)"
            - option "227 장력 (TNS)"
            - option "232 재질 수치 (MQL_NUM)"
            - option "242 전도도 (CDTY)"
            - option "252 전력 (PWR)"
            - option "241 전류 (CRNT)"
            - option "248 전압 (VLTG)"
            - option "188 전화 번호 (TEL_NO)"
            - option "238 점도 (VISCO)"
            - option "261 점도 소수 (VISCO_DEC)"
            - option "254 정밀 단가 (PRCS_PRICE)"
            - option "53 제품 형태 코드 (PROD_TYPE_CD)"
            - option "233 조도 (ROU)"
            - option "174 주문 행번 (ORD_LN)"
            - option "184 주소 (ADR)"
            - option "251 주파수 (FREQ)"
            - option "12 중량 (WGT)"
            - option "265 중량 (15 kg) (WGT_15)"
            - option "52 중량 산출 기준 코드 (CALC_BASIS_CD)"
            - option "64 중량(kg) (WGT_KG)"
            - option "171 차량 번호 (CAR_NO)"
            - option "198 차수 (DEG)"
            - option "220 측정 값 (MSR_V)"
            - option "207 치수 (DMS)"
            - option "156 코드 (CD)"
            - option "14 코일 GROSS 중량 (COIL_GRS_WGT)"
            - option "201 코일 길이 (COIL_LTH)"
            - option "10 코일 두께 (COIL_THK)"
            - option "20 코일 식별자 (COIL_ID)"
            - option "263 코일 아이디 (7) (COIL_ID_7)"
            - option "13 코일 중량 (COIL_WGT)"
            - option "266 코일 중량 (5 kg) (COIL_WGT_5)"
            - option "178 키 (KEY)"
            - option "152 타임스탬프 (TMSTMP)"
            - option "199 톤 중량 (TON_WGT)"
            - option "160 통화 (CRCY)"
            - option "192 파라미터 (PARAMETER)"
            - option "51 판정등급 도메인 (QLTY_GRD_CD)"
            - option "205 폭 (WTH)"
            - option "206 폭 공차 (WTH_TLN)"
            - option "60 폭(mm) (WID_MM)"
            - option "41 표면등급 코드 (SURF_GRD_CD)"
            - option "204 필름 두께 (FLM_THK)"
            - option "256 필름 두께 소수 (FLM_THK_DEC)"
            - option "173 행번 (LN)"
            - option "195 확정자 정보 (CONFIRMER_INF)"
            - option "267 환산 계수 (EXC_COEFF)"
            - option "244 환율 (ER)"
            - option "228 힘 (FRC)"
          - img
        - rowheader "필수"
        - cell "N":
          - combobox:
            - option "Y"
            - option "N" [selected]
          - img
      - row "기본값 참조 종류 없음":
        - rowheader "기본값"
        - cell:
          - textbox
        - rowheader "참조 종류"
        - cell "없음":
          - combobox:
            - option "없음" [selected]
            - option "MASTER"
          - img
      - row "참조 대상 참조 카테고리":
        - rowheader "참조 대상"
        - cell:
          - textbox
        - rowheader "참조 카테고리"
        - cell:
          - textbox
      - row "설명":
        - rowheader "설명"
        - cell:
          - textbox
      - row "활용처 메모":
        - rowheader "활용처 메모"
        - cell:
          - textbox
  - text: 시스템별 실제 필드명 0건
  - button "행추가"
  - button "행삭제" [disabled]
  - grid:
    - rowgroup:
      - row "시스템 실제 필드명 변환 규칙 note":
        - columnheader "시스템"
        - columnheader "실제 필드명"
        - columnheader "변환 규칙"
        - columnheader "note"
    - rowgroup
    - rowgroup
    - rowgroup
    - rowgroup
    - text: 시스템별 실제 필드명이 없습니다. [행추가]로 넣으세요.
  - text: 마루 MDM > 용어·도메인 > 컬럼 사전 columnMng
```

# Test source

```ts
  21  | const BASE_URL = process.env.SMOKE_MCM_BASE_URL ?? "http://127.0.0.1:5100";
  22  | const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD ?? "admin123";
  23  | const STEWARD = process.env.SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward";
  24  | const STDADMIN = process.env.SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin";
  25  | 
  26  | const BREADCRUMB = "마루 MDM > 용어·도메인 > 컬럼 사전";
  27  | const PLACEHOLDER_ERROR = "미등록 용어(***)가 남아 있어 저장할 수 없습니다";
  28  | const SYSTEM_FIELD_ERROR = "한 시스템 안에서 필드명 하나는 컬럼 하나에만 붙일 수 있습니다";
  29  | 
  30  | // __dirname = src/frontend/e2e → repo root 까지 3단계 위.
  31  | const screenshot = (name: string) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-04/screens", name);
  32  | 
  33  | async function login(page: Page, user: string) {
  34  |   await page.goto(`${BASE_URL}/login`);
  35  |   await page.getByPlaceholder("아이디").fill(user);
  36  |   await page.getByPlaceholder("비밀번호").fill(PASSWORD);
  37  |   await page.getByRole("button", { name: "로그인" }).click();
  38  |   await expect(page).toHaveURL(/\/portal/, { timeout: 30_000 });
  39  | }
  40  | 
  41  | async function openColumnMng(page: Page) {
  42  |   const item = (text: RegExp) => page.locator(".tree-item .item-name").filter({ hasText: text }).first();
  43  |   await item(/^마루 MDM$/).click({ timeout: 20_000 });
  44  |   await item(/^용어·도메인$/).click({ timeout: 20_000 });
  45  |   await item(/^컬럼 사전$/).click({ timeout: 20_000 });
  46  |   await expect(page.getByTestId("column-list")).toBeVisible({ timeout: 60_000 });
  47  | }
  48  | 
  49  | async function decompose(page: Page, input: string) {
  50  |   await page.getByTestId("gen-input").fill(input);
  51  |   await page.getByTestId("gen-decompose").click();
  52  |   await expect(page.getByTestId("token-row-1")).toBeVisible({ timeout: 20_000 });
  53  | }
  54  | 
  55  | /** 논리명 칸이 글자 그대로 같은 목록 행(부분 문자열로 다른 행이 걸리지 않게). */
  56  | function listRow(page: Page, columnName: string): Locator {
  57  |   const exact = new RegExp(`^${columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  58  |   return page
  59  |     .getByTestId("column-list")
  60  |     .locator(".ag-center-cols-container .ag-row")
  61  |     .filter({ has: page.locator('.ag-cell[col-id="columnName"]', { hasText: exact }) });
  62  | }
  63  | 
  64  | /** 시스템 그리드 n번째(0부터) 행의 셀. */
  65  | function systemCell(page: Page, rowIndex: number, colId: string): Locator {
  66  |   return page
  67  |     .getByTestId("system-grid")
  68  |     .locator(`.ag-center-cols-container .ag-row[row-index="${rowIndex}"] .ag-cell[col-id="${colId}"]`);
  69  | }
  70  | 
  71  | async function addSystemRow(page: Page, rowIndex: number, systemCode: string, fieldName?: string) {
  72  |   await page.getByTestId("system-grid").getByRole("button", { name: "행추가" }).click();
  73  |   const systemCellLocator = systemCell(page, rowIndex, "systemCode");
  74  |   await expect(systemCellLocator).toBeVisible({ timeout: 10_000 });
  75  |   await systemCellLocator.click();
  76  |   await systemCellLocator.locator("select").selectOption(systemCode);
  77  |   await expect(systemCellLocator).toHaveText(systemCode, { timeout: 5_000 });
  78  |   if (fieldName !== undefined) {
  79  |     const fieldCell = systemCell(page, rowIndex, "physName");
  80  |     await fieldCell.click();
  81  |     const editor = fieldCell.locator("input");
  82  |     await editor.fill(fieldName);
  83  |     await editor.press("Enter");
  84  |     await expect(fieldCell).toHaveText(fieldName, { timeout: 5_000 });
  85  |   }
  86  | }
  87  | 
  88  | async function errorModalText(page: Page): Promise<Locator> {
  89  |   const modal = page.locator(".error-modal__body");
  90  |   await expect(modal).toBeVisible({ timeout: 20_000 });
  91  |   return modal;
  92  | }
  93  | 
  94  | async function closeErrorModal(page: Page) {
  95  |   await page.getByRole("button", { name: "확인" }).click();
  96  |   await expect(page.locator(".error-modal__body")).toHaveCount(0);
  97  | }
  98  | 
  99  | test.describe.configure({ mode: "serial" });
  100 | 
  101 | test.describe("mdm columnMng — 컬럼 사전", () => {
  102 |   test.setTimeout(150_000);
  103 | 
  104 |   test("E1 표준 관리자: 메뉴로 화면이 열리고 빈 목록 상태가 보인다", async ({ page }) => {
  105 |     await login(page, STDADMIN);
  106 |     await openColumnMng(page);
  107 | 
  108 |     await expect(page.locator(".page-layout__footer-breadcrumb").filter({ hasText: BREADCRUMB })).toBeVisible();
  109 |     await expect(page.getByTestId("column-list-empty")).toBeVisible({ timeout: 20_000 });
  110 | 
  111 |     await page.screenshot({ path: screenshot("dma-columnMng-empty.png"), fullPage: true });
  112 |   });
  113 | 
  114 |   test("E2~E4 표준 관리자: 분해 → *** 저장 거부 → 인라인 등록 → 저장", async ({ page }) => {
  115 |     await login(page, STDADMIN);
  116 |     await openColumnMng(page);
  117 | 
  118 |     // E2 — 미등록 토큰은 *** 로 남고 저장이 막힌다.
  119 |     await decompose(page, "원재료 코일두께 편차");
  120 |     await expect(page.getByTestId("token-row-4")).toBeVisible();
> 121 |     await expect(page.getByTestId("token-placeholder-4")).toBeVisible();
      |                                                           ^ Error: expect(locator).toBeVisible() failed
  122 |     await expect(page.getByTestId("gen-preview")).toHaveText("RMTL_COIL_THK_***");
  123 |     await expect(page.getByTestId("gen-domain")).toHaveValue("");
  124 |     await page.getByTestId("gen-apply").click();
  125 |     await expect(page.getByTestId("form-phys-name")).toHaveValue("RMTL_COIL_THK_***");
  126 |     await page.getByRole("button", { name: "저장", exact: true }).click();
  127 |     await expect(await errorModalText(page)).toContainText(PLACEHOLDER_ERROR);
  128 |     await page.screenshot({ path: screenshot("dma-columnMng-generate.png"), fullPage: true });
  129 |     await closeErrorModal(page);
  130 |     await expect(page.getByTestId("column-list-empty")).toBeVisible();
  131 | 
  132 |     // E3 — *** 자리에서 팝업 → 유사어 확인 → 약어 제안 → 등록.
  133 |     await page.getByTestId("token-placeholder-4").click();
  134 |     const pop = page.getByTestId("term-pop");
  135 |     await expect(pop).toBeVisible({ timeout: 20_000 });
  136 |     await expect(pop.getByTestId("term-pop-similar")).toContainText("오차", { timeout: 20_000 });
  137 |     await expect(pop.getByTestId("term-pop-term-name")).toHaveValue("편차");
  138 |     await expect(pop.getByTestId("term-pop-sense-no")).toHaveValue("1");
  139 |     await pop.getByTestId("term-pop-eng-name").fill("Deviation");
  140 |     await pop.getByTestId("term-pop-abbr-suggest").click();
  141 |     await expect(pop.getByTestId("term-pop-abbr")).toHaveValue("DEV", { timeout: 20_000 });
  142 |     await pop.getByTestId("term-pop-definition").fill("기준값과 실제값의 차이");
  143 |     await page.screenshot({ path: screenshot("dma-termRegPop.png"), fullPage: true });
  144 |     await page.getByTestId("term-pop-reg").click();
  145 |     await expect(page.getByTestId("term-pop")).toHaveCount(0, { timeout: 20_000 });
  146 |     await expect(page.getByTestId("gen-preview")).toHaveText("RMTL_COIL_THK_DEV", { timeout: 20_000 });
  147 |     await expect(page.getByTestId("gen-domain").locator("option:checked")).toHaveText("두께 편차 (THK_DEV)");
  148 | 
  149 |     // E4 — 적용 → 짧은 표시명 비움 → 시스템 행 2개 → 저장.
  150 |     await page.getByTestId("gen-apply").click();
  151 |     await expect(page.getByTestId("form-phys-name")).toHaveValue("RMTL_COIL_THK_DEV");
  152 |     await expect(page.getByTestId("form-label-short")).toHaveValue("코일두께편차");
  153 |     await page.getByTestId("form-label-short").fill("");
  154 |     await addSystemRow(page, 0, "MES", "RMTL_COIL_THK_DEV");
  155 |     await addSystemRow(page, 1, "ERP");
  156 |     await expect(systemCell(page, 1, "physName")).toHaveText("ZZ_RMTL_COIL_THK_DEV");
  157 |     await page.getByRole("button", { name: "저장", exact: true }).click();
  158 |     await expect(page.getByText("저장했습니다")).toBeVisible({ timeout: 20_000 });
  159 |     const saved = listRow(page, "원재료 코일 두께 편차");
  160 |     await expect(saved).toHaveCount(1, { timeout: 20_000 });
  161 |     await expect(saved.locator('.ag-cell[col-id="labels"]')).toHaveText(
  162 |       "원재료 코일 두께 편차 / 원재료 코일 두께 편차 / 원재료 코일 두께 편차",
  163 |     );
  164 |     await expect(saved.locator('.ag-cell[col-id="systemFields"]')).toHaveText("ERP:ZZ_RMTL_COIL_THK_DEV, MES:RMTL_COIL_THK_DEV");
  165 |     await page.screenshot({ path: screenshot("dma-columnMng-saved.png"), fullPage: true });
  166 |   });
  167 | 
  168 |   test("E5 표준 관리자: 같은 시스템 필드명의 두 번째 등록은 서버가 거부한다", async ({ page }) => {
  169 |     await login(page, STDADMIN);
  170 |     await openColumnMng(page);
  171 |     // 화면을 열어도 목록은 자동 조회되지 않는다 — [조회] 를 눌러야 앞 시나리오가 저장한 컬럼이 보인다.
  172 |     await page.getByRole("button", { name: "조회", exact: true }).click();
  173 |     await expect(listRow(page, "원재료 코일 두께 편차")).toHaveCount(1, { timeout: 20_000 });
  174 | 
  175 |     await page.getByRole("button", { name: "신규", exact: true }).click();
  176 |     await decompose(page, "코일 두께");
  177 |     await expect(page.getByTestId("gen-preview")).toHaveText("COIL_THK");
  178 |     await page.getByTestId("gen-apply").click();
  179 |     await expect(page.getByTestId("form-domain").locator("option:checked")).toContainText("코일 두께 (COIL_THK)");
  180 |     await addSystemRow(page, 0, "ERP", "ZZ_RMTL_COIL_THK_DEV");
  181 |     await page.getByRole("button", { name: "저장", exact: true }).click();
  182 |     await expect(await errorModalText(page)).toContainText(SYSTEM_FIELD_ERROR);
  183 |     await expect(page.locator(".error-modal__body")).toContainText("ERP·ZZ_RMTL_COIL_THK_DEV");
  184 |     await page.screenshot({ path: screenshot("dma-columnMng-dup-error.png"), fullPage: true });
  185 |     await closeErrorModal(page);
  186 |     await expect(listRow(page, "코일 두께")).toHaveCount(0);
  187 | 
  188 |     // 실제 필드명 검색(대소문자 무시)으로 기존 컬럼을 찾는다.
  189 |     await page.getByTestId("column-search-keyword").fill("zz_rmtl_coil_thk_dev");
  190 |     await page.getByRole("button", { name: "조회", exact: true }).click();
  191 |     await expect(page.getByTestId("column-list").locator(".ag-center-cols-container .ag-row")).toHaveCount(1, { timeout: 20_000 });
  192 |     await expect(listRow(page, "원재료 코일 두께 편차")).toHaveCount(1);
  193 | 
  194 |     // 역분해 — 용어로 분해가 안 되는 실제 필드명은 시스템 매핑에서 찾는다.
  195 |     await page.getByTestId("gen-direction").selectOption("REVERSE");
  196 |     await decompose(page, "ZZ_RMTL_COIL_THK_DEV");
  197 |     await expect(page.getByTestId("gen-duplicates")).toContainText("SYSTEM_FIELD");
  198 |     await expect(page.getByTestId("gen-duplicates")).toContainText("ERP");
  199 |   });
  200 | 
  201 |   test("E6 담당자: 인라인 등록과 저장을 할 수 없다", async ({ page }) => {
  202 |     await login(page, STEWARD);
  203 |     await openColumnMng(page);
  204 | 
  205 |     await expect(page.getByRole("button", { name: "저장", exact: true })).toBeDisabled({ timeout: 20_000 });
  206 |     await decompose(page, "코일 너비");
  207 |     await page.getByTestId("token-placeholder-2").click();
  208 |     const pop = page.getByTestId("term-pop");
  209 |     await expect(pop).toBeVisible({ timeout: 20_000 });
  210 |     await expect(page.getByTestId("term-pop-reg")).toBeDisabled();
  211 |     await expect(pop.getByTestId("term-pop-no-permission")).toHaveText(
  212 |       "용어 등록은 표준 관리자만 할 수 있습니다. 표준 관리자에게 요청하세요",
  213 |     );
  214 |     await page.screenshot({ path: screenshot("dma-termRegPop-steward.png"), fullPage: true });
  215 | 
  216 |     const reg = await page.request.post(`${BASE_URL}/api/mdm/oasis/termRegPop/reg`, {
  217 |       data: { meta: { menuId: "termRegPop" }, params: { termName: "너비", senseNo: 1, definition: "d", engAbbr: "WID" } },
  218 |     });
  219 |     expect(reg.status()).toBe(403);
  220 |     expect((await reg.json()).error?.code).toBe("FORBIDDEN");
  221 |     const save = await page.request.post(`${BASE_URL}/api/mdm/oasis/columnMng/save`, {
```
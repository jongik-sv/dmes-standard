import { createTheme, type MantineColorsTuple } from "@mantine/core";

// C 톤(2026-09-23) 동작색 #0b62d6 / hover #0a53b5 를 index 6 / 7 에 둔다.
// variables.css 의 --color-primary 가 --mantine-color-dmes-6 을 참조한다.
const dmes: MantineColorsTuple = [
  "#e8f1fd",
  "#d3e3fa",
  "#a8c8f4",
  "#7aabee",
  "#4f90e8",
  "#2a78e0",
  "#0b62d6",
  "#0a53b5",
  "#084595",
  "#063674",
];

// variables.css 의 --color-danger #d42a2a / hover #b82222 를 index 6 / 7 에 둔다.
const danger: MantineColorsTuple = [
  "#fdeaea",
  "#f9d0d0",
  "#f2a3a3",
  "#eb7676",
  "#e45050",
  "#dd3a3a",
  "#d42a2a",
  "#b82222",
  "#951b1b",
  "#721414",
];

// 로그인 화면 전용 팔레트 — C 톤에서는 동작색(dmes)과 같은 파랑을 쓴다.
// login-form.tsx 가 하드코딩 대신 이 팔레트 이름을 참조하므로 이름은 유지한다.
const loginBrand: MantineColorsTuple = dmes;

export const dmesTheme = createTheme({
  primaryColor: "dmes",
  primaryShade: 6,
  colors: { dmes, danger, loginBrand },
  defaultRadius: "sm",
  radius: { xs: "2px", sm: "3px", md: "4px", lg: "6px", xl: "8px" },
  // variables.css 의 --font-family 와 같은 스택을 사용한다. Pretendard 는 호스트 앱이 번들한다.
  fontFamily:
    '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Roboto", sans-serif',
  fontFamilyMonospace: '"JetBrains Mono", "D2Coding", ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: { fontWeight: "700" },
  fontSizes: { xs: "11px", sm: "12px", md: "12.5px", lg: "14px", xl: "16px" },
  black: "#0f1720",
  // C 톤은 고밀도라 컨트롤 기본 크기를 xs(26px, variables.css 에서 높이 재정의)로 둔다.
  components: {
    Button: { defaultProps: { size: "xs" } },
    TextInput: { defaultProps: { size: "xs" } },
    NativeSelect: { defaultProps: { size: "xs" } },
    Select: { defaultProps: { size: "xs" } },
    MultiSelect: { defaultProps: { size: "xs" } },
    Textarea: { defaultProps: { size: "xs" } },
    Checkbox: { defaultProps: { size: "xs" } },
    Radio: { defaultProps: { size: "xs" } },
    DateInput: { defaultProps: { size: "xs" } },
    Modal: { defaultProps: { centered: true, radius: "sm" } },
    Tabs: { defaultProps: { variant: "default" } },
  },
});

import { createTheme, type MantineColorsTuple } from "@mantine/core";

// variables.css 의 --color-primary #337ab7 / hover #2a6499 를 index 6 / 7 에 둔다.
const dmes: MantineColorsTuple = [
  "#e8f1f9",
  "#d0e2f2",
  "#a9c9e6",
  "#7fafd9",
  "#5c98cd",
  "#4487c2",
  "#337ab7",
  "#2a6499",
  "#22507a",
  "#1a3d5c",
];

// variables.css 의 --color-danger #d9534f / hover #c9302c 를 index 6 / 7 에 둔다.
const danger: MantineColorsTuple = [
  "#fbeaea",
  "#f6d3d2",
  "#eeaba9",
  "#e58480",
  "#df6561",
  "#db5450",
  "#d9534f",
  "#c9302c",
  "#a82824",
  "#7f1e1b",
];

// 로그인 화면 전용 브랜드 남색 — login-form.css 의 #1b3f7d 를 index 6 에 둔다.
// login-form.tsx 가 `color="#1b3f7d"` 하드코딩 대신 이 팔레트를 참조한다.
const loginBrand: MantineColorsTuple = [
  "#e9edf4",
  "#ccd6e6",
  "#a3b4d0",
  "#7890b8",
  "#5573a3",
  "#3c5c91",
  "#1b3f7d",
  "#173568",
  "#122a53",
  "#0d1f3e",
];

export const dmesTheme = createTheme({
  primaryColor: "dmes",
  primaryShade: 6,
  colors: { dmes, danger, loginBrand },
  defaultRadius: "sm",
  // variables.css 의 --font-family 와 같은 스택을 사용한다.
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  fontSizes: { xs: "12px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
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

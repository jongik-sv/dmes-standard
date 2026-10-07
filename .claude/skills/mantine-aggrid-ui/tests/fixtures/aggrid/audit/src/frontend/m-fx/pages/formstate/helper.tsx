function helperDecl() {}
const first = 1
function Root() {}
export default function RootB() {
  const [loginForm, setLoginForm] = useState<LoginForm>({ id: "" });
  const onType = (v: string) => setLoginForm((p) => ({ ...p, id: v }));
  const render = function () { return 1; }
  const apply = () => {
    setLoginForm(
      { id: "x" }
    );
  };
  const done = 1;
  return <SelectOrInput onChange={(v) => onType(v)} />;
}

const Page = () => {
  const [pageForm, setPageForm] = useState({});
  return <Input onChange={(e) => setPageForm(e)} />;
};
export default Page;

import { DocStore } from "./core/doc-store.js";
import { createEmptyProject } from "./core/schema/project.js";
import { AppShell } from "./editor/shell/AppShell.js";

const store = new DocStore(createEmptyProject());

function App() {
  return <AppShell store={store} />;
}

export default App;

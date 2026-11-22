import { ServicesProvider } from "./application/ServicesProvider.tsx";
import { browserServices } from "./app/services.ts";
import { SessionBoundary } from "./presentation/pages/SessionBoundary.tsx";
import { PwaShell } from "./presentation/components/layout/PwaShell.tsx";

export function App() {
  return <ServicesProvider services={browserServices}>
    <PwaShell><SessionBoundary /></PwaShell>
  </ServicesProvider>;
}

export default App;

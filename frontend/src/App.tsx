import { ServicesProvider } from "./application/ServicesProvider.tsx";
import { browserServices } from "./app/services.ts";
import { SessionBoundary } from "./presentation/pages/SessionBoundary.tsx";

export function App() {
  return <ServicesProvider services={browserServices}>
    <SessionBoundary />
  </ServicesProvider>;
}

export default App;

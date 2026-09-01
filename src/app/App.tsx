import { AppShell } from "../components/layout/AppShell";
import { useTheme } from "../hooks/useTheme";

export default function App() {
  // Applies the persisted/system theme to <html class="dark"> on mount
  // and whenever it changes. See src/hooks/useTheme.ts.
  useTheme();

  return <AppShell />;
}

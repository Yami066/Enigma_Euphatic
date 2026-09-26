import { AppProvider, useApp } from "./context/AppContext";
import { AppShell } from "./components/euphatic/AppShell";
import { LandingPage } from "./pages/euphatic/LandingPage";
import { DashboardPage } from "./pages/euphatic/DashboardPage";
import { GuidedIntakePage } from "./pages/euphatic/GuidedIntakePage";
import { DocumentDiscoveryPage } from "./pages/euphatic/DocumentDiscoveryPage";
import { EmailDiscoveryPage } from "./pages/euphatic/EmailDiscoveryPage";
import { AssetRoutingPage } from "./pages/euphatic/AssetRoutingPage";
import { PaperworkPage } from "./pages/euphatic/PaperworkPage";
import { FollowupPage } from "./pages/euphatic/FollowupPage";
import { SharedAccessPage } from "./pages/euphatic/SharedAccessPage";
import { SettingsPage } from "./pages/euphatic/SettingsPage";

function MainContent() {
  const { currentView } = useApp();

  if (currentView === "landing") {
    return <LandingPage />;
  }

  return (
    <AppShell>
      {currentView === "dashboard" && <DashboardPage />}
      {currentView === "intake" && <GuidedIntakePage />}
      {currentView === "docDiscovery" && <DocumentDiscoveryPage />}
      {currentView === "emailDiscovery" && <EmailDiscoveryPage />}
      {currentView === "routing" && <AssetRoutingPage />}
      {currentView === "paperwork" && <PaperworkPage />}
      {currentView === "followup" && <FollowupPage />}
      {currentView === "sharedAccess" && <SharedAccessPage />}
      {currentView === "settings" && <SettingsPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}

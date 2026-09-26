import { AppProvider, useApp } from "./context/AppContext";
import { AppShell } from "./components/afterloss/AppShell";
import { LandingPage } from "./pages/afterloss/LandingPage";
import { DashboardPage } from "./pages/afterloss/DashboardPage";
import { GuidedIntakePage } from "./pages/afterloss/GuidedIntakePage";
import { DocumentDiscoveryPage } from "./pages/afterloss/DocumentDiscoveryPage";
import { EmailDiscoveryPage } from "./pages/afterloss/EmailDiscoveryPage";
import { AssetRoutingPage } from "./pages/afterloss/AssetRoutingPage";
import { PaperworkPage } from "./pages/afterloss/PaperworkPage";
import { FollowupPage } from "./pages/afterloss/FollowupPage";
import { SharedAccessPage } from "./pages/afterloss/SharedAccessPage";
import { SettingsPage } from "./pages/afterloss/SettingsPage";

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

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";
import { UpdateNotification } from "@/components/UpdateNotification";
import { PgToolsProvider } from "@/context/PgToolsContext";
import { Home } from "@/pages/Home";
import { ConnectionForm } from "@/pages/ConnectionForm";
import { Clone } from "@/pages/Clone";
import { History } from "@/pages/History";
import { Settings } from "@/pages/Settings";
import { DownloadSchema } from "@/pages/DownloadSchema";
import { useColorTheme } from "@/hooks/use-color-theme";

function App() {
  // Initialize color theme on app load
  useColorTheme();

  return (
    <PgToolsProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/connection/new" element={<ConnectionForm />} />
            <Route path="/connection/:id/edit" element={<ConnectionForm />} />
            <Route path="/clone" element={<Clone />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/download-schema" element={<DownloadSchema />} />
          </Routes>
        </Layout>
        <Toaster />
        <UpdateNotification />
      </BrowserRouter>
    </PgToolsProvider>
  );
}

export default App;

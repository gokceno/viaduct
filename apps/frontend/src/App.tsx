import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ChatDetail from "./pages/ChatDetail";
import Settings from "./pages/Settings";
import QRCodePrompt from "./components/QRCodePrompt";

export default function App() {
  return (
    <BrowserRouter>
      <QRCodePrompt />
      <Routes>
        <Route path="/"          element={<Dashboard />} />
        <Route path="/chat/:jid" element={<ChatDetail />} />
        <Route path="/settings"  element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}

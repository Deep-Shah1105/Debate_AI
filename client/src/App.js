import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate,
} from "react-router-dom";
import TextDebatePage from "./pages/TextDebatePage";
import AudioDebatePage from "./pages/AudioDebatePage";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <h1 className="text-2xl font-semibold mb-8 text-center text-gray-800 dark:text-gray-100">
         User vs AI: Real-Time Debate
      </h1>
      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          onClick={() => navigate("/text-debate")}
          className="py-3 px-4 rounded-lg bg-blue-600 dark:bg-blue-700 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-800 transition"
        >
          Start Debate (Text Mode)
        </button>
        <button
          onClick={() => navigate("/audio-debate")}
          className="py-3 px-4 rounded-lg bg-green-600 dark:bg-green-700 text-white font-medium hover:bg-green-700 dark:hover:bg-green-800 transition"
        >
          Start Debate (Audio Mode)
        </button>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/text-debate" element={<TextDebatePage />} />
        <Route path="/audio-debate" element={<AudioDebatePage />} />
      </Routes>
    </Router>
  );
}

export default App;

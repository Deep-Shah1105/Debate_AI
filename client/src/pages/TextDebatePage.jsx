import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

const API_BASE = "http://localhost:5000";

export default function TextDebatePage() {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Normal");
  const [activeDebate, setActiveDebate] = useState({ topic: "", difficulty: "" });
  const [debateStarted, setDebateStarted] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isAiReplying, setIsAiReplying] = useState(false);
  const [feedback, setFeedback] = useState("");
  // New state to track if feedback has been generated
  const [hasExited, setHasExited] = useState(false);

  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // --- Start Debate ---
  const startDebate = async () => {
    if (!topic.trim()) {
      alert("Please enter a topic");
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/start_debate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, difficulty }),
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
      const data = await response.json();
      setChatHistory(data.chat_history || []);
      setActiveDebate({ topic: data.topic, difficulty: data.difficulty });
      setDebateStarted(true);
      setFeedback("");
      setHasExited(false); // Reset the state for a new debate
    } catch (err) {
      console.error("Failed to start debate:", err);
      alert("Could not connect to the server. Make sure it's running.");
    }
  };

  // --- Submit Argument ---
  const submitArgument = async () => {
    if (!userInput.trim() || isAiReplying) return;

    const userMessage = userInput;
    setChatHistory((prev) => [...prev, [userMessage, ""]]);
    setUserInput("");
    setIsAiReplying(true);

    try {
      const url = new URL(`${API_BASE}/debate_full_stream`);
      url.searchParams.append("user_input", userMessage);
      url.searchParams.append("mode", "text");

      const response = await fetch(url);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processStream = async () => {
        const { done, value } = await reader.read();
        if (done) {
          setIsAiReplying(false);
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          let eventName = "";
          let eventData = "";

          for (const line of message.split("\n")) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6).trim();
          }

          if (eventName === "text_chunk" && eventData) {
            try {
              const json = JSON.parse(eventData);
              const chunk = json.text;
              setChatHistory((prev) => {
                const newHist = [...prev];
                newHist[newHist.length - 1][1] += chunk;
                return newHist;
              });
            } catch (err) {
              console.error("Bad JSON chunk:", eventData, err);
            }
          }
        }
        await processStream();
      };

      await processStream();
    } catch (err) {
      console.error("Error in stream:", err);
      setIsAiReplying(false);
      setChatHistory((prev) => prev.slice(0, -1));
      alert("AI response failed.");
    }
  };

  // --- Exit Debate ---
  const exitDebate = async () => {
    // If feedback has already been generated, go back to the start screen
    if (hasExited) {
        setDebateStarted(false);
        setFeedback("");
        setHasExited(false);
        return;
    }

    setFeedback("Generating feedback, please wait...");
    setHasExited(true); // Set state to indicate feedback has been requested
    
    try {
        const res = await fetch(`${API_BASE}/feedback_stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const text = await res.text();
        setFeedback(text);
    } catch (err) {
        console.error("Feedback error:", err);
        setFeedback("Sorry, an error occurred while generating feedback.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-gray-100 font-sans">
      <Link to="/" className="text-blue-400 hover:underline block mb-4">
        ← Back to Home
      </Link>

      {!debateStarted ? (
        <div className="max-w-xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-center">Start Text Debate</h2>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter debate topic"
            className="border w-full mb-3 p-2 rounded bg-gray-700 text-gray-100 border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="border w-full mb-4 p-2 rounded bg-gray-700 text-gray-100 border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option>Easy</option>
            <option>Normal</option>
            <option>Hard</option>
            <option>Brutal</option>
          </select>
          <button
            className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded w-full transition-colors duration-200"
            onClick={startDebate}
          >
            Start Debate
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 text-center text-gray-400">
            <strong>Topic:</strong> {activeDebate.topic} — <strong>Difficulty:</strong>{" "}
            {activeDebate.difficulty}
          </div>

          <div
            ref={chatBoxRef}
            className="bg-gray-800 rounded-xl shadow-lg p-4 mb-4 h-96 overflow-y-auto"
          >
            {chatHistory.map((row, i) => (
              <div key={i} className="mb-4">
                <div className="font-semibold text-blue-400">You:</div>
                <div className="ml-2 whitespace-pre-wrap text-gray-200">{row[0]}</div>
                {row[1] && (
                  <>
                    <div className="font-semibold mt-2 text-green-400">AI:</div>
                    <div className="ml-2 whitespace-pre-wrap text-gray-200">{row[1]}</div>
                  </>
                )}
              </div>
            ))}

            {isAiReplying && (
              <div className="font-semibold mt-2 text-green-400">AI is typing...</div>
            )}
          </div>

          <div className="flex gap-3 justify-center">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitArgument()}
              placeholder="Type your argument..."
              disabled={isAiReplying}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-gray-100 border border-gray-600 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            />
            <button
              className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg transition-all duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
              onClick={submitArgument}
              disabled={isAiReplying}
            >
              {isAiReplying ? "AI is Responding..." : "Submit"}
            </button>
            <button
              className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg"
              onClick={exitDebate}
              disabled={isAiReplying}
            >
              {hasExited ? "Start New Debate" : "Exit"}
            </button>
          </div>

          {feedback && (
            <div className="mt-6 bg-gray-800 p-4 rounded-xl shadow-lg">
              <h3 className="font-semibold mb-2 text-xl">Feedback</h3>
              <pre className="whitespace-pre-wrap font-sans text-gray-200">{feedback}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
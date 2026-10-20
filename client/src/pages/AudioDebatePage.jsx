import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";

// The base URL for your Flask API server
const API_BASE = "http://localhost:5000";

// Helper function to convert a base64 string to a Blob object
const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
};

// Helper function to read a streamed text response from the server
const readStreamedText = async (response, onChunk) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: !done });
      onChunk(chunk);
    }
  }
};

export default function AudioDebatePage() {
  // State for debate setup
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Normal");
  const [debateStarted, setDebateStarted] = useState(false);
  
  // State for chat and feedback
  const [chatHistory, setChatHistory] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [hasExited, setHasExited] = useState(false);
  
  // State for streaming and audio playback
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- State for Audio Recording & Transcription ---
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // --- Refs for Silence Detection ---
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaStreamSourceRef = useRef(null);

  // Refs for UI elements and connections
  const chatBoxRef = useRef(null);
  const eventSourceRef = useRef(null);

  // --- AUDIO QUEUE PLAYBACK LOGIC ---
  useEffect(() => {
    if (!isPlaying && audioQueue.length > 0) {
      setIsPlaying(true);
      const nextAudioUrl = audioQueue[0];
      const audio = new Audio(nextAudioUrl);
      
      audio.play();
      audio.onended = () => {
        URL.revokeObjectURL(nextAudioUrl); 
        setAudioQueue(prev => prev.slice(1));
        setIsPlaying(false);
      };
      audio.onerror = () => {
        console.error("Error playing audio from queue.");
        setAudioQueue(prev => prev.slice(1));
        setIsPlaying(false);
      }
    }
  }, [audioQueue, isPlaying]);

  // --- DEBATE CONTROL FUNCTIONS ---
  const startDebate = async () => {
    if (!topic.trim()) return alert("Please enter a topic");
    try {
        const res = await fetch(`${API_BASE}/start_debate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, difficulty }),
        });
        const json = await res.json();
        setChatHistory(json.chat_history || []);
        setDebateStarted(true);
        setHasExited(false);
    } catch (error) {
        console.error("Failed to start debate:", error);
        alert("Could not connect to the server. Please ensure it is running.");
    }
  };

  // --- AUDIO RECORDING, NOISE FILTERING, SILENCE DETECTION, AND TRANSCRIPTION ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        cleanupAudioProcessing(); 
        await transcribeAudio(audioBlob);
      };

      // --- Setup Noise Filtering + Silence Detection ---
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      const source = audioContextRef.current.createMediaStreamSource(stream);

      // Noise reduction filters
      const highPass = audioContextRef.current.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 100;

      const lowPass = audioContextRef.current.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.value = 5000;

      // Connect: mic -> highPass -> lowPass -> analyser
      source.connect(highPass);
      highPass.connect(lowPass);
      lowPass.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkForSilence = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const avg = sum / bufferLength;

        const silenceThreshold = 15;

        if (avg > silenceThreshold) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              console.log("Silence detected, stopping recording.");
              stopRecording();
            }, 2000);
          }
        }
        animationFrameRef.current = requestAnimationFrame(checkForSilence);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      animationFrameRef.current = requestAnimationFrame(checkForSilence);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access the microphone. Please check your browser permissions.");
    }
  };
  
  const cleanupAudioProcessing = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    analyserRef.current = null;
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsTranscribing(true);
    }
  };

  const transcribeAudio = async (audioBlob) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    try {
      const res = await fetch(`${API_BASE}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Transcription failed with status: ${res.status}`);
      }

      const data = await res.json();
      const transcribedText = data.transcription;

      if (transcribedText && transcribedText.trim()) {
        // Store the user's transcription in chat history for feedback
        setChatHistory(prev => [...prev, [transcribedText, ""]]);
        await submitArgument(transcribedText);
      } else {
        alert("Could not detect any speech. Please try again.");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      alert("An error occurred during transcription.");
    } finally {
      setIsTranscribing(false);
    }
  };

  // --- SUBMIT ARGUMENT AND HANDLE AI RESPONSE STREAM ---
  const submitArgument = async (argumentText) => {
    if (!argumentText.trim() || isGenerating) return;

    setIsGenerating(true);

    const encodedInput = encodeURIComponent(argumentText);
    const url = `${API_BASE}/debate_full_stream?user_input=${encodedInput}`;
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => console.log("SSE connection opened.");
    eventSource.onerror = (err) => {
      console.error("SSE error:", err);
      eventSource.close();
      setIsGenerating(false);
    };

    eventSource.addEventListener('text_chunk', (event) => {
      // In this mode, we don't display the text, but we still need to process it
      // to ensure the full AI reply is saved to chatHistory for feedback generation.
      const data = JSON.parse(event.data);
      const newChunk = data.text;
      setChatHistory(prev => {
        const newHist = [...prev];
        if (newHist.length > 0) {
            newHist[newHist.length - 1][1] += newChunk;
        }
        return newHist;
      });
    });

    eventSource.addEventListener('audio_chunk', (event) => {
      const data = JSON.parse(event.data);
      const audioBlob = b64toBlob(data.audio, 'audio/mpeg');
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioQueue(prev => [...prev, audioUrl]);
    });

    eventSource.addEventListener('stream_end', () => {
      console.log("SSE stream ended.");
      eventSource.close();
      eventSourceRef.current = null;
      setIsGenerating(false);
    });
  };

  const exitDebate = async () => {
    if (hasExited) {
        setDebateStarted(false);
        setFeedback("");
        setHasExited(false);
        return;
    }

    setFeedback("Generating feedback, please wait...");
    setHasExited(true);
    
    try {
        const res = await fetch(`${API_BASE}/feedback_stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
            throw new Error(`Server error: ${res.status}`);
        }

        let fb = "";
        await readStreamedText(res, (chunk) => {
            fb += chunk;
            setFeedback(fb);
        });
    } catch (error) {
        console.error("Failed to get feedback:", error);
        setFeedback("Sorry, an error occurred while generating feedback.");
    }
  };

  // Auto-scroll chat to the bottom on update
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // --- RENDER LOGIC ---
  const getButtonState = () => {
    if (isRecording) return { text: "Stop Recording", action: stopRecording, disabled: false };
    if (isTranscribing) return { text: "Transcribing...", action: () => {}, disabled: true };
    if (isGenerating) return { text: "AI is Responding...", action: () => {}, disabled: true };
    return { text: "Record Argument", action: startRecording, disabled: false };
  };

  const buttonState = getButtonState();
  const exitButtonText = hasExited ? "Start New Debate" : "Exit";

  // New render section for minimalist UI
  const renderMinimalistUI = () => {
      if (isTranscribing) {
          return <div className="text-xl text-gray-400 animate-pulse text-center">Listening...</div>;
      }
      if (isGenerating) {
          return <div className="text-xl text-gray-400 animate-pulse text-center">AI is responding...</div>;
      }
      return <div className="text-gray-500 text-center">Press "Record Argument" to begin.</div>;
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-gray-100 font-sans">
      <Link to="/" className="text-blue-400 hover:underline block mb-4">
        ← Back to Home
      </Link>

      {!debateStarted ? (
        <div className="max-w-xl mx-auto bg-gray-800 p-6 rounded-xl shadow-lg">
          <h2 className="text-2xl font-semibold mb-4 text-center">Start Audio Debate</h2>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Enter debate topic" className="border w-full mb-3 p-2 rounded bg-gray-700 text-gray-100 border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="border w-full mb-4 p-2 rounded bg-gray-700 text-gray-100 border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option>Easy</option><option>Normal</option><option>Hard</option><option>Brutal</option>
          </select>
          <button className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded w-full transition-colors duration-200" onClick={startDebate}>Start Debate</button>
        </div>
      ) : (
        <>
          <div className="mb-4 text-center text-gray-400">
            <strong>Topic:</strong> {topic} — <strong>Difficulty:</strong> {difficulty}
          </div>
          
          <div className="bg-gray-800 rounded-xl shadow-lg p-4 mb-4 h-96 flex items-center justify-center">
             {renderMinimalistUI()}
          </div>

          <div className="flex gap-3 justify-center">
            <button 
                className={`text-white px-6 py-3 rounded-lg transition-all duration-200 ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800'} disabled:bg-gray-500 disabled:cursor-not-allowed`}
                onClick={buttonState.action} 
                disabled={buttonState.disabled}
            >
              {buttonState.text}
            </button>
            <button 
              className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg" 
              onClick={exitDebate} 
              disabled={isGenerating || isRecording || isTranscribing}
            >
              {exitButtonText}
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
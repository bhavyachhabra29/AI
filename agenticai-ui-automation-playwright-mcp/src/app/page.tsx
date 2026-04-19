"use client";

import { useState, useRef, useCallback } from "react";
import type {
  ActionProgress,
  ExtractedData,
  ActionSummaryRow,
  ExecutionResult,
  ScreenshotMessage,
} from "@/lib/types";

export default function Home() {
  const [textInput, setTextInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ActionProgress[]>([]);
  const [extractions, setExtractions] = useState<ExtractedData[]>([]);
  const [summary, setSummary] = useState<ActionSummaryRow[]>([]);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<ScreenshotMessage | null>(null);
  const [allScreenshots, setAllScreenshots] = useState<ScreenshotMessage[]>([]);
  const [uploadedJson, setUploadedJson] = useState<unknown>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setUploadedJson(json);
        setUploadedFileName(file.name);
        setError(null);
      } catch {
        setError("Invalid JSON file. Please upload a valid JSON file.");
        setUploadedJson(null);
        setUploadedFileName(null);
      }
    };
    reader.readAsText(file);
  };

  const clearUpload = () => {
    setUploadedJson(null);
    setUploadedFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExecute = async () => {
    if (!textInput.trim() && !uploadedJson) {
      setError("Please enter instructions or upload a JSON file.");
      return;
    }

    setIsRunning(true);
    setProgress([]);
    setExtractions([]);
    setSummary([]);
    setResult(null);
    setError(null);
    setScreenshot(null);
    setAllScreenshots([]);

    try {
      const body = uploadedJson
        ? { json: uploadedJson }
        : { text: textInput };

      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Execution failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const message = JSON.parse(line.slice(6));
              switch (message.type) {
                case "progress":
                  setProgress((prev) => {
                    const incoming = message.data as ActionProgress;
                    // If incoming is completed/failed, replace the matching "running" entry
                    if (incoming.status === "completed" || incoming.status === "failed") {
                      const idx = prev.findIndex(
                        (p) => p.step === incoming.step && p.agent === incoming.agent && p.status === "running"
                      );
                      if (idx !== -1) {
                        const updated = [...prev];
                        updated[idx] = incoming;
                        return updated;
                      }
                    }
                    return [...prev, incoming];
                  });
                  scrollToBottom();
                  break;
                case "extraction":
                  setExtractions((prev) => [...prev, message.data]);
                  break;
                case "summary":
                  setSummary(message.data);
                  break;
                case "screenshot":
                  setScreenshot(message.data);
                  setAllScreenshots((prev) => [...prev, message.data]);
                  break;
                case "complete":
                  setResult(message.data);
                  break;
                case "error":
                  setError(message.data.message);
                  break;
              }
            } catch {
              // Skip malformed SSE
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const downloadResults = () => {
    if (!result) return;

    const statusColor = (s: string) =>
      s === "completed" || s === "success" ? "#34d399" : s === "failed" ? "#f87171" : "#fbbf24";

    const summaryRows = summary
      .map(
        (row) => `
      <tr>
        <td>${row.step}</td>
        <td>${row.action}</td>
        <td>${row.target || ""}</td>
        <td>${row.agent}</td>
        <td style="color:${statusColor(row.status)};font-weight:600">${row.status}</td>
        <td>${row.duration}</td>
        <td>${row.details || ""}</td>
      </tr>`
      )
      .join("");

    const extractionBlocks = extractions
      .map(
        (ext) => `
      <div class="card">
        <h3>${ext.pageTitle} <span class="url">${ext.url}</span></h3>
        <pre>${JSON.stringify(ext.fields, null, 2)}</pre>
        ${ext.content ? `<details><summary>Content preview</summary><p>${ext.content}</p></details>` : ""}
      </div>`
      )
      .join("");

    const screenshotBlocks = allScreenshots
      .map(
        (ss) => `
      <div class="screenshot-block">
        <h3>Step ${ss.step} <span class="timestamp">${new Date(ss.timestamp).toLocaleTimeString()}</span></h3>
        <img src="data:image/png;base64,${ss.imageBase64}" alt="Step ${ss.step} screenshot" />
      </div>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>UI Automation Report – ${new Date().toISOString().slice(0, 19)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; line-height: 1.6; }
  h1 { font-size: 1.5rem; margin-bottom: .25rem; }
  .subtitle { color: #64748b; font-size: .85rem; margin-bottom: 2rem; }
  .meta { display: flex; gap: 2rem; margin-bottom: 2rem; font-size: .85rem; color: #94a3b8; }
  .meta span { background: #1e293b; padding: .25rem .75rem; border-radius: .5rem; }
  .status-badge { font-weight: 700; color: ${statusColor(result.status)}; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: .85rem; }
  th, td { text-align: left; padding: .6rem .75rem; border-bottom: 1px solid #1e293b; }
  th { color: #94a3b8; font-weight: 600; background: #1e293b; }
  tr:hover { background: #1e293b44; }
  .section-title { font-size: 1.1rem; font-weight: 600; margin: 2rem 0 1rem; padding-bottom: .5rem; border-bottom: 1px solid #334155; }
  .card { background: #1e293b; border-radius: .75rem; padding: 1rem; margin-bottom: 1rem; }
  .card h3 { font-size: .9rem; margin-bottom: .5rem; }
  .card .url { color: #64748b; font-size: .75rem; margin-left: .5rem; }
  .card pre { background: #0f172a; padding: .75rem; border-radius: .5rem; font-size: .75rem; overflow-x: auto; color: #94a3b8; }
  .card details { margin-top: .5rem; font-size: .8rem; color: #64748b; }
  .screenshot-block { margin-bottom: 2rem; }
  .screenshot-block h3 { font-size: .95rem; margin-bottom: .5rem; }
  .screenshot-block .timestamp { color: #64748b; font-size: .75rem; margin-left: .5rem; }
  .screenshot-block img { width: 100%; max-width: 900px; border-radius: .75rem; border: 1px solid #334155; }
  @media print { body { background: #fff; color: #1e293b; } th { background: #f1f5f9; } .card { background: #f8fafc; } .screenshot-block img { max-width: 100%; } }
</style>
</head>
<body>
<h1>UI Automation Report</h1>
<p class="subtitle">Generated by UI Automations Runner Agent</p>
<div class="meta">
  <span>Status: <span class="status-badge">${result.status}</span></span>
  <span>Session: ${result.sessionId}</span>
  <span>Started: ${result.startedAt}</span>
  <span>Completed: ${result.completedAt}</span>
</div>

<h2 class="section-title">Execution Summary</h2>
<table>
  <thead><tr><th>Step</th><th>Action</th><th>Target</th><th>Agent</th><th>Status</th><th>Duration</th><th>Details</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>

${extractions.length > 0 ? `<h2 class="section-title">Extracted Data</h2>${extractionBlocks}` : ""}

${allScreenshots.length > 0 ? `<h2 class="section-title">Step Screenshots</h2>${screenshotBlocks}` : ""}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ui-automation-report-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "text-blue-400";
      case "completed":
      case "success":
        return "text-emerald-400";
      case "failed":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getAgentBadge = (agent: string) => {
    const colors: Record<string, string> = {
      supervisor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
      navigator: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      extractor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      action: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    };
    return colors[agent] || "bg-gray-500/20 text-gray-300 border-gray-500/30";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              UI Automations Runner Agent
            </h1>
            <p className="text-xs text-gray-500">Powered by AI Agents &bull; Playwright &bull; Multi-Agent Architecture</p>
          </div>
        </div>
      </header>

      <main className="mx-auto px-6 py-8 h-[calc(100vh-73px)]">
        <div className="flex gap-6 h-full">
          {/* LEFT PANEL – inputs, progress, data, summary */}
          <div className="w-1/2 min-w-0 space-y-8 overflow-y-auto pr-2">
        {/* Input Section */}
        <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Instructions
          </h2>

          {/* Text Input */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Enter instructions (one per line, numbered or plain text)
            </label>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={isRunning}
              placeholder={`1. Go to https://example.com\n2. Extract the page title and main content\n3. Click the button named 'Learn More'\n4. Extract all field values from the form`}
              className="w-full h-40 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none disabled:opacity-50"
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 border-t border-gray-800" />
            <span className="text-sm text-gray-600 font-medium">OR</span>
            <div className="flex-1 border-t border-gray-800" />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Upload instructions as JSON file
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={isRunning}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-750 hover:border-gray-600 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                Choose File
              </button>
              {uploadedFileName && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <span className="text-sm text-blue-300">{uploadedFileName}</span>
                  <button onClick={clearUpload} className="text-blue-400 hover:text-blue-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-600">
              <a
                href="/instructions_wikipedia.json"
                download="instructions_wikipedia.json"
                className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Download sample JSON
              </a>
              {" "}to see the expected format.
            </p>
          </div>

          {/* Execute Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleExecute}
              disabled={isRunning || (!textInput.trim() && !uploadedJson)}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Running Automation...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                  </svg>
                  Execute Automation
                </>
              )}
            </button>
            {result && (
              <button
                onClick={downloadResults}
                className="px-5 py-3 bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 font-medium rounded-xl hover:bg-emerald-600/30 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Report
              </button>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}
        </section>

        {/* Progress Section */}
        {progress.length > 0 && (
            <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                Live Progress
                {isRunning && (
                  <span className="ml-2 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                )}
              </h2>
              <div className="max-h-[500px] overflow-y-auto space-y-2 scrollbar-thin">
                {progress.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 text-sm py-2 px-3 rounded-lg bg-gray-800/30 border border-gray-800/50"
                  >
                    <span className={`mt-0.5 ${getStatusColor(p.status)}`}>
                      {p.status === "running" ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : p.status === "completed" ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      )}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-md border ${getAgentBadge(p.agent)}`}>
                      {p.agent}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 truncate">{p.description}</p>
                      {p.details && (
                        <p className="text-gray-500 text-xs mt-0.5 truncate">{p.details}</p>
                      )}
                      {p.error && (
                        <p className="text-red-400 text-xs mt-0.5">{p.error}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 whitespace-nowrap">
                      {new Date(p.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                <div ref={progressEndRef} />
              </div>
            </section>
        )}

        {/* Extracted Data Section */}
        {extractions.length > 0 && (
          <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
              Extracted Data
            </h2>
            <div className="space-y-4">
              {extractions.map((ext, i) => (
                <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-medium text-gray-200">{ext.pageTitle}</h3>
                    <span className="text-xs text-gray-500">{ext.url}</span>
                  </div>
                  <pre className="text-xs font-mono text-gray-400 bg-gray-900/50 rounded-lg p-3 overflow-x-auto max-h-60">
                    {JSON.stringify(ext.fields, null, 2)}
                  </pre>
                  {ext.content && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                        View content preview
                      </summary>
                      <p className="mt-2 text-xs text-gray-500 max-h-40 overflow-y-auto">
                        {ext.content}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Summary Table */}
        {summary.length > 0 && (
          <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
              </svg>
              Execution Summary
              {result && (
                <span className={`ml-2 px-2 py-0.5 text-xs font-medium rounded-md ${
                  result.status === "completed"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : result.status === "partial"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-red-500/20 text-red-300"
                }`}>
                  {result.status}
                </span>
              )}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800">
                    <th className="text-left py-3 px-3 font-medium">Step</th>
                    <th className="text-left py-3 px-3 font-medium">Action</th>
                    <th className="text-left py-3 px-3 font-medium">Target</th>
                    <th className="text-left py-3 px-3 font-medium">Agent</th>
                    <th className="text-left py-3 px-3 font-medium">Status</th>
                    <th className="text-left py-3 px-3 font-medium">Duration</th>
                    <th className="text-left py-3 px-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-3 px-3 text-gray-300 font-mono">{row.step}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-300 text-xs font-medium">
                          {row.action}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-400 max-w-[200px] truncate">{row.target}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-md border ${getAgentBadge(row.agent)}`}>
                          {row.agent}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`font-medium ${getStatusColor(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-500 font-mono text-xs">{row.duration}</td>
                      <td className="py-3 px-3 text-gray-500 text-xs max-w-[300px] truncate">{row.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
          </div>

          {/* RIGHT PANEL – browser preview, fills parent height */}
          <div className="hidden lg:flex w-1/2 shrink-0">
            <section className="bg-gray-900/50 rounded-2xl border border-gray-800 p-5 flex flex-col w-full h-full">
                <h2 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2 shrink-0">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
                  </svg>
                  Browser Preview
                  {isRunning && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      LIVE
                    </span>
                  )}
                </h2>
                {screenshot && (
                  <p className="text-xs text-gray-500 mb-3 shrink-0">
                    Step {screenshot.step} &bull; {new Date(screenshot.timestamp).toLocaleTimeString()}
                  </p>
                )}
                <div className="relative rounded-xl overflow-hidden border border-gray-700/50 bg-gray-950 flex-1 min-h-0">
                  {screenshot ? (
                    <img
                      src={`data:image/png;base64,${screenshot.imageBase64}`}
                      alt={`Browser screenshot at step ${screenshot.step}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-600">
                      <div className="text-center">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
                        </svg>
                        <p className="text-sm font-medium">Browser preview</p>
                        <p className="text-xs mt-1 text-gray-700">Screenshots update after each step</p>
                      </div>
                    </div>
                  )}
                  {isRunning && screenshot && (
                    <div className="absolute top-3 right-3">
                      <span className="flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
                      </span>
                    </div>
                  )}
                </div>
              </section>
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { LeopardLogo } from "@/components/LeopardLogo";

interface DebugEvent {
  ts: number;
  type: string;
  sessionId?: string;
  payload?: unknown;
}

export default function DebugPage() {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ac = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    async function connect() {
      try {
        const res = await fetch("/api/debug/stream", { signal: ac.signal });
        if (!res.body) return;
        setConnected(true);
        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as DebugEvent;
              setEvents((prev) => [...prev, ev]);
            } catch {}
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setConnected(false);
      } finally {
        reader?.releaseLock();
      }
    }

    connect();
    return () => {
      ac.abort();
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const formatTs = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("zh-CN", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
  };

  return (
    <main className="flex h-screen bg-[#0a0a0a] text-[#e0e0e0] font-mono overflow-hidden">
      <div className="flex-1 flex flex-col">
        <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-black/40">
          <div className="flex items-center gap-3">
            <LeopardLogo className="w-6 h-6 text-orange-500" />
            <span className="font-bold text-sm">豹哥 · 运行监控</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-white/20"}`} />
            <span className="text-[10px] text-white/40">{connected ? "已连接" : "未连接"}</span>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
          {events.length === 0 && (
            <p className="text-white/30 py-8">暂无事件。在主页面发起对话后，此处将实时显示 Agent 事件与 LLM 交互。</p>
          )}
          {events.map((ev, i) => (
            <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-orange-500/20 transition-colors">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-white/40 text-[10px]">{formatTs(ev.ts)}</span>
                <span className="text-orange-500 font-semibold">{ev.type}</span>
                {ev.sessionId && <span className="text-white/30 truncate max-w-[120px]">{ev.sessionId}</span>}
              </div>
              {ev.payload != null && Object.keys(ev.payload as object).length > 0 && (
                <pre className="text-white/60 overflow-x-auto text-[11px] mt-2 p-2 rounded bg-black/30">
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Loader2, Plus, MessageSquare } from "lucide-react";
import { LeopardLogo } from "@/components/LeopardLogo"; // 引入新LOGO

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

export default function BaogePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const isInitialMount = useRef(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
      return data.sessions;
    } catch (e) { return []; }
  }, []);

  const createNewSession = async () => {
    const newId = `session_${Date.now()}`;
    setSessionId(newId);
    setMessages([{ role: "assistant", content: "豹哥已上线。系统内核稳定，等待录入指令。" }]);
    await fetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ id: newId, title: "新任务" }),
      headers: { "Content-Type": "application/json" }
    });
    await refreshSessions();
  };

  const switchSession = async (id: string) => {
    if (id === sessionId && messages.length > 0) return;
    setSessionId(id);
    setIsSwitching(true);
    try {
      const res = await fetch(`/api/sessions?sessionId=${id}`);
      const data = await res.json();
      if (data.history) {
        if (data.history.length === 0) {
          setMessages([{ role: "assistant", content: "豹哥已上线。本对话尚无记录。" }]);
        } else {
          setMessages(data.history.map((h: any) => ({ role: h.role, content: h.content })));
        }
      }
    } finally {
      setIsSwitching(false);
    }
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const init = async () => {
        const list = await refreshSessions();
        if (list && list.length > 0) {
          await switchSession(list[0].id);
        } else {
          await createNewSession();
        }
      };
      init();
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, isSwitching]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const currentInput = input;
    const targetSession = sessionId;
    setMessages(prev => [...prev, { role: "user", content: currentInput }]);
    setInput("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: currentInput, sessionId: targetSession }),
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        await refreshSessions();
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ 豹哥核心链路异常。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden">
      
      {/* 侧边栏 */}
      <aside className="w-16 md:w-72 bg-[#0d0d0d] border-r border-white/5 flex flex-col p-4 shadow-2xl z-20 transition-all duration-500">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2 cursor-pointer" onClick={() => refreshSessions()}>
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
            <LeopardLogo className="w-7 h-7 text-white" />
          </div>
          <div className="hidden md:block italic tracking-tighter">
            <h1 className="font-black text-xl leading-tight">BAOGE</h1>
            <p className="text-[9px] text-white/30 font-mono tracking-widest uppercase">Stealth Mode On</p>
          </div>
        </div>

        <button 
          onClick={createNewSession}
          className="flex items-center gap-3 w-full p-4 bg-white/5 border border-white/10 text-white font-bold rounded-2xl transition-all hover:bg-white/10 active:scale-[0.98] mb-8"
        >
          <Plus className="w-5 h-5 text-orange-500" />
          <span className="text-xs hidden md:block uppercase tracking-widest font-black">Init Session</span>
        </button>

        <div className="flex-1 overflow-y-auto space-y-2 px-1 custom-scrollbar">
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4 px-2">Task History</p>
          {sessions.map((s) => (
            <div 
              key={s.id}
              onClick={() => switchSession(s.id)}
              className={`flex items-center gap-3 px-4 py-4 rounded-2xl cursor-pointer transition-all border ${
                sessionId === s.id 
                  ? "bg-white/5 text-orange-500 border-orange-500/20" 
                  : "bg-transparent text-white/20 border-transparent hover:bg-white/5"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold truncate hidden md:block leading-none">{s.title}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* 聊天主界面 */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-[#0d0d0d] via-[#0a0a0a] to-[#0d0d0d]">
        <header className="h-16 flex items-center px-10 border-b border-white/5 backdrop-blur-xl z-10 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
            <span className="text-[9px] font-bold text-white/30 tracking-[0.4em] uppercase font-mono">
              Terminal Active • {sessionId.replace('session_', '')}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
          <div className="max-w-3xl mx-auto py-16 space-y-12 pb-48">
            {isSwitching ? (
              <div className="flex justify-center items-center h-32 opacity-20">
                <LeopardLogo className="w-12 h-12 animate-pulse" />
              </div>
            ) : messages.map((m, i) => (
              <div key={i} className={`flex gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && (
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center shrink-0 shadow-2xl shadow-orange-500/5">
                    <LeopardLogo className="w-7 h-7 text-orange-500" />
                  </div>
                )}
                <div className={`p-7 rounded-[2.5rem] text-[15px] leading-relaxed max-w-[85%] border shadow-2xl transition-all duration-500 ${
                  m.role === "user" 
                    ? "bg-[#111] text-white border-white/10 rounded-tr-sm" 
                    : "bg-white/[0.02] text-white/80 border-white/5 rounded-tl-sm shadow-black"
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                {m.role === "user" && (
                  <div className="w-12 h-12 rounded-2xl bg-[#111] border border-white/10 flex items-center justify-center shrink-0 shadow-2xl">
                    <User className="w-6 h-6 text-white/40" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-6 animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                </div>
                <div className="flex gap-2 items-center">
                   <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Processing</span>
                   <div className="flex gap-1">
                      <div className="w-1 h-1 bg-orange-500/40 rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-orange-500/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                   </div>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        {/* 悬浮输入 */}
        <footer className="absolute bottom-0 left-0 right-0 p-10 pb-14 bg-gradient-to-t from-black via-black/90 to-transparent">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute inset-0 bg-orange-500/5 blur-3xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-1000 rounded-full" />
            <input
              className="w-full pl-8 pr-20 py-7 bg-[#111]/80 backdrop-blur-2xl border border-white/10 focus:border-orange-500/40 rounded-[2.5rem] outline-none transition-all text-white shadow-2xl placeholder:text-white/10 text-[16px]"
              placeholder="请输入指令，豹哥时刻准备着..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || isSwitching}
              className="absolute right-3 top-3 bottom-3 w-16 bg-orange-500 text-black rounded-full hover:bg-orange-400 active:scale-90 transition-all flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.3)] disabled:opacity-20"
            >
              {isLoading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Send className="w-7 h-7" />}
            </button>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.03); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(249,115,22,0.3); }
      `}</style>
    </main>
  );
}

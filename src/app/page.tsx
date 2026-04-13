"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Loader2, Plus, MessageSquare, Paperclip, X, FileIcon, FolderUp, Square, Menu } from "lucide-react";
import { LeopardLogo } from "@/components/LeopardLogo";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ConfigWizard } from "@/components/ConfigWizard";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

interface Session {
  id: string;
  title: string;
  updatedAt: number;
  running?: boolean;
}

interface FileWithPath {
  file: File;
  path: string;
}

export default function BaogePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<FileWithPath[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [skillsCount, setSkillsCount] = useState(0);
  const [loadedSkills, setLoadedSkills] = useState<string[]>([]);
  const [configStatus, setConfigStatus] = useState<{ configured: boolean; configPath: string } | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const refreshConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/config/status');
      const data = await r.json();
      setConfigStatus(data);
      if (!data.configured) setShowWizard(true);
    } catch {}
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<{ controller: AbortController; requestId: string } | null>(null);
  // 用于取消 SSE 流连接（不影响 agent 运行，只断开监听）
  const streamAbortRef = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
      return data.sessions as Session[];
    } catch (e) { return []; }
  }, []);

  const refreshSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkillsCount(data.skills?.length ?? 0);
    } catch { setSkillsCount(0); }
  }, []);

  const createNewSession = async () => {
    const newId = `session_${Date.now()}`;
    setSessionId(newId);
    setMessages([{ role: "assistant", content: "豹哥已上线。系统内核稳定，等待录入指令。" }]);
    await fetch('/api/sessions', { method: 'POST', body: JSON.stringify({ id: newId, title: "新任务" }), headers: { "Content-Type": "application/json" } });
    await refreshSessions();
  };

  /**
   * 连接到 SSE 流，处理事件。用于初始发送和断线重连。
   * msgBaseIdx: messages 数组中 assistant 占位消息的索引
   */
  const connectToStream = useCallback((targetSessionId: string, msgBaseIdx: number) => {
    const ac = new AbortController();
    streamAbortRef.current = ac;
    setIsLoading(true);

    let toolStatus = "";
    let mainContent = "";
    const toolsUsedThisTurn: string[] = [];
    const getFullContent = () => (toolStatus ? toolStatus + (mainContent ? "\n\n" + mainContent : "") : mainContent) || "";
    const updateMsg = (content: string) => setMessages(prev => {
      const n = [...prev];
      if (msgBaseIdx < n.length && n[msgBaseIdx]?.role === "assistant") {
        n[msgBaseIdx] = { ...n[msgBaseIdx], content };
      }
      return n;
    });

    (async () => {
      try {
        const res = await fetch(`/api/chat/stream?sessionId=${targetSessionId}`, { signal: ac.signal });
        if (!res.ok || !res.body) {
          // 没有运行中的 agent（已结束或 404）
          setIsLoading(false);
          return;
        }
        const reader = res.body.getReader();
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
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "request_id") {
                // 记录 requestId 以支持 abort
                abortRef.current = { controller: ac, requestId: ev.requestId };
              } else if (ev.type === "skills_loaded") {
                const all = [...(ev.skillMd || []), ...(ev.tools || [])];
                if (all.length > 0) setLoadedSkills(all);
              } else if (ev.type === "tool_start") {
                const agentLabel = ev.agentName && ev.agentName !== 'main' ? `[${ev.agentName}] ` : "";
                toolsUsedThisTurn.push(`${agentLabel}${ev.toolName}`);
                let argStr = "";
                if (ev.args && typeof ev.args === "object") {
                  const a = ev.args;
                  argStr = a.command ?? (a.operation && a.path ? `${a.operation} ${a.path}` : a.path) ?? JSON.stringify(a).slice(0, 60);
                } else if (ev.args) argStr = String(ev.args).slice(0, 60);
                toolStatus += `⚡ **${agentLabel}正在执行:** \`${ev.toolName}\`${argStr ? ` \`${String(argStr).slice(0, 80)}${String(argStr).length > 80 ? "…" : ""}\`` : ""}\n\n`;
              } else if (ev.type === "tool_end") {
                const agentLabel = ev.agentName && ev.agentName !== 'main' ? `[${ev.agentName}] ` : "";
                toolStatus += `✅ **${agentLabel}**\`${ev.toolName}\` 已完成\n\n`;
              } else if (ev.type === "text_delta" && ev.delta) {
                mainContent += ev.delta;
              } else if (ev.type === "message_end" && ev.text) {
                mainContent = ev.text;
              } else if (ev.type === "error") {
                mainContent += `\n\n⚠️ ${ev.message}`;
              } else if (ev.type === "done" && !getFullContent().trim()) {
                mainContent = "豹哥想了想，没有给出明确回复。";
              } else if (ev.type === "aborted") {
                mainContent += (mainContent ? "\n\n" : "") + "⚠️ 已停止。";
              } else if (ev.type === "max_rounds_reached") {
                mainContent += (mainContent ? "\n\n" : "") + `⚠️ 已达到最大轮次 (${ev.maxRounds})，自动停止。`;
              }
              updateMsg(getFullContent());
            } catch (_) {}
          }
        }
        await refreshSessions();
      } catch (err) {
        const aborted = (err as Error)?.name === 'AbortError';
        if (!aborted) {
          updateMsg(getFullContent() || "⚠️ 豹哥内核连接异常。");
        }
      } finally {
        if (toolsUsedThisTurn.length > 0) {
          setMessages(prev => {
            const n = [...prev];
            if (msgBaseIdx < n.length && n[msgBaseIdx]?.role === "assistant") {
              n[msgBaseIdx] = { ...n[msgBaseIdx], toolsUsed: toolsUsedThisTurn };
            }
            return n;
          });
        }
        streamAbortRef.current = null;
        abortRef.current = null;
        setIsLoading(false);
      }
    })();
  }, [refreshSessions]);

  const switchSession = async (id: string) => {
    if (id === sessionId && messages.length > 0) return;
    // 断开当前的 SSE 流（不 abort agent）
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
    setIsLoading(false);
    setSessionId(id);
    try {
      const res = await fetch(`/api/sessions?sessionId=${id}`);
      const data = await res.json();
      if (data.history) {
        const loadedMessages: Message[] = data.history.length === 0
          ? [{ role: "assistant", content: "豹哥已上线。本对话尚无记录。" }]
          : data.history.map((h: any) => ({ role: h.role, content: h.content }));
        setMessages(loadedMessages);

        // 如果该会话有正在运行的 agent，自动重连
        if (data.running) {
          // 追加一个空的 assistant 占位消息用于流式更新
          const reconnectIdx = loadedMessages.length;
          setMessages(prev => [...prev, { role: "assistant", content: "" }]);
          // 用 setTimeout 确保 state 已更新
          setTimeout(() => connectToStream(id, reconnectIdx), 0);
        }
      }
    } catch {}
  };

  useEffect(() => {
    refreshSessions().then(list => { if (list && list.length > 0) switchSession(list[0].id); else createNewSession(); });
    refreshSkills();
    refreshConfig();
  }, []);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  const traverseFileTree = async (item: any, path: string = ""): Promise<FileWithPath[]> => {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file: File) => { resolve([{ file, path: path + file.name }]); });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        dirReader.readEntries(async (entries: any[]) => {
          const results = await Promise.all(entries.map(entry => traverseFileTree(entry, path + item.name + "/")));
          resolve(results.flat());
        });
      }
    });
  };

  const handleUpload = async (fileList: FileWithPath[]): Promise<{ path: string; name: string }[]> => {
    setUploading(true);
    const formData = new FormData();
    fileList.forEach(item => { formData.append('files', item.file); formData.append('paths', item.path); });
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const fileNames = fileList.map(f => f.file.name).join(', ');
        setMessages(prev => [...prev, { role: "assistant", content: `✅ [系统登记] 成功挂载资产: ${fileNames}` }]);
        return (data.assets || []).map((a: { path: string; name: string }) => ({ path: a.path, name: a.name }));
      }
    } catch (e) { alert("上传失败"); } finally { setUploading(false); setAttachedFiles([]); }
    return [];
  };

  const handleSend = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;
    if (isLoading) return;
    let uploadedAssets: { path: string; name: string }[] = [];
    if (attachedFiles.length > 0) uploadedAssets = await handleUpload(attachedFiles);
    if (!input.trim()) return;
    const displayInput = input;
    let apiPrompt = input;
    if (uploadedAssets.length > 0) {
      const assetHint = uploadedAssets.map(a => `${a.name}: ${a.path}`).join('\n');
      apiPrompt = `${input}\n\n[当前会话刚上传的资产，可直接使用以下路径]\n${assetHint}`;
    }
    setInput("");

    // 追加用户消息和 assistant 占位
    setMessages(prev => [...prev, { role: "user", content: displayInput }, { role: "assistant", content: "" }]);
    const streamMsgIdx = messages.length + 1; // +1 for user msg, pointing to assistant placeholder

    const rid = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: apiPrompt, sessionId, requestId: rid }),
        headers: { "Content-Type": "application/json" },
      });

      if (res.status === 409) {
        // 该会话已有 agent 在运行，自动重连
        setMessages(prev => {
          const n = [...prev];
          n[streamMsgIdx] = { role: "assistant", content: "⚡ 该会话正在执行中，正在重新连接..." };
          return n;
        });
        connectToStream(sessionId, streamMsgIdx);
        return;
      }

      if (!res.ok) throw new Error("请求失败");
      // agent 已在后台启动，连接到 SSE 流
      connectToStream(sessionId, streamMsgIdx);
    } catch (err) {
      setMessages(prev => {
        const n = [...prev];
        n[streamMsgIdx] = { role: "assistant", content: "⚠️ 豹哥内核连接异常。" };
        return n;
      });
    }
  };

  const handleStop = () => {
    const current = abortRef.current;
    if (current) {
      // 通知服务端停止 agent
      fetch('/api/chat/abort', {
        method: 'POST',
        body: JSON.stringify({ requestId: current.requestId }),
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {});
    }
    // 同时断开 SSE 流
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
    }
  };

  return (
    <main
      className="flex h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const items = Array.from(e.dataTransfer.items);
        if (items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
          const results = await Promise.all(items.map(item => traverseFileTree(item.webkitGetAsEntry!())));
          setAttachedFiles(prev => [...prev, ...results.flat()]);
        } else {
          const files = Array.from(e.dataTransfer.files).map(f => ({ file: f, path: f.name }));
          setAttachedFiles(prev => [...prev, ...files]);
        }
      }}
    >
      {showWizard && configStatus && (
        <ConfigWizard
          configPath={configStatus.configPath}
          onClose={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); refreshConfig(); }}
        />
      )}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-orange-500/20 backdrop-blur-xl border-4 border-dashed border-orange-500 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-bounce"><FolderUp className="w-20 h-20 text-orange-500 mx-auto" /><p className="text-2xl font-black text-white mt-4 uppercase italic tracking-widest">释放以部署资产</p></div>
        </div>
      )}

      {/* 移动端侧边栏遮罩 */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed md:relative inset-y-0 left-0 w-72 bg-[#0d0d0d] border-r border-white/5 flex flex-col p-4 shadow-2xl z-40 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="flex items-center gap-3 px-2 mb-8 mt-2 cursor-pointer" onClick={() => refreshSessions()}><div className="w-10 h-10 bg-orange-500 rounded-md flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20"><LeopardLogo className="w-7 h-7 text-white" /></div><div className="italic tracking-tighter"><h1 className="font-black text-xl leading-tight">BAOGE</h1><p className="text-[9px] text-white/30 font-mono tracking-widest uppercase">Stealth Mode On</p></div></div>
        <button onClick={() => { createNewSession(); setSidebarOpen(false); }} className="flex items-center gap-3 w-full p-4 bg-white/5 border border-white/10 text-white font-bold rounded-lg transition-all hover:bg-white/10 mb-8 active:scale-95"><Plus className="w-5 h-5 text-orange-500" /><span className="text-xs uppercase font-black tracking-widest">New Mission</span></button>
        <div className="flex-1 overflow-y-auto space-y-2 px-1 custom-scrollbar">
          <a href="/skills" className="block px-4 py-3 mb-2 border-b border-white/5 hover:bg-white/5 rounded-md transition-colors" title={loadedSkills.length > 0 ? `已加载: ${loadedSkills.join(', ')}` : undefined}>
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-wider">技能</p>
            <p className="text-sm font-semibold text-orange-500/80 mt-0.5">{skillsCount} 个</p>
            {loadedSkills.length > 0 && <p className="text-[10px] text-white/30 mt-1 truncate">{loadedSkills.join(', ')}</p>}
          </a>
          {sessions.map((s) => (
            <div key={s.id} onClick={() => { switchSession(s.id); setSidebarOpen(false); }} className={`flex items-center gap-3 px-4 py-4 rounded-lg cursor-pointer transition-all border ${sessionId === s.id ? "bg-white/5 text-orange-500 border-orange-500/20" : "bg-transparent text-white/20 border-transparent hover:bg-white/5"}`}>
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="text-sm font-semibold truncate flex-1">{s.title}</span>
              {s.running && <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)] animate-pulse shrink-0" />}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-[#0d0d0d] via-[#0a0a0a] to-[#0d0d0d]">
        {configStatus && !configStatus.configured && (
          <div className="px-4 md:px-10 py-3 bg-orange-500/10 border-b border-orange-500/30 text-[12px] text-orange-200 flex items-center justify-between gap-2 md:gap-4 z-20">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <span className="text-orange-500 font-black uppercase tracking-widest text-[10px] font-mono shrink-0">⚠ 未配置</span>
              <span className="truncate hidden sm:inline">
                请在 <code className="px-1.5 py-0.5 rounded bg-black/40 text-orange-300 font-mono">{configStatus.configPath}</code> 中配置。
              </span>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="shrink-0 px-3 py-1 rounded-md border border-orange-500/40 hover:bg-orange-500/20 font-mono uppercase tracking-wider text-[10px]"
            >
              立即配置
            </button>
          </div>
        )}
        <header className="shrink-0 h-12 md:h-16 flex items-center justify-between px-4 md:px-10 border-b border-white/5 z-20 bg-[#0a0a0a]">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1" onClick={() => setSidebarOpen(true)}><Menu className="w-5 h-5 text-white/40" /></button>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
            <span className="text-[9px] font-bold text-white/30 tracking-[0.4em] uppercase font-mono hidden sm:inline">Terminal Online</span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <a href="/skills" className="text-[10px] text-white/30 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">技能</a>
            <a href="/changelog" className="text-[10px] text-white/30 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider hidden sm:inline">更新日志</a>
            <a href="/debug" className="text-[10px] text-white/30 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">监控</a>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-2 md:px-4 custom-scrollbar">
          <div className="max-w-3xl mx-auto py-6 md:py-16 space-y-6 md:space-y-12 pb-36 md:pb-48">
            {messages.map((m, i) => (m.role === "assistant" && !m.content?.trim()) ? null :
              <div key={i} className={`flex gap-3 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-orange-500/5 border border-orange-500/10 flex items-center justify-center shrink-0 shadow-2xl"><LeopardLogo className="w-5 h-5 md:w-7 md:h-7 text-orange-500" /></div>}
                <div className={`px-3 py-2 md:px-4 md:py-3 rounded-lg max-w-[90%] md:max-w-[85%] border shadow-2xl transition-all duration-500 text-sm md:text-base ${m.role === "user" ? "bg-orange-500 text-black font-medium border-orange-600 rounded-tr-sm" : "bg-white/[0.02] text-white/80 border-white/5 rounded-tl-sm shadow-black"}`}>
                  {m.role === "assistant" && m.toolsUsed && m.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 md:gap-2 mb-2 md:mb-3 pb-2 md:pb-3 border-b border-white/10">
                      <span className="text-[9px] md:text-[10px] text-white/40 font-mono uppercase tracking-wider">本次调用</span>
                      {m.toolsUsed.map((t, j) => (
                        <span key={j} className="px-1.5 md:px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-500 text-[10px] md:text-xs font-mono">{t}</span>
                      ))}
                    </div>
                  )}
                  {m.role === "user" ? (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  ) : (
                    <MarkdownRenderer content={m.content} />
                  )}
                </div>
                {m.role === "user" && <div className="hidden md:flex w-12 h-12 rounded-lg bg-[#111] border border-white/10 items-center justify-center shrink-0 shadow-2xl"><User className="w-6 h-6 text-white/40" /></div>}
              </div>
            )}
            {uploading && (
              <div className="flex gap-3 md:gap-6 animate-pulse">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-orange-500/5 border border-orange-500/10 flex items-center justify-center"><Loader2 className="w-5 h-5 md:w-6 md:h-6 text-orange-500 animate-spin" /></div>
                <div className="flex gap-2 items-center font-mono text-[10px] uppercase text-white/20 tracking-widest">Registering Assets...</div>
              </div>
            )}
            {isLoading && !uploading && messages.length > 0 && !messages[messages.length - 1]?.content?.trim() && (
              <div className="flex gap-3 md:gap-6 animate-pulse">
                <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg bg-orange-500/5 border border-orange-500/10 flex items-center justify-center"><Loader2 className="w-5 h-5 md:w-6 md:h-6 text-orange-500 animate-spin" /></div>
                <div className="flex gap-2 items-center font-mono text-[10px] uppercase text-white/20 tracking-widest">Synthesizing...</div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        <footer className="absolute bottom-0 left-0 right-0 p-3 pb-4 md:p-10 md:pb-14 bg-gradient-to-t from-black via-black/90 to-transparent z-30">
          <div className="max-w-3xl mx-auto relative group">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 md:mb-4 animate-in slide-in-from-bottom-2">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 md:px-3 py-1.5 md:py-2 bg-orange-500/10 border border-orange-500/30 rounded-md text-xs text-orange-500 group/file">
                    <FileIcon className="w-3 h-3" />
                    <span className="truncate max-w-[100px] md:max-w-[150px]">{f.path}</span>
                    <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-white transition-colors"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-stretch gap-2 md:gap-3">
              <textarea className="input-scrollbar flex-1 px-3 py-3 md:px-5 md:py-4 h-16 md:h-24 overflow-y-auto resize-none bg-[#111]/80 backdrop-blur-2xl border-2 border-orange-500/25 focus:border-orange-500/50 rounded-lg outline-none transition-all text-white shadow-2xl placeholder:text-white/10 text-sm md:text-[15px] leading-relaxed align-top" placeholder="请输入指令..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isLoading) handleSend(); } }} rows={2} />
              <input type="file" ref={fileInputRef} multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []).map(f => ({ file: f, path: f.webkitRelativePath || f.name })); setAttachedFiles(prev => [...prev, ...files]); }} />
              <div className="flex flex-col gap-2 shrink-0">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-10 h-10 md:w-11 md:h-11 rounded-md bg-white/10 border border-white/20 text-orange-500 hover:bg-orange-500/20 hover:border-orange-500/30 flex items-center justify-center transition-colors" title="添加附件"><Paperclip className="w-4 h-4 md:w-5 md:h-5" /></button>
                {isLoading && !uploading ? (
                  <button type="button" onClick={handleStop} className="w-10 h-10 md:w-11 md:h-11 bg-red-500/90 text-white rounded-md hover:bg-red-500 active:scale-95 transition-all flex items-center justify-center" title="停止"><Square className="w-4 h-4 md:w-5 md:h-5 fill-current" /></button>
                ) : (
                  <button type="button" onClick={handleSend} disabled={isLoading || uploading} className="w-10 h-10 md:w-11 md:h-11 bg-orange-500 text-black rounded-md hover:bg-orange-400 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40" title="发送"><Send className="w-4 h-4 md:w-5 md:h-5" /></button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
